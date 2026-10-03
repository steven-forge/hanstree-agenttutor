import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { AdminSetup, AdminSnapshot, Edition } from "./types";

export class AdminError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const prefix = "cardnews:{admin}:";
const cookieName = "agenttutor_card_admin";
export function setupStatus(): AdminSetup {
  return {
    auth: (process.env.CARD_NEWS_ADMIN_PASSWORD?.length || 0) >= 16 && (process.env.CARD_NEWS_SIGNING_SECRET?.length || 0) >= 32,
    storage: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    instagram: Boolean(process.env.INSTAGRAM_USER_ID && process.env.INSTAGRAM_ACCESS_TOKEN && process.env.CARD_NEWS_PUBLIC_URL),
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
  if (!setupStatus().auth || !setupStatus().storage) return false;
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  return (await redis("GET", `${prefix}session:${createHash("sha256").update(token).digest("hex")}`)) === "1";
}
export async function requireAdmin() { if (!await isAdmin()) throw new AdminError("관리자 로그인이 필요합니다.", 401); }
export async function login(password: unknown) {
  if (!setupStatus().auth || !setupStatus().storage) throw new AdminError("관리자 인증과 저장소 설정을 먼저 완료해 주세요.", 503);
  const attempts = await redis<number>("EVAL", "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],900) end; return n", 1, `${prefix}login-limit`);
  if (attempts > 20) throw new AdminError("로그인 시도가 많습니다. 15분 뒤 다시 시도해 주세요.", 429);
  if (typeof password !== "string" || password.length > 256 || !equalSecret(password, process.env.CARD_NEWS_ADMIN_PASSWORD!)) throw new AdminError("비밀번호를 확인해 주세요.", 401);
  const token = randomBytes(32).toString("hex");
  await redis("SET", `${prefix}session:${createHash("sha256").update(token).digest("hex")}`, "1", "EX", 28800);
  (await cookies()).set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 28800 });
}
export async function logout() {
  const jar = await cookies(), token = jar.get(cookieName)?.value;
  if (token) await redis("DEL", `${prefix}session:${createHash("sha256").update(token).digest("hex")}`);
  jar.delete(cookieName);
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
