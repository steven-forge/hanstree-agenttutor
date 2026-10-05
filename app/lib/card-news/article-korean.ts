import "server-only";
import { Agent, request, type AgentOptions } from "node:https";
import type { ExtractedArticle } from "./article-extract";

export class ArticleKoreanError extends Error {
  constructor(message: string, readonly retryable = false) { super(message); this.name = "ArticleKoreanError"; }
}
const error = (message: string) => new ArticleKoreanError(message);
const HAS_KOREAN = /[가-힣]/;
const ELLIPSIS = /[\u2026\u22ef]|\.(?:\s*\.){2,}/;
const LANGUAGES = new Set("ko en ja zh fr de es it pt ru uk ar hi vi th id tr nl pl sv da no fi cs el he ro hu".split(" "));
const STOP = new Set("the a an and or of to in on for with by at from as is are was were be been being its it this that these those here there how why what which who new now your you we they our can could will would should has have had into than more most about after over up out not just also but if so such when while all any each other 통해 대한 위한 있는 있다 합니다 밝혔다 이번 해당 관련 이를 것은 수 및 등 의 이 가 을 를 은 는 에 와 과".split(" "));
const compact = (text: string) => text.replace(/\s+/g, " ").trim();
const modelName = (text: string) => text.length <= 60 && /\d/.test(text) && /^[A-Za-z][A-Za-z0-9._+-]*(?: [vV]?\d[A-Za-z0-9._+-]*)?$/.test(text);
function koreanText(text: string) {
  const hangul = text.match(/[가-힣]/g)?.length || 0;
  const letters = text.match(/[A-Za-z가-힣\u3040-\u30ff\u3400-\u9fff]/g)?.length || 1;
  return hangul >= 2 && hangul / letters >= .3;
}
function languageOf(article: ExtractedArticle): string {
  const text = `${article.title}\n${article.body}`;
  if (koreanText(text)) return "ko";
  const declared = article.language?.trim().toLowerCase().split(/[-_]/)[0];
  if (declared && LANGUAGES.has(declared) && declared !== "ko") return declared;
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  const han = text.match(/[\u3400-\u9fff]/g)?.length || 0;
  if (han > 10 && han > (text.match(/[A-Za-z]/g)?.length || 0)) return "zh";
  // Missing metadata is not permission to assume every Latin-script article is English.
  const english = new Set(text.toLowerCase().match(/\b(?:the|and|with|from|that|this|which|have|will|were|their|has|was|are)\b/g) || []);
  if (english.size >= 4 && !/[\u0400-\u052f\u0600-\u06ff\u0900-\u097f]/.test(text)) return "en";
  throw error("원문의 언어를 확인하지 못했습니다. 제목과 내용을 한국어로 직접 정리해 주세요.");
}
function words(text: string, language: string): string[] {
  return Array.from(new Intl.Segmenter(language, { granularity: "word" }).segment(text.toLowerCase()))
    .filter(part => part.isWordLike && part.segment.length >= 2 && !STOP.has(part.segment)).map(part => part.segment);
}
type Sentence = { text: string; index: number; score: number };
function summarySentences(article: ExtractedArticle, language: string): Sentence[] {
  const seen = new Set<string>();
  const sentences = Array.from(new Intl.Segmenter(language, { granularity: "sentence" }).segment(article.body))
    .map((part, index) => ({ text: compact(part.segment), index, score: 0 }))
    .filter(({ text }) => {
      if (text.length < 20 || ELLIPSIS.test(text) || !/[.!?。！？]["'”’»）)\]]*$/.test(text) || seen.has(text)) return false;
      if (/^(?:we(?:['’]re| are)? (?:very )?(?:grateful|thank)|thank you|감사드립니다)/i.test(text)) return false;
      seen.add(text); return true;
    });
  const tokens = sentences.map(sentence => words(sentence.text, language));
  const frequencies = new Map<string, number>();
  for (const list of tokens) for (const word of list) frequencies.set(word, (frequencies.get(word) || 0) + 1);
  const topFrequency = Math.max(1, ...Array.from(frequencies.values()));
  const topic = new Set(words(article.title, language));
  sentences.forEach((sentence, index) => {
    const list = tokens[index];
    // Prefer concrete changes and findings over repeated introductory descriptions.
    const finding = /\b(?:announced|launched|released|found|showed|achieved|failed|mistakes|improved|reduced|increased|outperformed)\b|발표|출시|공개|확인했다|밝혔다|실패|개선|감소|증가/i.test(sentence.text) ? .4 : 0;
    sentence.score = list.reduce((score, word) => score + (frequencies.get(word) || 0) / topFrequency, 0) / Math.max(1, list.length)
      + Math.min(3, new Set(list.filter(word => topic.has(word))).size) * .6 + .2 / (sentence.index + 1) + finding;
  });
  // Whole sentences only. Long sentences cannot be silently clipped to fit a translation request.
  const candidates = sentences.filter(sentence => language === "ko" ? sentence.text.length <= 600 : Buffer.byteLength(sentence.text, "utf8") <= 450)
    .sort((a, b) => b.score - a.score);
  const selected: Sentence[] = [];
  for (const candidate of candidates) {
    const a = new Set(words(candidate.text, language));
    if (selected.some(previous => { const b = new Set(words(previous.text, language)); return Array.from(a).filter(word => b.has(word)).length / Math.max(1, Math.min(a.size, b.size)) > .9; })) continue;
    selected.push(candidate);
    if (selected.length === 3) break;
  }
  if (!selected.length) throw error("의미를 유지하며 요약할 완결된 문장을 찾지 못했습니다. 내용을 직접 정리해 주세요.");
  return selected.sort((a, b) => a.index - b.index);
}

function unescapeText(value: string): string {
  const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (raw, code: string) => {
    if (!code.startsWith("#")) return named[code.toLowerCase()] || raw;
    const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : raw;
  });
}
function significantNumbers(text: string): number[] {
  const multipliers: Record<string, number> = { trillion: 1e12, billion: 1e9, million: 1e6, thousand: 1e3, 조: 1e12, 억: 1e8, 만: 1e4, 천: 1e3 };
  return Array.from(text.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?\s*(?:trillion|billion|million|thousand|조|억|만|천)?/gi)).map(match => {
    const parts = match[0].trim().match(/^([\d,.]+)\s*(.*)$/)!;
    return Number(parts[1].replace(/,/g, "")) * (multipliers[parts[2].toLowerCase()] || 1);
  }).filter(number => number >= 10 || !Number.isInteger(number));
}
function checkedTranslation(payload: unknown, original: string): string {
  if (!payload || typeof payload !== "object") throw error("한국어 번역 응답을 확인하지 못했습니다. 다시 시도해 주세요.");
  const data = payload as { responseStatus?: unknown; quotaFinished?: unknown; responseData?: { translatedText?: unknown } };
  if (data.quotaFinished === true || data.quotaFinished === "true" || data.responseStatus === 429) throw error("번역 서비스의 이용 한도에 도달했습니다. 나중에 다시 시도하거나 한국어로 직접 입력하세요.");
  if (data.responseStatus !== 200 || (data.quotaFinished !== undefined && data.quotaFinished !== false) || typeof data.responseData?.translatedText !== "string") throw error("번역 서비스가 정상 결과를 반환하지 않았습니다. 다시 시도하거나 직접 입력하세요.");
  const value = compact(unescapeText(data.responseData.translatedText));
  if (!/[가-힣]{2,}/.test(value) || value.length < Math.max(2, original.length * .08) || value.length > 2000 || ELLIPSIS.test(value) || /<\/?[a-z][^>]*>/i.test(value) || /^(?:MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID LANGUAGE|NO QUERY|YOU USED ALL AVAILABLE|TRANSLATION NOT FOUND)/i.test(value) || /^(?:번역에 실패했습니다|번역할 수 없습니다|오류가 발생했습니다)[.!]?\s*$/.test(value)) throw error("완전한 한국어 번역을 확인하지 못했습니다. 다시 시도하거나 직접 입력하세요.");
  const translatedNumbers = significantNumbers(value);
  if (significantNumbers(original).some(number => !translatedNumbers.includes(number))) throw error("번역에서 원문의 수치를 확인하지 못했습니다. 내용을 직접 대조해 주세요.");
  return value;
}
async function translate(text: string, language: string, signal: AbortSignal): Promise<string> {
  if (koreanText(text) || modelName(text)) return text;
  if (Buffer.byteLength(text, "utf8") > 450) throw error("제목이 길어 의미를 유지하며 번역할 수 없습니다. 한국어 제목을 직접 입력해 주세요.");
  const url = new URL("https://api.mymemory.translated.net/get");
  url.search = new URLSearchParams({ q: text, langpair: `${language}|ko`, mt: "1" }).toString();
  const agent = new Agent({ keepAlive: false, maxCachedSessions: 0, proxyEnv: {} } as AgentOptions & { proxyEnv: Record<string, string> });
  try {
    const payload = await new Promise<unknown>((resolve, reject) => {
      const req = request(url, { method: "GET", agent, signal, rejectUnauthorized: true, maxHeaderSize: 16 * 1024, headers: { Accept: "application/json", "Accept-Encoding": "identity", "User-Agent": "AgentTutor-Article-Translation/1.0" } }, response => {
        const fail = (failure: Error) => { response.destroy(); req.destroy(); reject(failure); };
        response.on("error", () => reject(new ArticleKoreanError("번역 서비스에 연결하지 못했습니다. 다시 시도해 주세요.", true)));
        if (response.statusCode === 429) { fail(error("번역 서비스의 이용 한도에 도달했습니다. 나중에 다시 시도해 주세요.")); return; }
        if (response.statusCode !== 200) { fail(new ArticleKoreanError("번역 서비스가 응답하지 않았습니다. 다시 시도하거나 직접 입력하세요.", (response.statusCode || 0) >= 500)); return; }
        if ((response.headers["content-encoding"] || "identity").toLowerCase() !== "identity" || Number(response.headers["content-length"]) > 128 * 1024) { fail(error("번역 응답 형식이나 크기를 확인하지 못했습니다.")); return; }
        const chunks: Buffer[] = []; let size = 0;
        response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 128 * 1024) fail(error("번역 응답이 너무 큽니다. 직접 입력해 주세요.")); else chunks.push(chunk); });
        response.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(error("번역 응답을 읽지 못했습니다. 다시 시도해 주세요.")); } });
      });
      req.on("error", () => reject(new ArticleKoreanError("번역 서비스에 연결하지 못했습니다. 다시 시도해 주세요.", true)));
      req.end();
    });
    return checkedTranslation(payload, text);
  } finally { agent.destroy(); }
}

export async function localizeArticle(article: ExtractedArticle): Promise<ExtractedArticle> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 24_000);
  try {
    const language = languageOf(article), title = compact(article.title);
    if (!title || ELLIPSIS.test(title)) throw error("완전한 제목을 확인하지 못했습니다. 한국어 제목을 직접 입력해 주세요.");
    const selected = summarySentences(article, language), inputs = [title, ...selected.map(sentence => sentence.text)], translated: string[] = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < inputs.length) {
        const index = cursor++;
        if (language === "ko" && (koreanText(inputs[index]) || (index === 0 && modelName(inputs[index])))) { translated[index] = inputs[index]; continue; }
        if (language === "ko") throw error("한국어 원문에 번역이 필요한 문장이 섞여 있습니다. 내용을 직접 정리해 주세요.");
        try { translated[index] = await translate(inputs[index], language, controller.signal); }
        catch (caught) {
          if (!(caught instanceof ArticleKoreanError) || !caught.retryable || controller.signal.aborted) throw caught;
          translated[index] = await translate(inputs[index], language, controller.signal);
        }
      }
    };
    await Promise.all([worker(), worker()]);
    if (translated[0].length > 200) throw error("한국어 제목이 200자를 넘습니다. 의미를 유지하며 직접 정리해 주세요.");
    const choices = selected.map((sentence, index) => ({ ...sentence, text: translated[index + 1] })).sort((a, b) => b.score - a.score);
    const kept: Sentence[] = [];
    for (const choice of choices) if ([...kept, choice].map(sentence => sentence.text).join("\n\n").length <= 600) kept.push(choice);
    if (!kept.length) throw error("완결된 한국어 요약이 600자를 넘습니다. 내용을 직접 정리해 주세요.");
    const body = kept.sort((a, b) => a.index - b.index).map(sentence => sentence.text).join("\n\n");
    if (!HAS_KOREAN.test(body)) throw error("한국어 요약을 확인하지 못했습니다. 직접 입력해 주세요.");
    return { ...article, title: translated[0], body, language: "ko" };
  } catch (caught) {
    const timedOut = controller.signal.aborted;
    controller.abort();
    if (timedOut) throw error("한국어 요약과 번역 시간이 초과됐습니다. 잠시 후 다시 시도하거나 직접 입력하세요.");
    if (caught instanceof ArticleKoreanError) throw caught;
    throw error("한국어 요약과 번역을 완료하지 못했습니다. 다시 시도하거나 직접 입력하세요.");
  } finally { clearTimeout(timer); }
}
