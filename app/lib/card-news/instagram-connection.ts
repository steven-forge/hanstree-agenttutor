import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { AdminError, beginOAuthState, commitOAuthConnection, consumeOAuthState, prefix, redis, setupStatus } from "./server";

const key = `${prefix}instagram:connection`;
const MAX_EXPIRES_IN_SECONDS = 400 * 24 * 3600; // long-lived IG tokens are documented as ~60 days; allow generous headroom, reject nonsense
type CheckMeta = {
  username?: string; accountType?: string;
  lastCheckedAt?: string; lastCheckStatus?: "ok" | "error"; lastCheckMessage?: string;
  publishVerifiedAt?: string;
};
type ConnectionRecord = CheckMeta & {
  revision: number; disabled?: boolean; tokenEnc?: string;
  userId?: string; scope?: string;
  obtainedAt?: string; expiresAt?: string;
  // Check results for the env-configured (legacy) token. Bound to a keyed fingerprint of the
  // configured ID+token so they are ignored once the env values change. Never the token itself.
  legacy?: CheckMeta & { fingerprint: string };
};
export type ConnectionView = CheckMeta & {
  missing: string[]; appConfigured: boolean; callbackUrl?: string;
  legacyConfigured: boolean; legacyChanged: boolean;
  stored: boolean; disabled: boolean;
  source: "oauth" | "legacy" | null;
  // "active" only means usable credentials exist on this server. Whether the account was
  // actually reached is reported separately by lastCheckStatus / publishVerifiedAt.
  state: "none" | "disabled" | "active" | "expired" | "unreadable";
  publishReady: boolean;
  userId?: string; scope?: string; obtainedAt?: string; expiresAt?: string;
};
// Resolved once per publish/reconcile/verify operation and passed to every provider call of
// that operation. `token` is non-enumerable so JSON.stringify, spreads and logs never carry it.
export type InstagramCredentials = { readonly token: string; readonly userId: string; readonly source: "oauth" | "legacy"; readonly fingerprint: string };

function derivedKey(label: string): Buffer {
  const secret = process.env.CARD_NEWS_SIGNING_SECRET;
  if (!secret || secret.length < 32) throw new AdminError("설정 저장용 서명 비밀값이 필요합니다.", 503);
  return createHmac("sha256", secret).update(label).digest();
}
function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey("agenttutor-instagram-token-encryption-v1"), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${ciphertext.toString("hex")}`;
}
// Any failure (missing/rotated signing secret, corrupt record) becomes one safe "reconnect" error.
function decrypt(value: string): string {
  try {
    const [ivHex, tagHex, dataHex] = value.split(".");
    if (!ivHex || !tagHex || !dataHex) throw 0;
    const decipher = createDecipheriv("aes-256-gcm", derivedKey("agenttutor-instagram-token-encryption-v1"), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const token = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
    if (!token) throw 0;
    return token;
  } catch { throw new AdminError("저장된 Instagram 연결 정보를 읽을 수 없습니다. 연결 화면에서 다시 연결해 주세요.", 503); }
}
function fingerprint(source: "oauth" | "legacy", userId: string, token: string): string {
  return createHmac("sha256", derivedKey("agenttutor-instagram-credential-fingerprint-v1")).update(`${source}:${userId}:${token}`).digest("hex");
}
function credentials(token: string, userId: string, source: "oauth" | "legacy"): InstagramCredentials {
  return Object.defineProperty({ userId, source, fingerprint: fingerprint(source, userId, token) }, "token", { value: token, enumerable: false }) as InstagramCredentials;
}
export function apiVersion(): string {
  const version = process.env.INSTAGRAM_API_VERSION || "v26.0";
  if (!/^v\d+\.0$/.test(version)) throw new AdminError("인스타그램 연결 설정을 확인해 주세요.", 503);
  return version;
}
async function readRecord(): Promise<ConnectionRecord> {
  if (!setupStatus().storage) return { revision: 0 };
  const raw = await redis<string | null>("GET", key);
  return raw ? (JSON.parse(raw) as ConnectionRecord) : { revision: 0 };
}
// Same revision-gated SET pattern as card drafts: a stale write is rejected instead of
// silently overwriting newer state.
async function writeRecord(next: ConnectionRecord, expected: number): Promise<void> {
  const result = await redis<number>(
    "EVAL",
    "local old=redis.call('GET',KEYS[1]); local rev=0; if old then rev=cjson.decode(old).revision end; if rev~=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); return 1",
    1, key, expected, JSON.stringify({ ...next, revision: expected + 1 }),
  );
  if (result !== 1) throw new AdminError("다른 작업에서 연결 정보가 바뀌었습니다. 새로고침한 뒤 다시 시도하세요.", 409);
}
function callbackUrl(): string {
  const base = process.env.CARD_NEWS_PUBLIC_URL;
  if (!base) throw new AdminError("CARD_NEWS_PUBLIC_URL 설정이 필요합니다.", 503);
  let origin: URL;
  try { origin = new URL(base); } catch { throw new AdminError("CARD_NEWS_PUBLIC_URL 설정을 확인해 주세요.", 503); }
  if (origin.protocol !== "https:" || origin.username || origin.password) throw new AdminError("CARD_NEWS_PUBLIC_URL 설정을 확인해 주세요.", 503);
  return `${origin.origin}/api/admin/news/instagram/callback`;
}
function safeCallbackUrl(): string | undefined { try { return callbackUrl(); } catch { return undefined; } }
function signingReady() { return (process.env.CARD_NEWS_SIGNING_SECRET?.length || 0) >= 32; }
function versionReady() { try { apiVersion(); return true; } catch { return false; } }
// Names only, never values: everything /start needs before it may create pending OAuth state.
function oauthMissing(): string[] {
  const missing: string[] = [];
  if (!setupStatus().storage) missing.push("UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN");
  if (!process.env.INSTAGRAM_APP_ID) missing.push("INSTAGRAM_APP_ID");
  if (!process.env.INSTAGRAM_APP_SECRET) missing.push("INSTAGRAM_APP_SECRET");
  if (!signingReady()) missing.push("CARD_NEWS_SIGNING_SECRET (32자 이상)");
  if (!safeCallbackUrl()) missing.push("CARD_NEWS_PUBLIC_URL (공개 HTTPS 주소)");
  if (!versionReady()) missing.push("INSTAGRAM_API_VERSION (예: v26.0)");
  return missing;
}
function normalizeScope(value: unknown): string {
  const parts = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return parts.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter((v) => /^[a-z_]{1,64}$/.test(v)).slice(0, 20).join(",");
}
async function fetchIdentity(token: string): Promise<{ user_id: string; username: string; account_type: string }> {
  const version = apiVersion();
  let response: Response;
  try {
    response = await fetch(`https://graph.instagram.com/${version}/me?fields=user_id,username,account_type`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000),
    });
  } catch { throw new AdminError("Instagram 계정 정보를 확인하지 못했습니다.", 502); }
  const body = await response.json().catch(() => ({}));
  // The documented /me shape is a bare object, but some callers see it wrapped in data[0]; accept either.
  const data = Array.isArray(body?.data) ? body.data[0] : body;
  const userId = typeof data?.user_id === "number" && Number.isSafeInteger(data.user_id) ? String(data.user_id) : data?.user_id;
  if (!response.ok || typeof userId !== "string" || !/^\d{1,32}$/.test(userId) || typeof data?.username !== "string" || !/^[A-Za-z0-9._]{1,30}$/.test(data.username)) {
    throw new AdminError("Instagram 계정 정보가 올바르지 않습니다. 연결 상태를 확인해 주세요.", 502);
  }
  const accountType = typeof data.account_type === "string" ? data.account_type.toUpperCase() : "";
  if (!["BUSINESS", "MEDIA_CREATOR", "CREATOR"].includes(accountType)) throw new AdminError("Instagram 프로페셔널(비즈니스·크리에이터) 계정만 연결할 수 있습니다.", 502);
  return { user_id: userId, username: data.username, account_type: accountType };
}

export async function startAuthorize(): Promise<string> {
  // Every prerequisite is checked before any pending OAuth state is created.
  if (oauthMissing().length) throw new AdminError("연결에 필요한 서버 설정이 부족합니다. 연결 준비 상태를 확인해 주세요.", 503);
  const redirectUri = callbackUrl();
  const { revision } = await readRecord();
  const state = await beginOAuthState(revision);
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID!, redirect_uri: redirectUri, response_type: "code",
    scope: "instagram_business_basic,instagram_business_content_publish", state,
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

export async function handleCallback(code: string, state: string): Promise<void> {
  const binding = await consumeOAuthState(state);
  let shortLived: { access_token: string; permissions?: unknown };
  try {
    const body = new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID || "", client_secret: process.env.INSTAGRAM_APP_SECRET || "",
      grant_type: "authorization_code", redirect_uri: callbackUrl(), code,
    });
    const response = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
    const data = await response.json().catch(() => ({}));
    const entry = Array.isArray(data?.data) ? data.data[0] : data;
    if (!response.ok || typeof entry?.access_token !== "string" || !entry.access_token) throw 0;
    shortLived = entry;
  } catch { throw new AdminError("Instagram 인증 코드 교환에 실패했습니다.", 502); }

  let longLived: { access_token: string; expires_in: number };
  try {
    const url = new URL("https://graph.instagram.com/access_token");
    url.searchParams.set("grant_type", "ig_exchange_token");
    url.searchParams.set("client_secret", process.env.INSTAGRAM_APP_SECRET || "");
    url.searchParams.set("access_token", shortLived.access_token);
    const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
    const data = await response.json().catch(() => ({}));
    const expiresIn = Number(data.expires_in);
    if (!response.ok || typeof data.access_token !== "string" || !data.access_token || !Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > MAX_EXPIRES_IN_SECONDS) throw 0;
    longLived = { access_token: data.access_token, expires_in: expiresIn };
  } catch { throw new AdminError("Instagram 장기 토큰 교환에 실패했습니다.", 502); }

  // The professional /me user_id is the publishing identity; the app-scoped exchange
  // user_id is a different ID space and must never be compared against it.
  const identity = await fetchIdentity(longLived.access_token);

  // Commit atomically against exactly the session and connection revision captured when the
  // OAuth flow started: a session change or a disconnect/reconnect mid-flow rejects the write.
  const now = new Date().toISOString();
  await commitOAuthConnection(binding, {
    disabled: false, tokenEnc: encrypt(longLived.access_token),
    userId: identity.user_id, username: identity.username, accountType: identity.account_type,
    scope: normalizeScope(shortLived.permissions), obtainedAt: now,
    expiresAt: new Date(Date.now() + longLived.expires_in * 1000).toISOString(),
    lastCheckedAt: now, lastCheckStatus: "ok", lastCheckMessage: "연결하면서 계정 정보를 확인했습니다. 발행 권한은 ‘연결 확인’으로 확인하세요.",
  });
}

function credentialsFrom(record: ConnectionRecord): InstagramCredentials {
  // A local disconnect never silently falls back to the env-configured token.
  if (record.disabled) throw new AdminError("이 사이트의 Instagram 연결이 해제되어 있습니다. 연결 화면에서 다시 연결해 주세요.", 503);
  if (record.tokenEnc) {
    if (!record.expiresAt || !(Date.parse(record.expiresAt) > Date.now())) throw new AdminError("Instagram 연결이 만료되었습니다. 연결 화면에서 다시 연결해 주세요.", 503);
    if (!record.userId || !/^\d+$/.test(record.userId)) throw new AdminError("저장된 Instagram 연결 정보를 읽을 수 없습니다. 연결 화면에서 다시 연결해 주세요.", 503);
    return credentials(decrypt(record.tokenEnc), record.userId, "oauth");
  }
  const userId = process.env.INSTAGRAM_USER_ID, token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (userId && token) {
    if (!/^\d+$/.test(userId)) throw new AdminError("INSTAGRAM_USER_ID 설정을 확인해 주세요.", 503);
    return credentials(token, userId, "legacy");
  }
  throw new AdminError("Instagram 계정 연결을 먼저 설정해 주세요.", 503);
}
export async function resolveCredentials(): Promise<InstagramCredentials> { return credentialsFrom(await readRecord()); }
// Fails when the connection was disconnected, expired, replaced or refreshed since `creds`
// was resolved. Metadata-only writes (연결 확인) keep the fingerprint and do not trip this.
export async function assertCredentialsCurrent(creds: InstagramCredentials): Promise<void> {
  let current: InstagramCredentials | undefined;
  try { current = await resolveCredentials(); } catch { current = undefined; }
  if (current?.fingerprint !== creds.fingerprint) throw new AdminError("작업 도중 Instagram 연결이 바뀌었거나 해제되었습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.", 409);
}
// The live /me identity must equal the ID these credentials were resolved with (OAuth and legacy alike).
export async function verifyIdentity(creds: InstagramCredentials) {
  const identity = await fetchIdentity(creds.token);
  if (identity.user_id !== creds.userId) throw new AdminError("설정된 계정과 실제 인증된 Instagram 계정이 다릅니다. 연결 화면에서 다시 연결하거나 설정을 확인해 주세요.", 502);
  return identity;
}
// content_publishing_limit must return data[0] with a real quota_usage; an empty 200 proves nothing.
function validPublishingLimit(body: any): boolean { // eslint-disable-line @typescript-eslint/no-explicit-any
  const entry = Array.isArray(body?.data) ? body.data[0] : undefined;
  if (!entry || typeof entry !== "object" || body.error) return false;
  if (typeof entry.quota_usage !== "number" || !Number.isFinite(entry.quota_usage) || entry.quota_usage < 0) return false;
  if (entry.config !== undefined) {
    if (!entry.config || typeof entry.config !== "object") return false;
    for (const name of ["quota_total", "quota_duration"]) {
      const value = entry.config[name];
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) return false;
    }
  }
  return true;
}
async function saveCheck(before: ConnectionRecord, creds: InstagramCredentials, check: CheckMeta): Promise<"saved" | "conflict" | "unsaved"> {
  if (!setupStatus().storage) return "unsaved";
  // Explicit undefined in `check` clears stale fields (JSON.stringify drops them).
  const next: ConnectionRecord = creds.source === "oauth" ? { ...before, ...check } : { ...before, legacy: { ...check, fingerprint: creds.fingerprint } };
  try { await writeRecord(next, before.revision); return "saved"; }
  catch (error) { return error instanceof AdminError && error.status === 409 ? "conflict" : "unsaved"; }
}

// Read-only provider checks (/me, content_publishing_limit). Persists only safe metadata;
// the token is never rewritten here, so a failed check cannot erase the connection.
export async function verifyConnection(): Promise<{ ok: boolean; message: string }> {
  const before = await readRecord();
  const creds = credentialsFrom(before);
  const now = new Date().toISOString();
  const finish = async (ok: boolean, message: string, check: CheckMeta) => {
    const saved = await saveCheck(before, creds, { ...check, lastCheckedAt: now, lastCheckStatus: check.lastCheckStatus, lastCheckMessage: message });
    if (saved === "conflict") return { ok: false, message: "확인하는 동안 연결 정보가 바뀌어 이번 확인 결과를 저장하지 않았습니다. 상태를 새로 불러온 뒤 다시 확인하세요." };
    return { ok, message: saved === "saved" ? message : `${message} (이 결과는 서버에 저장되지 않았으며 지금 화면에만 표시됩니다.)` };
  };
  let identity: Awaited<ReturnType<typeof fetchIdentity>>;
  try { identity = await verifyIdentity(creds); }
  catch (error) {
    // Keep the token; record only that the account could not be confirmed and drop the old publish confirmation.
    return finish(false, error instanceof AdminError ? error.message : "Instagram 계정 정보를 확인하지 못했습니다.", { lastCheckStatus: "error", publishVerifiedAt: undefined });
  }
  let publishVerified = false;
  try {
    const response = await fetch(`https://graph.instagram.com/${apiVersion()}/${creds.userId}/content_publishing_limit?fields=quota_usage,config`, {
      headers: { Authorization: `Bearer ${creds.token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000),
    });
    publishVerified = response.ok && validPublishingLimit(await response.json().catch(() => null));
  } catch { /* identity is confirmed; the publish permission stays unconfirmed */ }
  return finish(
    publishVerified,
    publishVerified ? "실제 계정과 발행 권한(콘텐츠 게시 한도 조회)을 확인했습니다." : "실제 계정은 확인했지만 발행 권한은 확인하지 못했습니다. 권한 동의 범위를 확인하거나 다시 연결해 주세요.",
    { username: identity.username, accountType: identity.account_type, lastCheckStatus: "ok", publishVerifiedAt: publishVerified ? now : undefined },
  );
}

export async function refreshToken(): Promise<void> {
  const before = await readRecord();
  if (!before.tokenEnc || before.disabled) throw new AdminError("갱신할 Instagram 연결이 없습니다.", 503);
  if (!before.expiresAt || !(Date.parse(before.expiresAt) > Date.now())) throw new AdminError("연결이 이미 만료되어 갱신할 수 없습니다. ‘다시 연결’을 눌러 주세요.", 409);
  if (!before.obtainedAt || Date.now() - Date.parse(before.obtainedAt) < 24 * 3600000) throw new AdminError("연결·갱신 후 24시간이 지나야 갱신할 수 있습니다.", 409);
  const token = decrypt(before.tokenEnc);
  let refreshed: { access_token: string; expires_in: number };
  try {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.searchParams.set("grant_type", "ig_refresh_token"); url.searchParams.set("access_token", token);
    const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
    const data = await response.json().catch(() => ({}));
    const expiresIn = Number(data.expires_in);
    if (!response.ok || typeof data.access_token !== "string" || !data.access_token || !Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > MAX_EXPIRES_IN_SECONDS) throw 0;
    refreshed = { access_token: data.access_token, expires_in: expiresIn };
  } catch { throw new AdminError("Instagram 연결 갱신에 실패했습니다. 기존 연결은 유지됩니다.", 502); }
  const now = new Date().toISOString();
  // A failed refresh throws above and never reaches here, so the prior token is never erased.
  await writeRecord({ ...before, tokenEnc: encrypt(refreshed.access_token), obtainedAt: now, expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString() }, before.revision);
}

export async function disconnect(): Promise<void> {
  const before = await readRecord();
  // Only a stored record can be disconnected (including expired/unreadable ones). An env-only
  // setup has nothing stored here; disabling it would block publishing with no way back.
  if (!before.tokenEnc) throw new AdminError(before.disabled ? "이미 연결이 해제되어 있습니다." : "이 사이트에 저장된 연결이 없습니다. 고정 토큰 설정은 배포 환경 설정에서 직접 삭제해야 합니다.", 409);
  await writeRecord({ revision: before.revision, disabled: true }, before.revision);
}

// Safe status only: no token, no ciphertext, no fingerprint. One Redis read, no provider call.
export async function connectionView(): Promise<ConnectionView> {
  const record = await readRecord();
  const missing = oauthMissing();
  const legacyId = process.env.INSTAGRAM_USER_ID, legacyToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const legacyConfigured = Boolean(legacyId && legacyToken);
  const base = { missing, appConfigured: !missing.length, callbackUrl: safeCallbackUrl(), legacyConfigured, legacyChanged: false, stored: !!record.tokenEnc, disabled: !!record.disabled };
  const ready = (state: ConnectionView["state"]) => state === "active" && setupStatus().storage && !!base.callbackUrl && signingReady() && versionReady();
  if (record.disabled) return { ...base, source: null, state: "disabled", publishReady: false };
  if (record.tokenEnc) {
    let state: ConnectionView["state"] = "active";
    if (!record.expiresAt || !(Date.parse(record.expiresAt) > Date.now())) state = "expired";
    else { try { credentialsFrom(record); } catch { state = "unreadable"; } }
    return {
      ...base, source: "oauth", state, publishReady: ready(state),
      username: record.username, accountType: record.accountType, userId: record.userId,
      scope: record.scope, obtainedAt: record.obtainedAt, expiresAt: record.expiresAt,
      lastCheckedAt: record.lastCheckedAt, lastCheckStatus: record.lastCheckStatus, lastCheckMessage: record.lastCheckMessage,
      publishVerifiedAt: record.publishVerifiedAt,
    };
  }
  if (!legacyConfigured) return { ...base, source: null, state: "none", publishReady: false };
  let current: string | undefined;
  try { current = /^\d+$/.test(legacyId!) ? fingerprint("legacy", legacyId!, legacyToken!) : undefined; } catch { current = undefined; }
  const state: ConnectionView["state"] = current ? "active" : "unreadable";
  // Stored legacy check results count only while the configured ID+token are unchanged.
  const { fingerprint: checked, ...meta } = record.legacy ?? { fingerprint: undefined };
  const matches = !!current && checked === current;
  return { ...base, ...(matches ? meta : {}), legacyChanged: !!checked && !matches, source: "legacy", state, publishReady: ready(state), userId: current ? legacyId : undefined };
}
