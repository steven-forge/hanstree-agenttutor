import { copyIssues, type CardCopy } from "./copy";
import { candidateUrlKey, exactPublishedTime } from "./manual";

export type WebtoonImage = { src: string; alt: string; width: number; height: number; sha256: string };
export type NewsCandidate = {
  id: string; title: string; summary: string; sourceName: string; sourceUrl: string;
  publishedAt: string; datePrecision: "time" | "day" | "none"; origin: "newsletter" | "archive" | "feed" | "manual" | "release" | "glossary" | "explore";
  newsletterId?: string;
  cardCopy?: CardCopy;
  image?: WebtoonImage;
};
export type NewsCard = {
  candidateId: string; title: string; body: string; sourceUrl: string;
  sourceName: string; publishedAt: string; verified: boolean; verification?: "automatic";
  image?: WebtoonImage;
};
export type FeedStatus = { name: string; status: "ok" | "failed"; count: number; message?: string };
export type Edition = {
  id?: string; explore?: { slug: string; title: string; format?: "webtoon" };
  date: string; revision: number; status: "draft" | "approved" | "publishing" | "published" | "needs_check";
  windowStart: string; windowEnd: string; collectedAt: string;
  candidateSource?: "newsletter";
  candidates: NewsCandidate[]; sources: FeedStatus[]; cards: NewsCard[]; caption: string;
  updatedAt: string; approvedAt?: string; publishedAt?: string;
  automation?: { preparedAt: string; settingsRevision: number; accountId?: string; candidateCount?: number; supplementCount?: number };
  publication?: { attempt: string; children: string[]; containerId?: string; mediaId?: string; permalink?: string; message?: string; publishRequestedAt?: string; accountId?: string; startedAt?: string; stage?: "images" | "carousel" | "processing" | "publish" | "done" };
};
export type PublicationProgress = { edition: Edition | null; checkedAt: string; remoteStatus?: string; remoteCheckedAt?: string; statusError?: string };
export type AdminSetup = { auth: boolean; authIssue?: "password_missing" | "password_length" | "signing_missing" | "signing_length"; storage: boolean; instagram: boolean; scheduler: boolean };
export type AdminSnapshot = { edition: Edition | null; setup: AdminSetup; history: { id?: string; explore?: Edition["explore"]; date: string; status: Edition["status"]; updatedAt: string }[] };

export function editionKey(edition: Pick<Edition, "id" | "date">): string { return edition.id || edition.date; }

export const MAX_CANDIDATES = 1000;
export function isSupplement(candidate: NewsCandidate) { return ["release", "glossary", "explore"].includes(candidate.origin); }
export function usesContentDate(candidate?: NewsCandidate) { return !!candidate && isSupplement(candidate); }
export function candidateTime(candidate: NewsCandidate): number {
  return candidate.datePrecision === "none" ? NaN : exactPublishedTime(candidate.datePrecision === "day" ? `${candidate.publishedAt}T00:00:00+09:00` : candidate.publishedAt);
}
export function cardDateIssue(card: NewsCard, edition: Edition): string {
  const candidate = edition.candidates.find(c => c.id === card.candidateId);
  if (usesContentDate(candidate)) {
    if (card.publishedAt !== candidate!.publishedAt) return "콘텐츠에 기록된 날짜를 그대로 사용해야 합니다.";
    if (candidate!.origin === "glossary" && candidate!.datePrecision === "none" && card.publishedAt === "") return "";
  }
  const time = usesContentDate(candidate) ? candidateTime(candidate!) : exactPublishedTime(card.publishedAt);
  return !Number.isFinite(time) || time < Date.parse(edition.windowStart) || time > Math.min(Date.parse(edition.windowEnd), Date.now()) ? "수집 기간 안의 발행 시각 또는 콘텐츠 날짜를 확인하세요." : "";
}
export function selectableCandidates(edition: Edition) {
  return edition.candidates.filter(c => c.origin === "newsletter" || c.origin === "manual" || isSupplement(c));
}
// Refresh source metadata without losing edited cards, their IDs, or imported/manual backups.
export function preserveDraft(fresh: Edition, old: Edition | null): Edition {
  if (!old) return fresh;
  const manual = old.candidates.filter(c => c.origin === "manual");
  const manualUrls = new Set(manual.map(c => candidateUrlKey(c.sourceUrl))), manualIds = new Set(manual.map(c => c.id));
  const candidates = [...manual, ...fresh.candidates.filter(c => !manualIds.has(c.id) && !manualUrls.has(candidateUrlKey(c.sourceUrl)))];
  const selected = new Set(old.cards.map(c => c.candidateId));
  const retained = old.candidates.filter(c => c.origin !== "manual" && selected.has(c.id));
  const claimed = new Set<number>();
  for (const c of retained) {
    const index = candidates.findIndex(n => n.origin === "newsletter" && candidateUrlKey(n.sourceUrl) === candidateUrlKey(c.sourceUrl));
    if (index >= 0 && !claimed.has(index)) { candidates[index] = { ...candidates[index], id: c.id }; claimed.add(index); }
    else if (!candidates.some(n => n.id === c.id)) candidates.push({ ...c, origin: c.origin === "newsletter" ? "archive" : c.origin, newsletterId: undefined });
  }
  const retainedTimes = [...candidates.filter(c => c.origin === "manual").map(candidateTime), ...old.cards.map(card => {
    const candidate = candidates.find(c => c.id === card.candidateId);
    return usesContentDate(candidate) ? candidateTime(candidate!) : exactPublishedTime(card.publishedAt);
  })].filter(Number.isFinite);
  const windowStart = new Date(Math.min(Date.parse(fresh.windowStart), ...retainedTimes)).toISOString();
  return { ...fresh, windowStart, candidates, cards: old.cards, caption: old.caption };
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
  const issues = card.image ? [] : copyIssues(card);
  if (card.image) {
    const image = card.image;
    if (!/^\/explore\/[a-z0-9-]+-webtoon\.png$/.test(image.src) || typeof image.alt !== "string" || !image.alt.trim() || image.alt.length > 600 || !/^[a-f0-9]{64}$/.test(image.sha256) || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || image.width > 10000 || image.height > 10000) issues.push("등록된 웹툰 원본 정보를 확인하세요.");
    if (!card.title.trim() || card.title.length > 180 || !card.body.trim() || card.body.length > 600) issues.push("웹툰 제목과 설명을 확인하세요.");
  }
  if (!card.verified && (card.image || card.verification !== "automatic")) issues.push("원문·발행일·다른 카드와의 사건 중복을 확인하세요.");
  try { const u = new URL(card.sourceUrl); if (u.protocol !== "https:" || u.username || u.password) throw 0; } catch { issues.push("https 원문 주소가 필요합니다."); }
  return issues;
}
export function editionIssues(edition: Edition): string[] {
  const issues: string[] = [];
  const explore = edition.explore;
  const webtoon = explore?.format === "webtoon";
  const candidateCount = selectableCandidates(edition).length;
  if (explore) {
    if (!/^[a-z0-9-]{1,80}$/.test(explore.slug) || edition.id !== `${edition.date}~${webtoon ? "webtoon" : "explore"}~${explore.slug}` || !explore.title.trim() || (explore.format !== undefined && !webtoon)) issues.push("Explore 문서와 원고 번호를 확인하세요.");
    if (edition.cards.length < (webtoon ? 1 : 2) || edition.cards.length > 10) issues.push(`Explore ${webtoon ? "웹툰은 1" : "카드는 2"}~10장으로 구성하세요. 현재 ${edition.cards.length}장입니다.`);
    edition.cards.forEach((card, i) => {
      const candidate = edition.candidates.find(c => c.id === card.candidateId);
      if (!candidate || candidate.origin !== "explore" || candidate.sourceUrl !== card.sourceUrl || candidate.sourceName !== card.sourceName || candidate.publishedAt !== card.publishedAt) issues.push(`${i + 1}번: 선택한 Explore 문서의 출처와 기록된 날짜를 그대로 사용하세요.`);
      if (webtoon && (!card.image || !candidate?.image || !(["src", "alt", "width", "height", "sha256"] as const).every(key => card.image![key] === candidate.image![key]))) issues.push(`${i + 1}번: 저장된 웹툰 원본을 그대로 사용하세요.`);
    });
  } else if (candidateCount < 10) issues.push(`후보 부족: ${candidateCount}개입니다. 뉴스·보충 콘텐츠를 10개 이상 확보하세요.`);
  if (!webtoon && edition.cards.some(card => card.image)) issues.push("이미지는 웹툰 전용 원고에서만 사용할 수 있습니다.");
  if (webtoon && new Set(edition.cards.map(card => card.image?.src)).size !== edition.cards.length) issues.push("같은 웹툰이 중복 선택됐습니다.");
  edition.cards.forEach((card, i) => {
    if (!selectableCandidates(edition).some(c => c.id === card.candidateId)) issues.push(`${i + 1}번: 이전 원고를 보관 중입니다. 현재 후보에서 다시 선정하세요.`);
  });
  if (!explore && edition.cards.length !== 10) issues.push(`뉴스를 정확히 10개 선정하세요. 현재 ${edition.cards.length}개입니다.`);
  if (new Set(edition.cards.map(c => c.candidateId)).size !== edition.cards.length || (!explore && new Set(edition.cards.map(c => candidateUrlKey(c.sourceUrl))).size !== edition.cards.length)) issues.push("같은 카드 또는 기사가 중복 선택됐습니다.");
  edition.cards.forEach((card, i) => cardIssues(explore ? { ...card, verification: undefined } : card).forEach(issue => issues.push(`${i + 1}번: ${issue}`)));
  edition.cards.forEach((card, i) => {
    const issue = cardDateIssue(card, edition);
    if (issue) issues.push(`${i + 1}번: ${issue}`);
  });
  if (new Set(edition.cards.map(c => c.title.replace(/\s+/g, "").toLowerCase())).size !== edition.cards.length) issues.push("같은 제목의 뉴스가 중복됐습니다.");
  if (!edition.caption.trim() || Array.from(edition.caption).length > 2200) issues.push("캡션을 1~2,200자로 작성하세요.");
  return issues;
}
