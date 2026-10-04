import "server-only";
import { AdminError, redis, setupStatus } from "./card-news/server";
import { bundledNewsPolicy, validateNewsPolicy, type NewsPolicy } from "./news-policy";

const currentKey = "newsletter:{policy}:current";
const historyKey = "newsletter:{policy}:history";
export function policyStorageConfigured() {
  return Boolean(process.env.NEWSLETTER_REDIS_REST_URL || process.env.NEWSLETTER_REDIS_REST_TOKEN) || setupStatus().storage;
}
async function command<T>(...args: (string | number)[]): Promise<T> {
  const dedicated = Boolean(process.env.NEWSLETTER_REDIS_REST_URL || process.env.NEWSLETTER_REDIS_REST_TOKEN);
  if (!dedicated) return redis<T>(...args);
  try {
    if (!process.env.NEWSLETTER_REDIS_REST_URL || !process.env.NEWSLETTER_REDIS_REST_TOKEN) throw 0;
    const url = new URL(process.env.NEWSLETTER_REDIS_REST_URL!);
    if (url.protocol !== "https:" || url.username || url.password) throw 0;
    const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.NEWSLETTER_REDIS_REST_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(args), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw 0;
    const data = await response.json(); if (data.error) throw 0;
    return data.result as T;
  } catch { throw new AdminError("뉴스레터 설정 저장소에 연결하지 못했습니다. 다시 불러와 저장 상태를 확인해 주세요.", 503); }
}
export async function getNewsPolicy(): Promise<NewsPolicy> {
  if (!policyStorageConfigured()) return bundledNewsPolicy;
  const raw = await command<string | null>("GET", currentKey);
  if (raw === null) return bundledNewsPolicy;
  try {
    if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 128 * 1024) throw 0;
    const policy = validateNewsPolicy(JSON.parse(raw));
    if (policy.revision < bundledNewsPolicy.revision) throw 0;
    return policy;
  } catch { throw new AdminError("저장된 뉴스레터 기준을 확인하지 못했습니다. 이전 기준으로 자동 변경하지 않았습니다.", 503); }
}
export async function saveNewsPolicy(input: unknown): Promise<NewsPolicy> {
  if (!policyStorageConfigured()) throw new AdminError("뉴스레터 설정 저장소 연결이 필요합니다. 연결 전에는 수집 기준을 저장할 수 없습니다.", 503);
  let policy: NewsPolicy;
  try { policy = validateNewsPolicy(input); } catch (error) { throw new AdminError(error instanceof Error ? error.message : "설정 값을 확인해 주세요."); }
  const current = await getNewsPolicy();
  if (current.revision >= Number.MAX_SAFE_INTEGER - 1) throw new AdminError("저장 버전의 허용 범위를 초과했습니다.", 409);
  if (current.revision !== policy.revision) throw new AdminError("다른 탭에서 기준을 변경했습니다. 최신 기준을 다시 불러온 뒤 수정해 주세요.", 409);
  let next: NewsPolicy;
  try { next = validateNewsPolicy({ ...policy, revision: current.revision + 1, updated_at: new Date().toISOString() }); }
  catch { throw new AdminError("기준 전체 용량이 너무 큽니다. 채널 주소나 키워드 길이를 줄여 주세요."); }
  const result = await command<number>("EVAL", "local old=redis.call('GET',KEYS[1]); local rev=tonumber(ARGV[3]); if old then rev=cjson.decode(old).revision end; if rev~=tonumber(ARGV[1]) then return 0 end; if old then redis.call('LPUSH',KEYS[2],old); redis.call('LTRIM',KEYS[2],0,19) end; redis.call('SET',KEYS[1],ARGV[2]); return 1", 2, currentKey, historyKey, current.revision, JSON.stringify(next), bundledNewsPolicy.revision);
  if (result !== 1) throw new AdminError("다른 탭에서 기준을 변경했습니다. 최신 기준을 다시 불러와 주세요.", 409);
  return next;
}
