export type NewsCandidate = {
  id: string; title: string; summary: string; sourceName: string; sourceUrl: string;
  publishedAt: string; datePrecision: "time" | "day"; origin: "archive" | "feed" | "manual";
};
export type NewsCard = {
  candidateId: string; title: string; body: string; sourceUrl: string;
  sourceName: string; publishedAt: string; verified: boolean;
};
export type FeedStatus = { name: string; status: "ok" | "failed"; count: number; message?: string };
export type Edition = {
  date: string; revision: number; status: "draft" | "approved" | "publishing" | "published" | "needs_check";
  windowStart: string; windowEnd: string; collectedAt: string;
  candidates: NewsCandidate[]; sources: FeedStatus[]; cards: NewsCard[]; caption: string;
  updatedAt: string; approvedAt?: string; publishedAt?: string;
  publication?: { attempt: string; children: string[]; containerId?: string; mediaId?: string; permalink?: string; message?: string; publishRequestedAt?: string };
};
export type AdminSetup = { auth: boolean; authIssue?: "password_missing" | "password_length" | "signing_missing" | "signing_length"; storage: boolean; instagram: boolean; scheduler: boolean };
export type AdminSnapshot = { edition: Edition | null; setup: AdminSetup; history: { date: string; status: Edition["status"]; updatedAt: string }[] };

export function kstDate(now = new Date()): string { return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10); }
export function editionWindow(date: string) {
  const end = new Date(`${date}T08:00:00+09:00`);
  return { windowStart: new Date(end.getTime() - 86400000).toISOString(), windowEnd: end.toISOString() };
}
export function captionFor(date: string, cards: NewsCard[]) {
  return `AI News 10 · ${date}\n\n${cards.map((c, i) => `${i + 1}. ${c.title.replace(/\n/g, " ")}\n출처: ${c.sourceUrl}`).join("\n\n")}\n\n#AgentTutor #AI뉴스 #인공지능`;
}
export function cardIssues(card: NewsCard): string[] {
  const issues: string[] = [];
  const title = card.title.split("\n"), body = card.body.split("\n");
  if (!card.title.trim() || title.length > 2) issues.push("제목은 1~2줄로 작성하세요.");
  if (!card.body.trim() || body.length > 6) issues.push("본문은 1~6줄로 작성하세요.");
  // Conservative line budget preserves the approved type size without shrinking text.
  const width = (line: string) => Array.from(line).reduce((n, ch) => n + (/[^\u0000-\u007f]/.test(ch) || /[MW@%]/.test(ch) ? 1 : 0.65), 0);
  if (title.some(l => width(l) > 16)) issues.push("제목 한 줄이 너무 깁니다. 줄을 나눠 주세요.");
  if (body.some(l => width(l) > 18)) issues.push("본문 한 줄이 너무 깁니다. 줄을 나눠 주세요.");
  if (!card.verified) issues.push("원문·발행일·다른 카드와의 사건 중복을 확인하세요.");
  try { const u = new URL(card.sourceUrl); if (u.protocol !== "https:" || u.username || u.password) throw 0; } catch { issues.push("https 원문 주소가 필요합니다."); }
  return issues;
}
export function editionIssues(edition: Edition): string[] {
  const issues: string[] = [];
  if (edition.candidates.length < 10) issues.push(`수집 부족: 후보가 ${edition.candidates.length}개입니다. 출처를 추가해 10개 이상 확보하세요.`);
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
