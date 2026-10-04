import defaults from "../../data/news-policy.json";
import registry from "../../data/news-sources.json";

export const OFFICIAL_SOURCES = [
  { id: "openai-news", name: "OpenAI News" }, { id: "google-ai", name: "Google AI" },
  { id: "anthropic-news", name: "Anthropic News" }, { id: "xai-news", name: "xAI News" },
  { id: "claude-dev-blog", name: "Claude.dev Blog" },
];
export const EXTERNAL_SOURCES = registry.sources.map(s => ({ id: s.id, name: s.name, url: s.url, site_url: s.site_url, needsConnection: ["youtube", "x", "reddit"].includes(s.id), custom: false, feed: s.type === "feed" }));
export type SourceRule = { enabled: boolean; independent: boolean; keyword_filter: boolean; max_items: number };
export type CustomSource = { id: string; name: string; url: string; site_url: string };
export type NewsPolicy = {
  schema_version: 3; revision: number; updated_at: string | null;
  collection_interval_hours: number; official_window_days: number; window_hours: number;
  publish: { auto_publish: boolean; official_single_source: boolean; min_independent: number; high_importance_at: number; official_model_high: boolean };
  ai_keywords: string[]; official_sources: Record<string, boolean>; sources: Record<string, SourceRule>;
  custom_sources: CustomSource[];
  source_urls: Record<string, { url: string; site_url: string }>;
  display: { page_size: number; sort: "latest" | "importance" }; daily_target: number;
};
// Public policy responses must never contain private feed credentials or local URLs.
export function channelUrlKey(value: unknown): string {
  const fail = (): never => { throw new Error("채널 주소는 로그인 정보가 없는 공개 HTTPS 주소여야 합니다."); };
  if (typeof value !== "string" || value.length > 2048 || !/^[\x21-\x7e]+$/.test(value) || /[#\\]/.test(value)) return fail();
  const match = /^https:\/\/([A-Za-z0-9.-]+)(?::443)?(?=\/|\?|$)/.exec(value);
  if (!match) return fail();
  const host = match[1].toLowerCase(), labels = host.split("."), suffix = labels.at(-1)!;
  if (host.length > 253 || labels.length < 2 || labels.some(label => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) || !/^[a-z]{2,63}$/.test(suffix) || ["localhost", "local", "localdomain", "internal", "intranet", "lan", "home", "test", "invalid", "example", "onion"].includes(suffix)) return fail();
  let parsed: URL;
  try { parsed = new URL(value); } catch { return fail(); }
  if (parsed.hostname !== host || parsed.username || parsed.password || parsed.port) return fail();
  const privateKeys = new Set(["apikey", "accesskey", "accesstoken", "token", "key", "password", "passwd", "secret", "signature", "auth", "authorization", "code"]);
  parsed.searchParams.forEach((_, key) => { if (privateKeys.has(key.toLowerCase().replace(/[-_]/g, ""))) fail(); });
  const rest = value.slice(match[0].length), queryAt = rest.indexOf("?");
  const path = (queryAt < 0 ? rest : rest.slice(0, queryAt)) || "/", query = queryAt < 0 || queryAt === rest.length - 1 ? "" : rest.slice(queryAt);
  return `https://${host}${path}${query}`;
}
export function externalSources(policy: NewsPolicy) {
  return [...EXTERNAL_SOURCES.filter(s => Object.hasOwn(policy.sources, s.id)).map(s => ({ ...s, ...policy.source_urls[s.id] })), ...policy.custom_sources.map(s => ({ ...s, needsConnection: false, custom: true, feed: true }))];
}
// Authenticated APIs may only use supported read endpoints on their original host.
// In particular, a saved URL must never redirect provider credentials to another host.
export function validateSourceUrl(id: string, value: unknown): string {
  const key = channelUrlKey(value);
  const apiPaths: Record<string, RegExp> = {
    "hacker-news": /^https:\/\/hacker-news\.firebaseio\.com\/v0\/(?:newstories|topstories|beststories|askstories|showstories|jobstories)\.json$/,
    youtube: /^https:\/\/www\.googleapis\.com\/youtube\/v3\/search$/,
    x: /^https:\/\/api\.x\.com\/2\/tweets\/search\/(?:recent|all)$/,
    reddit: /^https:\/\/oauth\.reddit\.com\/r\/[A-Za-z0-9_]{2,21}\/(?:new|hot|top|rising)$/,
  };
  if (apiPaths[id] && (!apiPaths[id].test(key) || (value as string).includes("?"))) throw new Error(`${EXTERNAL_SOURCES.find(s => s.id === id)?.name}의 지원되는 공식 수집 API 주소를 입력해 주세요. 검색 조건이나 인증 정보는 주소에 넣지 않습니다.`);
  return key;
}
export function defaultSourceRule(id: string): SourceRule {
  const source = registry.sources.find(s => s.id === id);
  if (!source) throw new Error("기본 채널을 확인해 주세요.");
  return { enabled: source.enabled, independent: source.independent, keyword_filter: source.keyword_filter ?? false, max_items: source.max_items };
}
export function validateNewsPolicy(value: unknown): NewsPolicy {
  const fail = (name: string): never => { throw new Error(`${name} 설정을 확인해 주세요.`); };
  function object(v: unknown, keys: string[], label: string): Record<string, unknown> {
    if (!v || typeof v !== "object" || Array.isArray(v)) return fail(label);
    const row = v as Record<string, unknown>;
    if (Object.keys(row).length !== keys.length || keys.some(k => !Object.hasOwn(row, k))) return fail(label);
    return row;
  }
  function integer(v: unknown, min: number, max: number, label: string): number {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) return fail(label);
    return v;
  }
  function bool(v: unknown, label: string): boolean { if (typeof v !== "boolean") return fail(label); return v; }
  const version = (value as Record<string, unknown> | null)?.schema_version;
  if (version !== 1 && version !== 2 && version !== 3) fail("지원하는 기준 형식");
  const p = object(value, ["schema_version", "revision", "updated_at", "collection_interval_hours", "official_window_days", "window_hours", "publish", "ai_keywords", "official_sources", "sources", "display", "daily_target", ...(version !== 1 ? ["custom_sources"] : []), ...(version === 3 ? ["source_urls"] : [])], "뉴스레터 기준");
  const revision = integer(p.revision, 0, Number.MAX_SAFE_INTEGER - 1, "저장 버전");
  if (p.updated_at !== null) {
    if (typeof p.updated_at !== "string" || p.updated_at.length > 40 || !/^(?!0000)\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(p.updated_at) || !Number.isFinite(Date.parse(p.updated_at))) fail("저장 시각");
    const date = (p.updated_at as string).slice(0, 10);
    if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) fail("저장 날짜");
  }
  const interval = integer(p.collection_interval_hours, 1, 24, "수집 주기");
  if (![1, 2, 3, 6, 12, 24].includes(interval)) fail("수집 주기");
  const publish = object(p.publish, ["auto_publish", "official_single_source", "min_independent", "high_importance_at", "official_model_high"], "게시 기준");
  const min = integer(publish.min_independent, 1, 8, "게시 최소 매체 수");
  const high = integer(publish.high_importance_at, min, 8, "중요도 높음 매체 수");
  if (!Array.isArray(p.ai_keywords) || !p.ai_keywords.length || p.ai_keywords.length > 100) fail("키워드 1~100개");
  const keywords = (p.ai_keywords as unknown[]).map(k => {
    if (typeof k !== "string" || !k.trim() || k !== k.trim() || k.length > 80 || /[\u0000-\u001f\u007f]/.test(k) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(k)) return fail("키워드 길이와 내용");
    return k;
  });
  if (new Set(keywords.map(k => k.toLowerCase())).size !== keywords.length) fail("중복 키워드");
  const official = object(p.official_sources, OFFICIAL_SOURCES.map(s => s.id), "공식 출처");
  const custom: CustomSource[] = [];
  const sourceUrls: NewsPolicy["source_urls"] = {};
  if (version === 3) {
    if (!p.source_urls || typeof p.source_urls !== "object" || Array.isArray(p.source_urls)) fail("채널 주소");
    for (const [id, urls] of Object.entries(p.source_urls as object)) {
      if (!EXTERNAL_SOURCES.some(s => s.id === id) || !p.sources || !Object.hasOwn(p.sources as object, id)) fail("등록된 기본 채널 주소");
      const row = object(urls, ["url", "site_url"], "채널 주소");
      validateSourceUrl(id, row.url); channelUrlKey(row.site_url);
      sourceUrls[id] = row as NewsPolicy["source_urls"][string];
    }
  }
  const feeds = new Set<string>();
  for (const s of EXTERNAL_SOURCES) {
    const key = validateSourceUrl(s.id, sourceUrls[s.id]?.url ?? s.url);
    if (feeds.has(key)) fail("중복 수집 주소");
    feeds.add(key);
  }
  const ids = new Set(EXTERNAL_SOURCES.map(s => s.id));
  if (version !== 1) {
    if (!Array.isArray(p.custom_sources) || p.custom_sources.length > 20) fail("추가 채널 최대 20개");
    for (const item of p.custom_sources as unknown[]) {
      const s = object(item, ["id", "name", "url", "site_url"], "추가 채널");
      if (typeof s.id !== "string" || !/^custom-[a-f0-9]{32}$/.test(s.id) || ids.has(s.id)) fail("채널 식별자");
      if (typeof s.name !== "string" || !s.name.trim() || s.name !== s.name.trim() || s.name.length > 80 || /[\u0000-\u001f\u007f]/.test(s.name) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s.name)) fail("채널 이름 1~80자");
      const key = channelUrlKey(s.url); channelUrlKey(s.site_url);
      if (feeds.has(key)) fail("중복 RSS 주소 · 기존 기본 채널은 아래에서 다시 추가");
      feeds.add(key); ids.add(s.id as string);
      custom.push(s as CustomSource);
    }
  }
  if (!p.sources || typeof p.sources !== "object" || Array.isArray(p.sources)) fail("외부 출처");
  const sourceIds = Object.keys(p.sources as object);
  if (sourceIds.some(id => !ids.has(id)) || custom.some(s => !Object.hasOwn(p.sources as object, s.id))) fail("등록된 외부 출처");
  if (version === 1 && sourceIds.length !== EXTERNAL_SOURCES.length) fail("기존 외부 출처");
  const sources = object(p.sources, sourceIds, "외부 출처");
  const display = object(p.display, ["page_size", "sort"], "목록 표시");
  if (![10, 20, 30, 50].includes(Number(display.page_size)) || typeof display.page_size !== "number") fail("페이지당 기사 수");
  if (display.sort !== "latest" && display.sort !== "importance") fail("정렬 방식");
  const result: NewsPolicy = {
    schema_version: 3, revision, updated_at: p.updated_at as string | null,
    collection_interval_hours: interval, official_window_days: integer(p.official_window_days, 1, 60, "공식 수집 기간 1~60일"), window_hours: integer(p.window_hours, 1, 168, "외부 수집 기간 1~168시간"),
    publish: { auto_publish: bool(publish.auto_publish, "자동 게시"), official_single_source: bool(publish.official_single_source, "공식 단독 게시"), min_independent: min, high_importance_at: high, official_model_high: bool(publish.official_model_high, "공식 모델 중요도") },
    ai_keywords: keywords,
    official_sources: Object.fromEntries(OFFICIAL_SOURCES.map(s => [s.id, bool(official[s.id], s.name)])),
    custom_sources: custom,
    source_urls: sourceUrls,
    sources: Object.fromEntries([...EXTERNAL_SOURCES, ...custom].filter(s => Object.hasOwn(sources, s.id)).map(s => {
      const rule = object(sources[s.id], ["enabled", "independent", "keyword_filter", "max_items"], s.name);
      return [s.id, { enabled: bool(rule.enabled, s.name), independent: bool(rule.independent, s.name), keyword_filter: bool(rule.keyword_filter, s.name), max_items: integer(rule.max_items, 1, 100, `${s.name} 최대 수집 건수`) }];
    })),
    display: { page_size: display.page_size as number, sort: display.sort as "latest" | "importance" }, daily_target: integer(p.daily_target, 1, 100, "오늘 뉴스 부족 알림 기준"),
  };
  if (new TextEncoder().encode(JSON.stringify(result)).length > 120000) fail("기준 전체 용량");
  return result;
}
export const bundledNewsPolicy = validateNewsPolicy(defaults);
