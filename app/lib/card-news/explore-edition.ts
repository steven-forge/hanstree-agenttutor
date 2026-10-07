import "server-only";
import rawExplore from "../../../data/explore.json";
import { SITE_URL } from "../../today/newsHelpers";
import { CARD_TEXT, fitCardCopy, hasEllipsis, wrapCardText } from "./copy";
import { type Edition, type NewsCandidate, type NewsCard } from "./types";

type ExploreDocument = {
  slug: string; title: string; summary: string; created_at: string; updated_at?: string;
  core_answer?: string; easy_explanation?: string; api_explanation?: string; api_explanation_title?: string;
  details?: string; pitfalls?: string[];
};
const documents = (rawExplore as { docs: ExploreDocument[] }).docs;
export function exploreOptions() {
  return documents.map(({ slug, title, summary, created_at, updated_at }) => ({ slug, title, summary, date: updated_at || created_at }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
const clean = (value: string) => value.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1").replace(/[*`]/g, "").replace(/\s+/g, " ").trim();

// Keep entire sentences, including their qualifications. Oversized sentences remain
// available as editable candidates instead of being cut or completed with invented text.
function paragraphs(text: string): string[] {
  const result: string[] = [];
  for (const paragraph of text.split(/\n\s*\n/).map(clean).filter(Boolean)) {
    let body = "";
    for (const { segment } of Array.from(new Intl.Segmenter("ko", { granularity: "sentence" }).segment(paragraph))) {
      const sentence = segment.trim();
      const next = body ? `${body} ${sentence}` : sentence;
      if (body && wrapCardText(next, CARD_TEXT.body.width).split("\n").length > CARD_TEXT.body.lines) { result.push(body); body = sentence; }
      else body = next;
    }
    if (body) result.push(body);
  }
  return result;
}

export function createExploreEdition(date: string, slug: string): Edition {
  const doc = documents.find(item => item.slug === slug);
  if (!doc) throw new Error("Explore 문서를 찾지 못했습니다.");
  const day = doc.updated_at || doc.created_at;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || day > date) throw new Error("문서의 기록 날짜 이후 판본을 선택하세요.");
  const groups = [
    { title: "핵심 개념", text: doc.core_answer || doc.summary },
    { title: "쉽게 이해하기", text: doc.easy_explanation || "" },
    { title: "관련 개념", text: doc.api_explanation || "" },
    { title: "자세히 알아보기", text: doc.details || "" },
    { title: "주의할 점", text: (doc.pitfalls || []).join("\n\n") },
  ];
  const sourceUrl = `${SITE_URL}/explore/${doc.slug}`;
  const seen = new Set<string>();
  const grouped = groups.map(group => paragraphs(group.text).filter(body => {
    if (seen.has(body)) return false;
    seen.add(body); return true;
  }).map((body, index) => {
    const title = `${group.title} ${index + 1}`;
    const copy = !hasEllipsis(body) && /[.!?]["'”’」』)]*$/.test(body) ? fitCardCopy({ title, body }) : null;
    return { title, body, copy };
  }));
  const candidates: NewsCandidate[] = [];
  const preferred: string[] = [];
  const name = clean(doc.title.split(/[:：]/)[0]);
  for (const group of grouped) {
    let first = true;
    for (const item of group) {
      const id = `explore:${slug}:${candidates.length + 1}`;
      const title = candidates.length === 0 && wrapCardText(name, CARD_TEXT.title.width).split("\n").length <= CARD_TEXT.title.lines ? name : item.title;
      const copy = item.copy && fitCardCopy({ title, body: item.body });
      candidates.push({ id, origin: "explore", title, summary: item.body, sourceName: "AgentTutor · Explore", sourceUrl, publishedAt: day, datePrecision: "day", ...(copy ? { cardCopy: copy } : {}) });
      if (first && item.copy) { preferred.push(id); first = false; }
    }
  }
  const order = [...preferred, ...candidates.filter(c => c.cardCopy && !preferred.includes(c.id)).map(c => c.id)].slice(0, 10);
  const selected = new Set(order);
  const cards: NewsCard[] = candidates.filter(c => selected.has(c.id)).map(c => ({ candidateId: c.id, ...c.cardCopy!, sourceName: c.sourceName, sourceUrl, publishedAt: day, verified: false }));
  const now = new Date().toISOString();
  return {
    id: `${date}~explore~${slug}`, date, explore: { slug, title: doc.title }, revision: 0, status: "draft",
    windowStart: `${day}T00:00:00+09:00`, windowEnd: `${date}T23:59:59.999+09:00`, collectedAt: now, updatedAt: now,
    candidates, cards, sources: [{ name: "AgentTutor · Explore", status: "ok", count: candidates.length }],
    caption: `AgentTutor Explore · ${doc.title}\n\n${sourceUrl}\n\n${cards.map((card, index) => `${index + 1}. ${card.title.replace(/\s+/g, " ")}`).join("\n")}`,
  };
}
