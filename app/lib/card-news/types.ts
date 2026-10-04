import { copyIssues, type CardCopy } from "./copy";

export type NewsCandidate = {
  id: string; title: string; summary: string; sourceName: string; sourceUrl: string;
  publishedAt: string; datePrecision: "time" | "day"; origin: "newsletter" | "archive" | "feed" | "manual";
  newsletterId?: string;
  cardCopy?: CardCopy;
};
export type NewsCard = {
  candidateId: string; title: string; body: string; sourceUrl: string;
  sourceName: string; publishedAt: string; verified: boolean;
};
export type FeedStatus = { name: string; status: "ok" | "failed"; count: number; message?: string };
export type Edition = {
  date: string; revision: number; status: "draft" | "approved" | "publishing" | "published" | "needs_check";
  windowStart: string; windowEnd: string; collectedAt: string;
  candidateSource?: "newsletter";
  candidates: NewsCandidate[]; sources: FeedStatus[]; cards: NewsCard[]; caption: string;
  updatedAt: string; approvedAt?: string; publishedAt?: string;
  publication?: { attempt: string; children: string[]; containerId?: string; mediaId?: string; permalink?: string; message?: string; publishRequestedAt?: string; accountId?: string };
};
export type AdminSetup = { auth: boolean; authIssue?: "password_missing" | "password_length" | "signing_missing" | "signing_length"; storage: boolean; instagram: boolean; scheduler: boolean };
export type AdminSnapshot = { edition: Edition | null; setup: AdminSetup; history: { date: string; status: Edition["status"]; updatedAt: string }[] };

export const MAX_CANDIDATES = 1000;
export function selectableCandidates(edition: Edition) {
  return edition.candidateSource === "newsletter" ? edition.candidates.filter(c => c.origin === "newsletter") : edition.candidates;
}
// Refresh source metadata without losing edited cards, their IDs, or imported/manual backups.
export function preserveDraft(fresh: Edition, old: Edition | null): Edition {
  if (!old) return fresh;
  const candidates = [...fresh.candidates];
  const urlKey = (url: string) => {
    try { const u = new URL(url); u.hash = ""; u.pathname = u.pathname.replace(/\/$/, ""); for (const k of Array.from(u.searchParams.keys())) if (/^(utm_|fbclid|gclid)/.test(k)) u.searchParams.delete(k); return u.toString(); }
    catch { return url; }
  };
  const selected = new Set(old.cards.map(c => c.candidateId));
  const retained = old.candidates.filter(c => c.origin === "manual" || selected.has(c.id))
    .sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)));
  const claimed = new Set<number>();
  for (const c of retained) {
    const index = candidates.findIndex(n => n.origin === "newsletter" && urlKey(n.sourceUrl) === urlKey(c.sourceUrl));
    if (index >= 0 && !claimed.has(index)) { candidates[index] = { ...candidates[index], id: c.id }; claimed.add(index); }
    else if (!candidates.some(n => n.id === c.id)) candidates.push({ ...c, origin: c.origin === "newsletter" ? "archive" : c.origin, newsletterId: undefined });
  }
  return { ...fresh, candidates, cards: old.cards, caption: old.caption };
}

export function kstDate(now = new Date()): string { return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10); }
export function editionWindow(date: string) {
  const end = new Date(`${date}T08:00:00+09:00`);
  return { windowStart: new Date(end.getTime() - 86400000).toISOString(), windowEnd: end.toISOString() };
}
export const CAPTION_INTRO = "AgentTutor가 정리한, 오늘 아침 꼭 읽어야 할 뉴스 10개.";
export function captionFor(cards: NewsCard[], candidates: NewsCandidate[] = []) {
  const normalizeTitle = (title: string) => title.replace(/\s+/g, " ").trim();
  const titles = cards.map((card, index) => {
    const title = normalizeTitle(card.title) || normalizeTitle(candidates.find(candidate => candidate.id === card.candidateId)?.title || "");
    return `${index + 1}. ${title}`;
  });
  return titles.length ? `${CAPTION_INTRO}\n\n${titles.join("\n")}` : CAPTION_INTRO;
}
export function cardIssues(card: NewsCard): string[] {
  const issues = copyIssues(card);
  if (!card.verified) issues.push("원문·발행일·다른 카드와의 사건 중복을 확인하세요.");
  try { const u = new URL(card.sourceUrl); if (u.protocol !== "https:" || u.username || u.password) throw 0; } catch { issues.push("https 원문 주소가 필요합니다."); }
  return issues;
}
export function editionIssues(edition: Edition): string[] {
  const issues: string[] = [];
  const candidateCount = selectableCandidates(edition).length;
  if (candidateCount < 10) issues.push(`후보 부족: ${candidateCount}개입니다. 뉴스레터에 공개된 뉴스를 10개 이상 확보하세요.`);
  if (edition.candidateSource === "newsletter") edition.cards.forEach((card, i) => {
    if (!edition.candidates.some(c => c.id === card.candidateId && c.origin === "newsletter")) issues.push(`${i + 1}번: 이전 원고를 보관 중입니다. 뉴스레터 후보에서 다시 선정하세요.`);
  });
  if (edition.cards.length !== 10) issues.push(`뉴스를 정확히 10개 선정하세요. 현재 ${edition.cards.length}개입니다.`);
  if (new Set(edition.cards.map(c => c.candidateId)).size !== edition.cards.length || new Set(edition.cards.map(c => c.sourceUrl.replace(/[?#].*$/, "").replace(/\/$/, ""))).size !== edition.cards.length) issues.push("같은 기사가 중복 선택됐습니다.");
  edition.cards.forEach((card, i) => cardIssues(card).forEach(issue => issues.push(`${i + 1}번: ${issue}`)));
  edition.cards.forEach((card, i) => {
    const stamp = Date.parse(card.publishedAt);
    if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(card.publishedAt) || !Number.isFinite(stamp) || stamp < Date.parse(edition.windowStart) || stamp > Math.min(Date.parse(edition.windowEnd), Date.now())) issues.push(`${i + 1}번: 수집 기간 안의 정확한 발행시각을 확인하세요.`);
  });
  if (new Set(edition.cards.map(c => c.title.replace(/\s+/g, "").toLowerCase())).size !== edition.cards.length) issues.push("같은 제목의 뉴스가 중복됐습니다.");
  if (!edition.caption.trim() || Array.from(edition.caption).length > 2200) issues.push("캡션을 1~2,200자로 작성하세요.");
  return issues;
}
