import "server-only";
import { todayData, glossaryTerms } from "../../content";
import rawExplore from "../../../data/explore.json";
import { RELEASE_SOURCE_IDS, SITE_URL } from "../../today/newsHelpers";
import { CARD_TEXT, hasEllipsis, wrapCardTitle, type CardCopy } from "./copy";
import { copyFor } from "./auto-copy";
import { exactPublishedTime } from "./manual";
import { kstDate, type NewsCandidate } from "./types";

type ExploreDoc = { slug: string; title: string; summary: string; created_at: string; updated_at?: string };
const clean = (text: string) => text.replace(/`/g, "").replace(/\s+/g, " ").trim();
function validDay(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T00:00:00Z`)) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}
function titleFor(original: string, alternative: string): string | null {
  for (const title of [clean(original), clean(alternative)]) {
    if (title && /[가-힣]/.test(title) && !hasEllipsis(title) && wrapCardTitle(title).split("\n").length <= CARD_TEXT.title.lines) return title;
  }
  return null;
}
// Select only complete sentences, never fragments or a shortened word sequence.
function paragraphCopy(title: string, text: string): CardCopy | null {
  return copyFor({ title, summary: clean(text) }).copy || null;
}
function sourceUrl(value: string): string | null {
  try {
    if (/\s|\\/.test(value)) return null;
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

/** Public, existing content only. Never invent a publishing time or change source data. */
export function supplementCandidates(date: string): NewsCandidate[] {
  if (!validDay(date)) throw new Error("보충 콘텐츠의 판본 날짜를 확인하세요.");
  const now = Date.now(), latestDay = date < kstDate() ? date : kstDate();
  const result: NewsCandidate[] = [];
  for (const article of todayData.articles) {
    if (!RELEASE_SOURCE_IDS.has(article.source_id)) continue;
    const url = sourceUrl(article.source_url);
    if (!url || !article.id || !article.source_name) continue;
    let publishedAt: string, datePrecision: "time" | "day";
    if (article.date_precision === "day" || !article.published_at) {
      const day = article.published_on || article.published_at?.slice(0, 10) || "";
      if (!validDay(day) || day > latestDay) continue;
      publishedAt = day; datePrecision = "day";
    } else {
      const time = exactPublishedTime(article.published_at);
      if (!Number.isFinite(time) || time > now || time > Date.parse(`${date}T23:59:59.999+09:00`)) continue;
      publishedAt = new Date(time).toISOString(); datePrecision = "time";
    }
    const original = article.title_ko || article.title;
    const version = original.match(/\bv?\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?\b/i)?.[0];
    const title = titleFor(original, `${article.source_name}${version ? ` ${version}` : ""}: 변경 정리`);
    if (!title) continue;
    const notes = article.release_notes_ko;
    // Each line is an independent change. A truncated entry cannot disqualify a
    // different complete entry, but no words are cut from an accepted change.
    const entries = [notes?.new_features, notes?.bug_fixes, notes?.chores].flatMap(section => (section || "").split(/\r?\n/)).map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim()).filter(Boolean);
    if (article.summary) entries.push(article.summary);
    if (article.source_summary_ko) entries.push(article.source_summary_ko);
    let copy: CardCopy | null = null;
    for (const entry of entries) { copy = paragraphCopy(title, entry); if (copy) break; }
    if (!copy) continue;
    result.push({ id: `release:${article.id}`, origin: "release", title, summary: clean(copy.body), sourceName: article.source_name, sourceUrl: url, publishedAt, datePrecision, cardCopy: copy });
  }
  // Registration order is the only per-term order available; the file-wide
  // updated_at/reviewed_at must never become a term's publishing timestamp.
  for (const term of [...glossaryTerms].reverse()) {
    if (!term.id || !/^[a-z0-9-]+$/i.test(term.id)) continue;
    const title = titleFor(`${term.term} · ${term.korean} 정리`, `${term.korean}: 핵심 정리`);
    const copy = title && paragraphCopy(title, term.definition);
    if (!title || !copy) continue;
    result.push({ id: `glossary:${term.id}`, origin: "glossary", title, summary: clean(copy.body), sourceName: "AgentTutor · 용어", sourceUrl: `${SITE_URL}/glossary#${term.id}`, publishedAt: "", datePrecision: "none", cardCopy: copy });
  }
  const docs = (rawExplore as unknown as { docs: ExploreDoc[] }).docs;
  for (const doc of docs) {
    if (!doc.slug || !/^[a-z0-9-]+$/i.test(doc.slug)) continue;
    const day = doc.updated_at || doc.created_at;
    if (!validDay(day) || day > latestDay) continue;
    const name = doc.title.split(/[:：]/, 1)[0].trim();
    const title = titleFor(doc.title, `${name}: 핵심 정리`);
    const copy = title && paragraphCopy(title, doc.summary);
    if (!title || !copy) continue;
    result.push({ id: `explore:${doc.slug}`, origin: "explore", title, summary: clean(copy.body), sourceName: "AgentTutor · Explore", sourceUrl: `${SITE_URL}/explore/${doc.slug}`, publishedAt: day, datePrecision: "day", cardCopy: copy });
  }
  return result;
}
