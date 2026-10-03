import defaults from "../../data/news-policy.json";
import registry from "../../data/news-sources.json";

export const OFFICIAL_SOURCES = [
  { id: "openai-news", name: "OpenAI News" }, { id: "google-ai", name: "Google AI" },
  { id: "anthropic-news", name: "Anthropic News" }, { id: "xai-news", name: "xAI News" },
  { id: "claude-dev-blog", name: "Claude.dev Blog" },
];
export const EXTERNAL_SOURCES = registry.sources.map(s => ({ id: s.id, name: s.name, needsConnection: ["youtube", "x", "reddit"].includes(s.id) }));
export type SourceRule = { enabled: boolean; independent: boolean; keyword_filter: boolean; max_items: number };
export type NewsPolicy = {
  schema_version: 1; revision: number; updated_at: string | null;
  collection_interval_hours: number; official_window_days: number; window_hours: number;
  publish: { auto_publish: boolean; official_single_source: boolean; min_independent: number; high_importance_at: number; official_model_high: boolean };
  ai_keywords: string[]; official_sources: Record<string, boolean>; sources: Record<string, SourceRule>;
  display: { page_size: number; sort: "latest" | "importance" }; daily_target: number;
};
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
  const p = object(value, ["schema_version", "revision", "updated_at", "collection_interval_hours", "official_window_days", "window_hours", "publish", "ai_keywords", "official_sources", "sources", "display", "daily_target"], "뉴스레터 기준");
  if (p.schema_version !== 1) fail("지원하는 기준 형식");
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
  const sources = object(p.sources, EXTERNAL_SOURCES.map(s => s.id), "외부 출처");
  const display = object(p.display, ["page_size", "sort"], "목록 표시");
  if (![10, 20, 30, 50].includes(Number(display.page_size)) || typeof display.page_size !== "number") fail("페이지당 기사 수");
  if (display.sort !== "latest" && display.sort !== "importance") fail("정렬 방식");
  return {
    schema_version: 1, revision, updated_at: p.updated_at as string | null,
    collection_interval_hours: interval, official_window_days: integer(p.official_window_days, 1, 60, "공식 수집 기간 1~60일"), window_hours: integer(p.window_hours, 1, 168, "외부 수집 기간 1~168시간"),
    publish: { auto_publish: bool(publish.auto_publish, "자동 게시"), official_single_source: bool(publish.official_single_source, "공식 단독 게시"), min_independent: min, high_importance_at: high, official_model_high: bool(publish.official_model_high, "공식 모델 중요도") },
    ai_keywords: keywords,
    official_sources: Object.fromEntries(OFFICIAL_SOURCES.map(s => [s.id, bool(official[s.id], s.name)])),
    sources: Object.fromEntries(EXTERNAL_SOURCES.map(s => {
      const rule = object(sources[s.id], ["enabled", "independent", "keyword_filter", "max_items"], s.name);
      return [s.id, { enabled: bool(rule.enabled, s.name), independent: bool(rule.independent, s.name), keyword_filter: bool(rule.keyword_filter, s.name), max_items: integer(rule.max_items, 1, 100, `${s.name} 최대 수집 건수`) }];
    })),
    display: { page_size: display.page_size as number, sort: display.sort as "latest" | "importance" }, daily_target: integer(p.daily_target, 1, 100, "오늘 뉴스 부족 알림 기준"),
  };
}
export const bundledNewsPolicy = validateNewsPolicy(defaults);
