import { CARD_TEXT, fitCardCopy, hasEllipsis, wrapCardTitle, type CardCopy } from "./copy";
import { candidateUrlKey, exactPublishedTime } from "./manual";
import { candidateTime, isSupplement, usesContentDate, type NewsCandidate, type NewsCard } from "./types";

export type AutoCopyWindow = 72 | 168 | 336 | 720;
export type AutoCopyExclusion = { candidateId: string; reason: string };
export type AutoCopySelection = { candidateId: string; sourceUrl: string; publishedAt: string; copySource: "prepared" | "summary"; ageHours: number | null };
export type AutoCopyResult = {
  cards: NewsCard[]; selection: AutoCopySelection[]; excluded: AutoCopyExclusion[];
  windowHours: number; maxAgeHours: AutoCopyWindow; eligibleCount: number;
};
export class AutoCopyError extends Error {
  constructor(public readonly result: AutoCopyResult) {
    super(`자동 제작 가능한 뉴스·보충 콘텐츠가 ${result.eligibleCount}/10개입니다. 뉴스 또는 미발행 릴리스·용어·Explore의 완결된 한국어 원고가 더 필요합니다.`);
    this.name = "AutoCopyError";
  }
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const complete = (text: string) => /[.!?]["'”’」』)]*$/.test(text.trim());
const introductionOnly = (text: string) => /(?:알아보|살펴보|확인해\s*보|읽어\s*보)세요|자세히\s*보기/.test(text);
function korean(text: string, minimum: number) {
  const hangul = text.match(/[가-힣]/g)?.length || 0;
  const letters = text.match(new RegExp("\\p{L}", "gu"))?.length || 0;
  return hangul >= minimum && hangul / Math.max(1, letters) >= .2;
}
function usableCopy(copy: CardCopy): CardCopy | null {
  if (!korean(copy.title, 2) || !korean(copy.body, 6) || !complete(copy.body) || introductionOnly(copy.body) || hasEllipsis(copy.title) || hasEllipsis(copy.body)) return null;
  return fitCardCopy(copy);
}
// shortcut: only conservative fixed-wording Korean compression is supported (listed endings/phrases, quoted spans untouched);
// semantic rewriting would need a future AI-summary integration, which does not exist yet.
const END = "(?=[.!?]|$)";
const ACTS = "발표|공개|출시|제공|도입|지원|예상|전망|주장|확대|추진|계획|검토|검증|개발|운영|발견|확인|적용|사용|이용|투자|평가|분석|조사|설명|강조|경고|요구|제안|추가|변경|개선|강화|약속|선언|허용|금지|차단|제한|공유|제출|공급|생산|판매|인수|협력|시작|종료|채택|보고|소개|반박|거부|말";
const COMPRESS_RULES: [RegExp, string][] = [
  [new RegExp(`([았었였겠했됐혔렸졌왔갔봤썼])습니다${END}`, "g"), "$1다"],
  [new RegExp(`하였(?:습니다|다)${END}`, "g"), "했다"],
  [new RegExp(`(것|예정|계획|전망|방침|목표|중|뿐|때문|셈)입니다${END}`, "g"), "$1이다"],
  [new RegExp(`(?<![가-힣])아닙니다${END}`, "g"), "아니다"],
  [new RegExp(`있습니다${END}`, "g"), "있다"],
  [new RegExp(`없습니다${END}`, "g"), "없다"],
  [new RegExp(`(${ACTS})합니다${END}`, "g"), "$1한다"],
  [new RegExp(`됩니다${END}`, "g"), "된다"],
  [new RegExp(`보입니다${END}`, "g"), "보인다"],
  [new RegExp(`높입니다${END}`, "g"), "높인다"],
  [new RegExp(`움직입니다${END}`, "g"), "움직인다"],
  // "<noun>을/를 진행/실시했다" → "<noun>을/를 했다": keeps the object particle, so no adnominal context can break the grammar.
  [new RegExp(`(?<![가-힣])(검토|테스트|발표|분석|평가|조사|협의|논의|개발|도입|투자|시험|검증|점검|실험|설명|교육)(을|를) (?:진행|실시)(했다|한다)${END}`, "g"), "$1$2 $3"],
  [/(?<![가-힣])이러한(?![가-힣])/g, "이런"],
  [/(?<![가-힣])그러한(?![가-힣])/g, "그런"],
];
const QUOTED = new RegExp(String.raw`(“[^”]*”|"[^"]*"|‘[^’]*’|「[^」]*」|『[^』]*』|(?<![\p{L}\p{N}])'[^'\n]+'(?![\p{L}\p{N}]))`, "u");
export function compressKorean(text: string): string {
  // split() with a capture group puts every quoted span at an odd index; those spans are never rewritten.
  return normalize(text).split(QUOTED).map((part, index) => index % 2 ? part : COMPRESS_RULES.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), part)).join("");
}
// Keep a contiguous lead, preserving every word and qualifier in each sentence.
// If the first sentence does not fit, do not substitute a shorter background sentence.
function leadCopy(title: string, summary: string): { copy?: CardCopy; reason?: string } {
  const sentences = Array.from(new Intl.Segmenter("ko", { granularity: "sentence" }).segment(summary), item => item.segment.trim()).filter(Boolean);
  if (sentences.some(sentence => !complete(sentence))) return { reason: "요약에 미완성 문장이 있어 조건이 빠지지 않았는지 확인해야 합니다." };
  let body = "", copy: CardCopy | null = null, kept = 0;
  for (const sentence of sentences) {
    const next = usableCopy({ title, body: body ? `${body} ${sentence}` : sentence });
    if (!next) break;
    body = body ? `${body} ${sentence}` : sentence;
    copy = next; kept++;
  }
  if (sentences.slice(kept).some(sentence => /^(?:다만|하지만|그러나|반면|아직|이 경우|그 대신|단[,\s])/.test(sentence))) return { reason: "후속 조건·제한 문장까지 카드에 담기도록 원고 정리가 필요합니다." };
  return copy ? { copy } : { reason: "첫 핵심 문장을 완결된 한국어 본문 7줄 안에 담을 수 없습니다." };
}
export function copyFor(candidate: Pick<NewsCandidate, "title" | "summary" | "cardCopy">): { copy?: CardCopy; source?: AutoCopySelection["copySource"]; reason?: string } {
  if (candidate.cardCopy) {
    const copy = usableCopy(candidate.cardCopy) || usableCopy({ title: compressKorean(candidate.cardCopy.title), body: compressKorean(candidate.cardCopy.body) });
    if (copy) return { copy, source: "prepared" };
  }
  let title = normalize(candidate.title);
  if (!korean(title, 2)) return { reason: "제목의 한국어 정리가 필요합니다." };
  if (hasEllipsis(title)) return { reason: "제목에 말줄임표가 있습니다." };
  const fits = (text: string) => wrapCardTitle(text).split("\n").length <= CARD_TEXT.title.lines;
  if (!fits(title)) {
    title = compressKorean(title);
    if (!fits(title)) return { reason: "제목 전체가 2줄 안에 들어가지 않습니다." };
  }
  const summary = normalize(candidate.summary);
  if (introductionOnly(summary)) return { reason: "소개·안내 문구 대신 실제 발표 내용을 정리해야 합니다." };
  if (!korean(summary, 6)) return { reason: "본문의 한국어 정리가 필요합니다." };
  if (hasEllipsis(summary)) return { reason: "요약에 말줄임표가 있어 완결된 내용을 확인할 수 없습니다." };
  const plain = leadCopy(title, summary);
  if (plain.copy) return { copy: plain.copy, source: "summary" };
  // Only when the plain lead cannot fit (or would drop a following limitation) try the compressed wording.
  const squeezed = compressKorean(summary);
  const compressed = squeezed === summary ? plain : leadCopy(title, squeezed);
  return compressed.copy ? { copy: compressed.copy, source: "summary" } : { reason: plain.reason };
}
function titleKey(title: string) { return title.normalize("NFKC").toLowerCase().replace(new RegExp("[^\\p{L}\\p{N}]", "gu"), ""); }
function sameEvent(left: string, right: string) {
  const a = titleKey(left), b = titleKey(right);
  if (a === b) return true;
  // Similar wording with different model versions/amounts can describe different events.
  if (JSON.stringify(left.match(/\d+(?:[.,]\d+)*/g) || []) !== JSON.stringify(right.match(/\d+(?:[.,]\d+)*/g) || [])) return false;
  const words = (title: string) => new Set(title.normalize("NFKC").toLowerCase().match(new RegExp("[\\p{L}\\p{N}]{2,}", "gu")) || []);
  const aw = words(left), bw = words(right), common = Array.from(aw).filter(word => bw.has(word)).length;
  if (common >= 3 && common / (aw.size + bw.size - common) >= .8) return true;
  if (Math.min(a.length, b.length) < 12) return false;
  const pairs = (text: string) => new Set(Array.from({ length: text.length - 1 }, (_, i) => text.substring(i, i + 2)));
  const ap = pairs(a), bp = pairs(b), shared = Array.from(ap).filter(pair => bp.has(pair)).length;
  return shared / (ap.size + bp.size - shared) >= .82;
}

/** Pure selection. No fetch, storage, approval, or publication; never marks a human review. */
export function selectAutomaticCards(candidates: NewsCandidate[], previousSourceUrls: string[] = [], now = new Date(), maxAgeHours: AutoCopyWindow = 168, previousCandidateIds: string[] = []): AutoCopyResult {
  if (![72, 168, 336, 720].includes(maxAgeHours) || !Number.isFinite(now.getTime())) throw new Error("자동 제작 기간과 기준 시각을 확인해 주세요.");
  const nowMs = now.getTime(), cutoff = nowMs - maxAgeHours * 3600000;
  const previous = new Set(previousSourceUrls.map(candidateUrlKey).filter(Boolean));
  const publishedIds = new Set(previousCandidateIds);
  const excluded: AutoCopyExclusion[] = [];
  const available: { candidate: NewsCandidate; copy: CardCopy; source: AutoCopySelection["copySource"]; stamp: number; url: string }[] = [];
  for (const candidate of candidates) {
    const reject = (reason: string) => excluded.push({ candidateId: candidate.id, reason });
    if (candidate.origin !== "newsletter" && candidate.origin !== "manual" && !isSupplement(candidate)) { reject("현재 뉴스레터 또는 보충 콘텐츠 후보가 아닙니다."); continue; }
    const url = candidateUrlKey(candidate.sourceUrl);
    if (!candidate.id || !candidate.sourceName.trim() || !url || /\s|\\/.test(candidate.sourceUrl)) { reject("기사 번호·출처 이름·HTTPS 원문 주소를 확인해야 합니다."); continue; }
    if (previous.has(url) || publishedIds.has(candidate.id)) { reject("이전에 게시한 원문 주소 또는 콘텐츠입니다."); continue; }
    const undatedTerm = candidate.origin === "glossary" && candidate.datePrecision === "none" && candidate.publishedAt === "";
    const stamp = usesContentDate(candidate) ? candidateTime(candidate) : candidate.datePrecision === "time" ? exactPublishedTime(candidate.publishedAt) : NaN;
    if (!undatedTerm && !Number.isFinite(stamp)) { reject("뉴스 발행 시각 또는 콘텐츠 날짜를 확인해야 합니다."); continue; }
    if (!undatedTerm && stamp > nowMs) { reject("미래 발행 시각입니다."); continue; }
    if (!undatedTerm && stamp < cutoff) { reject(`최근 ${maxAgeHours / 24}일 범위 밖의 기사입니다.`); continue; }
    const result = copyFor(candidate);
    if (!result.copy || !result.source) { reject(result.reason || "카드용 원고 정리가 필요합니다."); continue; }
    available.push({ candidate, copy: result.copy, source: result.source, stamp: undatedTerm ? 0 : stamp, url });
  }
  // News always comes first. Undated terms retain the catalog's newest-registration order.
  const priority = (c: NewsCandidate) => c.origin === "release" ? 1 : c.origin === "glossary" ? 2 : c.origin === "explore" ? 3 : 0;
  available.sort((a, b) => priority(a.candidate) - priority(b.candidate) || b.stamp - a.stamp);
  const unique: typeof available = [];
  const urls = new Set<string>(), ids = new Set<string>();
  for (const item of available) {
    if (urls.has(item.url) || ids.has(item.candidate.id)) { excluded.push({ candidateId: item.candidate.id, reason: "같은 원문 주소 또는 후보 번호가 중복됩니다." }); continue; }
    if (unique.some(other => sameEvent(item.candidate.title, other.candidate.title) || sameEvent(item.copy.title, other.copy.title))) { excluded.push({ candidateId: item.candidate.id, reason: "이미 선정한 기사와 제목이 매우 유사한 사건입니다." }); continue; }
    urls.add(item.url); ids.add(item.candidate.id); unique.push(item);
  }
  const chosen = unique.slice(0, 10);
  for (const item of unique.slice(10)) excluded.push({ candidateId: item.candidate.id, reason: "더 최근의 제작 가능 기사 10개를 우선 선정했습니다." });
  const selection = chosen.map(item => ({ candidateId: item.candidate.id, sourceUrl: item.candidate.sourceUrl, publishedAt: item.candidate.publishedAt, copySource: item.source, ageHours: item.stamp ? (nowMs - item.stamp) / 3600000 : null }));
  const oldestAge = Math.max(0, ...selection.map(item => item.ageHours ?? 0));
  const result: AutoCopyResult = {
    cards: chosen.map(({ candidate, copy }) => ({ candidateId: candidate.id, ...copy, sourceName: candidate.sourceName, sourceUrl: candidate.sourceUrl, publishedAt: candidate.publishedAt, verified: false })),
    selection, excluded, eligibleCount: unique.length, maxAgeHours,
    windowHours: oldestAge <= 24 ? 24 : oldestAge <= 72 ? 72 : maxAgeHours,
  };
  if (chosen.length !== 10) throw new AutoCopyError(result);
  return result;
}
