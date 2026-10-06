import "server-only";
import { createHash } from "node:crypto";
import { todayData, newsEditorial } from "../../content";
import preparedCopy from "../../../data/card-news-copy.json";
import { fitCardCopy } from "./copy";
import { RELEASE_SOURCE_IDS } from "../../today/newsHelpers";
import { captionFor, preserveDraft, MAX_CANDIDATES, type Edition, type NewsCandidate } from "./types";
import { AdminError } from "./server";

function clean(value: unknown, length: number) {
  return (typeof value === "string" ? value : "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&(?:nbsp|#160);/g, " ").replace(/\s+/g, " ").trim().slice(0, length);
}
export function canonicalUrl(value: unknown) {
  try { const u = new URL(String(value)); if (u.protocol !== "https:" || u.username || u.password) return ""; u.hash = ""; for (const k of Array.from(u.searchParams.keys())) if (/^(utm_|fbclid|gclid)/.test(k)) u.searchParams.delete(k); return u.toString(); } catch { return ""; }
}
function candidate(title: unknown, summary: unknown, url: unknown, sourceName: string, published: unknown, window: Pick<Edition, "windowStart" | "windowEnd">, origin: NewsCandidate["origin"]): NewsCandidate | null {
  const sourceUrl = canonicalUrl(url), text = clean(title, 200);
  let raw = String(published || "").trim();
  if (!sourceUrl || !text || !raw) return null;
  // A server's timezone must never supply a missing publisher timezone.
  if (!/(?:Z|[+-]\d{2}:?\d{2}|\bGMT|\bUTC)$/i.test(raw)) {
    const day = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (!day) return null;
    raw = day;
  }
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const stamp = Date.parse(dayOnly ? `${raw}T00:00:00+09:00` : raw);
  if (!Number.isFinite(stamp)) return null;
  const start = Date.parse(window.windowStart), end = Math.min(Date.parse(window.windowEnd), Date.now());
  // Day-only candidates overlap the window, but must receive an exact time before approval.
  if (stamp > end || (dayOnly ? stamp + 86400000 <= start : stamp < start)) return null;
  return { id: createHash("sha256").update(sourceUrl).digest("hex").slice(0, 24), title: text, summary: clean(summary, 600), sourceName, sourceUrl, publishedAt: dayOnly ? raw : new Date(stamp).toISOString(), datePrecision: dayOnly ? "day" : "time", origin };
}
export async function collectEdition(date: string, old: Edition | null): Promise<Edition> {
  if (old && old.status !== "draft") throw new AdminError("검토 완료 이후에는 수집 목록을 덮어쓰지 않습니다. 원고를 수정·저장해 검토를 해제하세요.", 409);
  // The edition date is the card's publishing date; candidates come from the full newsletter archive.
  const window = { windowStart: "1970-01-01T00:00:00.000Z", windowEnd: new Date(`${date}T23:59:59.999+09:00`).toISOString() };
  const unique = new Map<string, NewsCandidate>();
  for (const a of todayData.articles) {
    if (RELEASE_SOURCE_IDS.has(a.source_id)) continue;
    const published = a.date_precision === "day" ? a.published_on || a.published_at?.slice(0, 10) : a.published_at || a.published_on;
    const c = candidate(a.title_ko || a.title, a.summary || a.source_summary_ko || a.source_summary || a.why_it_matters, a.source_url, a.source_name, published, window, "newsletter");
    if (c && !unique.has(c.sourceUrl)) {
      const sourceHash = createHash("sha256").update(JSON.stringify([c.title, c.summary])).digest("hex").slice(0, 24);
      const prepared = (preparedCopy as Record<string, { sourceHash: string; title: string; body: string }>)[a.id];
      const copy = prepared?.sourceHash === sourceHash ? prepared : { title: c.title, body: newsEditorial.articles?.[a.id]?.reading?.summary_ko || c.summary };
      const cardCopy = fitCardCopy(copy);
      unique.set(c.sourceUrl, { ...c, newsletterId: a.id, ...(cardCopy ? { cardCopy } : {}) });
    }
  }
  const time = (c: NewsCandidate) => Date.parse(c.datePrecision === "day" ? `${c.publishedAt}T00:00:00+09:00` : c.publishedAt);
  const candidates = Array.from(unique.values()).sort((a, b) => time(b) - time(a)).slice(0, MAX_CANDIDATES);
  const earliest = candidates.at(-1);
  if (earliest) window.windowStart = earliest.datePrecision === "day" ? `${earliest.publishedAt}T00:00:00+09:00` : earliest.publishedAt;
  const now = new Date().toISOString();
  const edition = preserveDraft({ date, revision: old?.revision || 0, status: "draft", ...window, candidateSource: "newsletter", collectedAt: now, candidates,
    sources: [{ name: "AgentTutor 뉴스레터", status: "ok", count: candidates.length }], cards: [], caption: captionFor([]), updatedAt: old?.updatedAt || now }, old);
  // Keep manual and selected candidates when trimming the archive to the editor's limit.
  const selected = new Set(edition.cards.map(card => card.candidateId));
  const protectedCandidates = edition.candidates.filter(c => c.origin === "manual" || selected.has(c.id));
  if (protectedCandidates.length > MAX_CANDIDATES) throw new AdminError("보존할 후보가 1,000개를 초과했습니다. 후보를 정리한 뒤 다시 불러오세요.");
  edition.candidates = [...protectedCandidates, ...edition.candidates.filter(c => c.origin !== "manual" && !selected.has(c.id)).slice(0, MAX_CANDIDATES - protectedCandidates.length)];
  return edition;
}
