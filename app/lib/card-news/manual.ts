import { fitCardCopy } from "./copy";
import type { Edition, NewsCandidate } from "./types";

export type ManualCandidateInput = Pick<NewsCandidate, "title" | "summary" | "sourceName" | "sourceUrl" | "publishedAt">;

export function candidateUrlKey(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    // A glossary anchor identifies a distinct term, not a section of one article.
    if (!/^\/glossary\/?$/.test(url.pathname) || !/^#[a-z0-9-]+$/i.test(url.hash)) url.hash = "";
    url.pathname = url.pathname.replace(/\/$/, "");
    for (const key of Array.from(url.searchParams.keys())) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.toString();
  } catch { return ""; }
}

export function exactPublishedTime(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return NaN;
  const [, year, month, day, hour, minute, second = "0", zone] = match;
  const calendar = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== `${year}-${month}-${day}` || +hour > 23 || +minute > 59 || +second > 59 || (zone !== "Z" && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59))) return NaN;
  return Date.parse(value);
}

export function createManualCandidate(input: unknown, date: string, id = `manual-${crypto.randomUUID()}`): NewsCandidate {
  if (!input || typeof input !== "object") throw new Error("직접 등록할 뉴스 내용을 입력하세요.");
  const record = input as Record<string, unknown>;
  const text = (key: keyof ManualCandidateInput, limit: number, label: string) => {
    const value = record[key];
    if (typeof value !== "string" || !value.trim() || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error(`${label}은 1~${limit}자로 입력하세요.`);
    return value.trim();
  };
  const title = text("title", 200, "뉴스 제목"), summary = text("summary", 600, "뉴스 내용"), sourceName = text("sourceName", 100, "출처 이름");
  const sourceUrl = text("sourceUrl", 2048, "원문 주소"), publishedAt = text("publishedAt", 40, "발행시각");
  if (!candidateUrlKey(sourceUrl) || /\s|\\/.test(sourceUrl)) throw new Error("원문 주소는 로그인 정보가 없는 https 주소를 입력하세요.");
  const stamp = exactPublishedTime(publishedAt), end = Date.parse(`${date}T23:59:59.999+09:00`);
  if (!Number.isFinite(stamp) || !Number.isFinite(end)) throw new Error("시간대를 포함한 정확한 발행시각을 입력하세요.");
  if (stamp > Math.min(end, Date.now())) throw new Error("미래 또는 선택한 판본 날짜 이후에 발행된 뉴스는 등록할 수 없습니다.");
  const cardCopy = fitCardCopy({ title, body: summary });
  return { id, title, summary, sourceName, sourceUrl, publishedAt: new Date(stamp).toISOString(), datePrecision: "time", origin: "manual", ...(cardCopy ? { cardCopy } : {}) };
}

export function appendManualCandidate(edition: Edition, input: unknown): Edition {
  if (edition.status !== "draft" && edition.status !== "approved") throw new Error("발행이 시작된 원고에는 뉴스를 등록할 수 없습니다.");
  if (edition.candidates.length >= 1000) throw new Error("후보 목록은 1,000개까지 저장할 수 있습니다.");
  const candidate = createManualCandidate(input, edition.date);
  if (edition.candidates.some(c => candidateUrlKey(c.sourceUrl) === candidateUrlKey(candidate.sourceUrl))) throw new Error("같은 원문 주소의 뉴스가 이미 후보에 있습니다.");
  const start = Math.min(Date.parse(edition.windowStart), Date.parse(candidate.publishedAt));
  return { ...edition, candidateSource: "newsletter", candidates: [candidate, ...edition.candidates], windowStart: new Date(start).toISOString(), windowEnd: new Date(`${edition.date}T23:59:59.999+09:00`).toISOString(), status: "draft", approvedAt: undefined, publication: undefined, automation: undefined };
}
