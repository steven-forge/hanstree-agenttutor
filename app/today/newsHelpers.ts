import type { GlossaryTerm, TodayArticle } from "../content";

export const SITE_URL = "https://hanstree-agenttutor-jgwu.vercel.app";

export const RELEASE_SOURCE_IDS = new Set(["codex-releases", "gemini-releases", "claude-releases", "grok-releases"]);
export const OFFICIAL_NEWS_SOURCE_IDS = new Set(["openai-news", "google-ai", "anthropic-news", "xai-news"]);

/** 실제 존재하는 달력 날짜(YYYY-MM-DD)만 통과시킨다. 2026-02-31 같은 값은 거부한다. */
export function isValidDateParam(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(mo) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

/** 기사의 Asia/Seoul 기준 날짜 키. time 정밀도는 KST 변환, day 정밀도는 published_on을 그대로 쓴다(날짜만 확인). */
export function articleDateKey(article: TodayArticle): string | null {
  if (article.published_on) return article.published_on;
  if (article.published_at) {
    const ms = Date.parse(article.published_at);
    if (isNaN(ms)) return null;
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(ms));
  }
  return null;
}

/** related_glossary_ids 중 실제 존재하는 용어만, 중복 없이 라벨과 함께 반환한다. */
export function resolveGlossaryLinks(
  ids: string[] | undefined,
  glossaryTerms: GlossaryTerm[]
): { id: string; term: string }[] {
  if (!ids || ids.length === 0) return [];
  const byId = new Map(glossaryTerms.map((t) => [t.id, t.term]));
  const seen = new Set<string>();
  const out: { id: string; term: string }[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const term = byId.get(id);
    if (!term) continue;
    seen.add(id);
    out.push({ id, term });
  }
  return out;
}

// XML 1.0에서 허용되지 않는 제어 문자(U+0000-U+0008, U+000B, U+000C, U+000E-U+001F)만 제거한다.
// 탭(U+0009)·LF(U+000A)·CR(U+000D)는 유효하므로 제외한다.
const XML_CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/** RSS 텍스트용 XML 이스케이프. &,<,>,",'와 유효하지 않은 제어 문자를 제거·치환한다. */
export function escapeXml(value: string): string {
  return value
    .replace(XML_CONTROL_CHARS_RE, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 시각이 있는(published_at) 기사만 RFC822 pubDate를 만든다. day 정밀도는 시각을 지어내지 않고 생략한다. */
export function toRfc822(isoString: string | null | undefined): string | null {
  if (!isoString) return null;
  const ms = Date.parse(isoString);
  if (isNaN(ms)) return null;
  return new Date(ms).toUTCString().replace("GMT", "+0000");
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function formatKstTime(isoString: string | null | undefined): string {
  if (!isoString) return "미정";
  try {
    const ms = Date.parse(isoString);
    if (isNaN(ms)) return isoString;
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(new Date(ms)) + " KST";
  } catch {
    return String(isoString);
  }
}

