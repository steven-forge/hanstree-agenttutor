import "server-only";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { AdminSetup, AdminSnapshot, Edition } from "./types";

export class AdminError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const prefix = "cardnews:{admin}:";
const cookieName = "agenttutor_card_admin";
const sessionSeconds = 28800;
let localAttempts = { count: 0, expires: 0 };
let signingKey: { password: string; secret: string; key: Buffer } | undefined;
function sessionSignature(value: string): string {
  const password = process.env.CARD_NEWS_ADMIN_PASSWORD!;
  const secret = process.env.CARD_NEWS_SIGNING_SECRET || "";
  if (signingKey?.password !== password || signingKey?.secret !== secret) {
    // A browser session needs a server secret independent of the login password.
    // The password-only version is used solely to bind opaque Redis sessions.
    const key = secret.length >= 32
      ? createHmac("sha256", secret).update(`agenttutor-card-admin-session-v2:${password}`).digest()
      : scryptSync(password, "agenttutor-card-admin-session-v1", 32);
    signingKey = { password, secret, key };
  }
  return createHmac("sha256", signingKey.key).update(value).digest("hex");
}
function passwordVersion() { return sessionSignature("server-session-v1"); }
export function setupStatus(): AdminSetup {
  const storage = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const passwordLength = process.env.CARD_NEWS_ADMIN_PASSWORD?.length || 0;
  const signingLength = process.env.CARD_NEWS_SIGNING_SECRET?.length || 0;
  const authIssue: AdminSetup["authIssue"] = !passwordLength ? "password_missing"
    : passwordLength < 4 || passwordLength > 256 ? "password_length"
    : !storage && !signingLength ? "signing_missing"
    : !storage && signingLength < 32 ? "signing_length" : undefined;
  return {
    auth: !authIssue,
    authIssue,
    storage,
    instagram: Boolean(process.env.INSTAGRAM_USER_ID && process.env.INSTAGRAM_ACCESS_TOKEN && process.env.CARD_NEWS_PUBLIC_URL && (process.env.CARD_NEWS_SIGNING_SECRET?.length || 0) >= 32),
    scheduler: Boolean(process.env.CARD_NEWS_CRON_SECRET),
  };
}
export function equalSecret(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}
export async function redis<T = unknown>(...command: (string | number)[]): Promise<T> {
  if (!setupStatus().storage) throw new AdminError("저장소 연결을 먼저 설정해 주세요.", 503);
  try {
    const url = new URL(process.env.UPSTASH_REDIS_REST_URL!);
    if (url.protocol !== "https:") throw 0;
    const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(command), cache: "no-store", signal: AbortSignal.timeout(10000), redirect: "error" });
    if (!response.ok) throw 0;
    const data = await response.json();
    if (data.error) throw 0;
    return data.result as T;
  } catch { throw new AdminError("저장소에 연결하지 못했습니다. 연결 설정을 확인한 뒤 다시 시도해 주세요.", 503); }
}
export function validDate(value: unknown): string {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new AdminError("날짜를 다시 선택해 주세요.");
  return value;
}
export async function getEdition(date: string): Promise<Edition | null> {
  const raw = await redis<string | null>("GET", `${prefix}edition:${validDate(date)}`);
  return raw ? JSON.parse(raw) as Edition : null;
}
// Revision and history are committed atomically. Concurrent tabs cannot overwrite or publish twice.
export async function putEdition(edition: Edition, expected: number): Promise<Edition> {
  const next = { ...edition, revision: expected + 1, updatedAt: new Date().toISOString() };
  const result = await redis<number>("EVAL", `local old=redis.call('GET',KEYS[1]); local rev=0; if old then rev=cjson.decode(old).revision end; if rev~=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); redis.call('ZADD',KEYS[2],ARGV[3],ARGV[4]); return 1`, 2, `${prefix}edition:${validDate(edition.date)}`, `${prefix}history`, expected, JSON.stringify(next), Date.parse(next.updatedAt), next.date);
  if (result !== 1) throw new AdminError("다른 작업에서 내용이 바뀌었습니다. 새로고침해 최신 내용을 확인하세요.", 409);
  return next;
}
export async function snapshot(date: string): Promise<AdminSnapshot> {
  const setup = setupStatus();
  if (!setup.storage) return { setup, edition: null, history: [] };
  const dates = await redis<string[]>("ZREVRANGE", `${prefix}history`, 0, 29);
  const history: AdminSnapshot["history"] = [];
  for (const day of dates) { const e = await getEdition(day); if (e) history.push({ date: e.date, status: e.status, updatedAt: e.updatedAt }); }
  return { setup, edition: await getEdition(date), history };
}
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.CARD_NEWS_PUBLIC_URL ? new URL(process.env.CARD_NEWS_PUBLIC_URL).origin : new URL(request.url).origin;
  if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") throw new AdminError("이 사이트에서 다시 로그인한 뒤 실행해 주세요.", 403);
}
export async function isAdmin(): Promise<boolean> {
  if (!setupStatus().auth) return false;
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return false;
  if (setupStatus().storage) {
    if (!/^[a-f0-9]{64}$/.test(token)) return false;
    return (await redis("GET", `${prefix}session:${createHash("sha256").update(token).digest("hex")}`)) === passwordVersion();
  }
  // Browser-only workspaces do not require an external database. The server signs
  // the short-lived cookie; changing the password invalidates every existing one.
  const match = /^(v1\.(\d{10})\.[a-f0-9]{64})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[2]), now = Math.floor(Date.now() / 1000);
  return expires > now && expires <= now + sessionSeconds && equalSecret(match[3], sessionSignature(match[1]));
}
export async function requireAdmin() { if (!await isAdmin()) throw new AdminError("관리자 로그인이 필요합니다.", 401); }
export async function login(password: unknown) {
  if (!setupStatus().auth) throw new AdminError("운영 담당자가 관리자 비밀번호와 로그인 보호 설정을 먼저 등록해야 합니다.", 503);
  let attempts: number;
  if (setupStatus().storage) {
    attempts = await redis<number>("EVAL", "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],900) end; return n", 1, `${prefix}login-limit`);
  } else {
    // Best-effort per-instance limit until the shared store is connected.
    if (Date.now() >= localAttempts.expires) localAttempts = { count: 0, expires: Date.now() + 900000 };
    attempts = ++localAttempts.count;
  }
  if (attempts > 20) throw new AdminError("로그인 시도가 많습니다. 15분 뒤 다시 시도해 주세요.", 429);
  if (typeof password !== "string" || password.length > 256 || !equalSecret(password, process.env.CARD_NEWS_ADMIN_PASSWORD!)) throw new AdminError("비밀번호를 확인해 주세요.", 401);
  let token = randomBytes(32).toString("hex");
  if (setupStatus().storage) {
    await redis("SET", `${prefix}session:${createHash("sha256").update(token).digest("hex")}`, passwordVersion(), "EX", sessionSeconds);
  } else {
    const value = `v1.${Math.floor(Date.now() / 1000) + sessionSeconds}.${token}`;
    token = `${value}.${sessionSignature(value)}`;
  }
  (await cookies()).set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: sessionSeconds });
}
export async function logout() {
  const jar = await cookies(), token = jar.get(cookieName)?.value;
  try {
    if (setupStatus().storage && token && /^[a-f0-9]{64}$/.test(token)) await redis("DEL", `${prefix}session:${createHash("sha256").update(token).digest("hex")}`);
  } finally { jar.delete(cookieName); }
}
export function signAsset(date: string, attempt: string, index: number, expires: number) {
  const secret = process.env.CARD_NEWS_SIGNING_SECRET;
  if (!secret || secret.length < 32) throw new AdminError("이미지 배포 서명 설정이 필요합니다.", 503);
  return createHmac("sha256", secret).update(`${date}:${attempt}:${index}:${expires}`).digest("hex");
}
export async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new AdminError("요청 내용이 없습니다.");
  const parts: Uint8Array[] = []; let total = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > 500000) { await reader.cancel(); throw new AdminError("원고 용량이 너무 큽니다.", 413); } parts.push(value); }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { throw new AdminError("입력 형식을 확인해 주세요."); }
}
