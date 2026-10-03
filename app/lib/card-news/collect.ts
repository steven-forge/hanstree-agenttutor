import "server-only";
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import archive from "../../../data/today.json";
import sourceConfig from "../../../data/news-sources.json";
import type { TodayArticle } from "../../content";
import { editionWindow, type Edition, type NewsCandidate, type FeedStatus } from "./types";
import { AdminError } from "./server";

type Feed = { name: string; url: string; hosts: string[]; keyword_filter?: boolean };
const feeds: Feed[] = [
  { name: "AI타임스", url: "https://www.aitimes.com/rss/allArticle.xml", hosts: ["www.aitimes.com"] },
  { name: "OpenAI", url: "https://openai.com/news/rss.xml", hosts: ["openai.com"] },
  { name: "Google AI", url: "https://blog.google/innovation-and-ai/technology/ai/rss/", hosts: ["blog.google"] },
  { name: "NVIDIA", url: "https://blogs.nvidia.com/feed/", hosts: ["blogs.nvidia.com"] },
  ...sourceConfig.sources.filter(s => s.enabled && s.type === "feed").map(s => ({ name: s.name, url: s.url, hosts: s.hosts, keyword_filter: "keyword_filter" in s ? Boolean(s.keyword_filter) : false })),
];
const parser = new XMLParser({ ignoreAttributes: false, processEntities: false, htmlEntities: false });
function clean(value: unknown, length: number) {
  return (typeof value === "string" ? value : "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&(?:nbsp|#160);/g, " ").replace(/\s+/g, " ").trim().slice(0, length);
}
export function canonicalUrl(value: unknown) {
  try { const u = new URL(String(value)); if (u.protocol !== "https:" || u.username || u.password) return ""; u.hash = ""; for (const k of Array.from(u.searchParams.keys())) if (/^(utm_|fbclid|gclid)/.test(k)) u.searchParams.delete(k); return u.toString(); } catch { return ""; }
}
async function feedText(feed: Feed) {
  let current = feed.url;
  const deadline = AbortSignal.timeout(11000);
  for (let redirect = 0; redirect < 3; redirect++) {
    const u = new URL(current);
    if (u.protocol !== "https:" || !feed.hosts.includes(u.hostname)) throw new Error("출처 이동 주소 확인 필요");
    const r = await fetch(u, { cache: "no-store", redirect: "manual", signal: deadline, headers: { "User-Agent": "AgentTutor-CardNews/1.0", Accept: "application/rss+xml, application/atom+xml, application/xml" } });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { current = new URL(r.headers.get("location")!, u).toString(); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const reader = r.body!.getReader(); const parts: Uint8Array[] = []; let size = 0;
    while (true) { const v = await reader.read(); if (v.done) break; size += v.value.byteLength; if (size > 2500000) { await reader.cancel(); throw new Error("출처 응답 용량 초과"); } parts.push(v.value); }
    return Buffer.concat(parts).toString("utf8");
  }
  throw new Error("출처 이동 횟수 초과");
}
function candidate(title: unknown, summary: unknown, url: unknown, sourceName: string, published: unknown, window: ReturnType<typeof editionWindow>, origin: NewsCandidate["origin"]): NewsCandidate | null {
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
  const window = editionWindow(date), candidates: NewsCandidate[] = [], sources: FeedStatus[] = [];
  for (const a of archive.articles as TodayArticle[]) {
    const c = candidate(a.title_ko || a.title, a.source_summary_ko || a.summary || a.why_it_matters, a.source_url, a.source_name, a.published_at || a.published_on, window, "archive");
    if (c && !a.source_id.endsWith("-releases")) candidates.push(c);
  }
  sources.push({ name: "AgentTutor 기존 기사", status: "ok", count: candidates.length });
  // Small batches keep memory and upstream request pressure bounded.
  for (let start = 0; start < feeds.length; start += 4) {
    const results = await Promise.allSettled(feeds.slice(start, start + 4).map(async feed => {
      const xml = await feedText(feed);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("지원하지 않는 XML 선언");
      const data = parser.parse(xml);
      const raw = data.rss?.channel?.item || data.feed?.entry;
      if (!raw) throw new Error("뉴스 피드를 읽을 수 없음");
      const items = Array.isArray(raw) ? raw : [raw]; const found: NewsCandidate[] = [];
      for (const row of items.slice(0, 100)) {
        const title = typeof row.title === "object" ? row.title["#text"] : row.title;
        const link = typeof row.link === "string" ? row.link : Array.isArray(row.link) ? row.link.find((l: Record<string, string>) => !l["@_rel"] || l["@_rel"] === "alternate")?.["@_href"] : row.link?.["@_href"];
        const summary = row.description || row.summary || "";
        if (feed.keyword_filter && !/\bAI\b|artificial intelligence|인공지능|생성형|OpenAI|Anthropic|Claude|Gemini|LLM/i.test(`${title} ${summary}`)) continue;
        const c = candidate(title, summary, link, feed.name, row.pubDate || row.published || row["dc:date"], window, "feed");
        if (c) found.push(c);
      }
      return { name: feed.name, found };
    }));
    results.forEach((r, i) => { if (r.status === "fulfilled") { candidates.push(...r.value.found); sources.push({ name: r.value.name, status: "ok", count: r.value.found.length }); } else sources.push({ name: feeds[start + i].name, status: "failed", count: 0, message: r.reason instanceof Error && /^HTTP \d{3}$/.test(r.reason.message) ? r.reason.message : "응답 실패 — 원문 사이트에서 확인하거나 다른 출처를 추가하세요." }); });
  }
  const unique = new Map<string, NewsCandidate>();
  for (const c of candidates) if (!unique.has(c.sourceUrl)) unique.set(c.sourceUrl, c);
  // Keep the candidate behind every edited/selected card and every manual addition.
  const preserved = (old?.candidates || []).filter(c => c.origin === "manual" || old?.cards.some(card => card.candidateId === c.id));
  for (const c of preserved) unique.set(c.sourceUrl, c);
  const list = Array.from(unique.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const keep = new Set(preserved.map(c => c.id));
  const bounded = [...list.filter(c => keep.has(c.id)), ...list.filter(c => !keep.has(c.id))].slice(0, 200);
  return { date, revision: old?.revision || 0, status: "draft", ...window, collectedAt: new Date().toISOString(), candidates: bounded, sources, cards: old?.cards || [], caption: old?.caption || "", updatedAt: old?.updatedAt || new Date().toISOString() };
}
