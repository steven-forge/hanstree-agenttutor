"use client";
import { zipSync, strToU8 } from "fflate";
import { CARD_LAYOUT, CARD_SOURCE, cardBodyTop, cardSourceLines } from "./copy";
import { editionIssues, editionWindow, cardIssues, preserveDraft, MAX_CANDIDATES, type AdminSnapshot, type Edition } from "./types";
import { appendManualCandidate, candidateUrlKey, createManualCandidate } from "./manual";

const key = "agenttutor-card-news-v1:";
const setup = { auth: true, storage: false, instagram: false, scheduler: false };
async function requireSession() {
  const response = await fetch("/api/admin/news?session=1", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error(response.status === 401 ? "로그인이 만료됐습니다. 다시 로그인해 주세요. 저장된 원고는 유지됩니다." : "로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}
function read(date: string): Edition | null {
  const raw = localStorage.getItem(key + date);
  return raw ? JSON.parse(raw) as Edition : null;
}
export async function localSnapshot(date: string): Promise<AdminSnapshot> {
  await requireSession();
  const history: AdminSnapshot["history"] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const name = localStorage.key(i)!; if (!name.startsWith(key)) continue;
    try { const e = read(name.slice(key.length)); if (e) history.push({ date: e.date, status: e.status, updatedAt: e.updatedAt }); } catch { /* A damaged unrelated day does not hide the current draft. */ }
  }
  return { edition: read(date), setup, history: history.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30) };
}
export async function localAction(body: Record<string, unknown>): Promise<AdminSnapshot> {
  await requireSession();
  if (!navigator.locks) throw new Error("탭 간 원고 보호를 지원하는 최신 브라우저에서 열어 주세요.");
  return navigator.locks.request(`${key}${String(body.date)}`, () => lockedAction(body));
}
async function newsletterEdition(date: string): Promise<Edition> {
  const response = await fetch(`/api/card-news-candidates?date=${date}`, { cache: "no-store" });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "뉴스레터를 가져오지 못했습니다.");
  return data.edition as Edition;
}
async function editedLocalEdition(old: Edition, body: Record<string, unknown>): Promise<Edition> {
  if (old.status !== "draft" && old.status !== "approved") throw new Error("발행이 시작된 원고는 수정할 수 없습니다.");
  if (!Array.isArray(body.cards) || body.cards.length > 10 || typeof body.caption !== "string" || body.caption.length > 5000) throw new Error("카드 원고의 형식을 확인하세요.");
  const input = body.candidates === undefined ? old.candidates : body.candidates;
  if (!Array.isArray(input) || input.length > MAX_CANDIDATES) throw new Error("후보 목록은 1,000개까지 저장할 수 있습니다.");
  // Keep manual metadata; refreshed newsletter copy must come from the authenticated source API.
  const latest = old.candidateSource === "newsletter" ? (await newsletterEdition(old.date)).candidates : [];
  const candidates = input.map(c => {
    if (!c || typeof c.id !== "string" || !c.id || c.id.length > 100 || typeof c.sourceUrl !== "string") throw new Error("후보 기록의 형식을 확인하세요.");
    const existing = old.candidates.find(n => n.id === c.id);
    if (existing?.origin === "manual") return existing;
    const current = latest.find(n => candidateUrlKey(n.sourceUrl) === candidateUrlKey(existing?.sourceUrl || c.sourceUrl));
    if (!current && !existing) throw new Error("새 뉴스는 직접 등록 기능으로 추가하세요.");
    return current ? { ...current, id: c.id } : existing!;
  });
  for (const candidate of old.candidates) if (candidate.origin === "manual" && !candidates.some(c => c.id === candidate.id)) candidates.push(candidate);
  if (candidates.length > MAX_CANDIDATES || new Set(candidates.map(c => c.id)).size !== candidates.length) throw new Error("후보 목록의 개수 또는 중복 번호를 확인하세요.");
  for (const card of body.cards) if (!card || typeof card.candidateId !== "string" || !candidates.some(c => c.id === card.candidateId) || typeof card.title !== "string" || card.title.length > 180 || typeof card.body !== "string" || card.body.length > 600 || typeof card.sourceName !== "string" || card.sourceName.length > 100 || typeof card.sourceUrl !== "string" || !candidateUrlKey(card.sourceUrl) || typeof card.publishedAt !== "string" || card.publishedAt.length > 40) throw new Error("카드 원고의 형식을 확인하세요.");
  return { ...old, candidates, cards: body.cards as Edition["cards"], caption: body.caption, status: "draft", approvedAt: undefined, publication: undefined };
}
async function lockedAction(body: Record<string, unknown>): Promise<AdminSnapshot> {
  const date = String(body.date), old = read(date);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date)) throw new Error("날짜를 확인하세요.");
  if (body.revision !== (old?.revision || 0)) throw new Error("다른 탭에서 수정했습니다. 새로고침해 주세요.");
  let edition: Edition;
  if (body.action === "collect") {
    if (old && old.status !== "draft") throw new Error("원고를 수정·저장해 검토를 해제한 뒤 다시 수집하세요.");
    edition = preserveDraft(await newsletterEdition(date), old);
  } else if (body.action === "add_manual") {
    let base = old || await newsletterEdition(date);
    if (old && (body.cards !== undefined || body.candidates !== undefined || body.caption !== undefined)) base = await editedLocalEdition(old, body);
    edition = appendManualCandidate(base, body.candidate);
  } else if (body.action === "import") {
    if (old && !["draft", "approved"].includes(old.status)) throw new Error("발행이 시작된 원고는 복원으로 바꿀 수 없습니다.");
    const incoming = body.edition as Edition;
    if (!incoming || incoming.date !== date || !Array.isArray(incoming.cards) || incoming.cards.length > 10 || !Array.isArray(incoming.candidates) || incoming.candidates.length > MAX_CANDIDATES || typeof incoming.caption !== "string" || incoming.caption.length > 5000) throw new Error("이 날짜의 카드뉴스 원고 JSON을 선택하세요.");
    const text = (value: unknown, limit: number) => typeof value === "string" && value.length <= limit;
    const url = (value: unknown) => { try { const u = new URL(String(value)); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; } };
    for (const c of incoming.candidates) if (!c || !text(c.id, 100) || !text(c.title, 200) || !text(c.summary, 600) || !text(c.sourceName, 100) || !url(c.sourceUrl) || !text(c.publishedAt, 40)) throw new Error("후보 기록의 형식을 확인하세요.");
    for (const c of incoming.cards) if (!c || !text(c.candidateId, 100) || !text(c.title, 180) || !text(c.body, 600) || !text(c.sourceName, 100) || !url(c.sourceUrl) || !text(c.publishedAt, 40) || !incoming.candidates.some(n => n.id === c.candidateId)) throw new Error("카드 원고의 형식을 확인하세요.");
    if (incoming.candidates.some(c => !c.id.trim()) || new Set(incoming.candidates.map(c => c.id)).size !== incoming.candidates.length) throw new Error("후보 번호가 비어 있거나 중복됐습니다.");
    const candidates = incoming.candidates.map(c => c.origin === "manual" ? createManualCandidate(c, date, c.id) : ({ id: c.id, title: c.title, summary: c.summary, sourceName: c.sourceName, sourceUrl: c.sourceUrl, publishedAt: c.publishedAt, origin: c.origin === "newsletter" ? "newsletter" as const : "archive" as const, datePrecision: c.datePrecision === "time" ? "time" as const : "day" as const }));
    edition = { date, revision: 0, status: "draft", ...editionWindow(date), collectedAt: "", candidates, sources: [], cards: incoming.cards.map(c => ({ candidateId: c.candidateId, title: c.title, body: c.body, sourceName: c.sourceName, sourceUrl: c.sourceUrl, publishedAt: c.publishedAt, verified: false })), caption: incoming.caption, updatedAt: "" };
    edition = preserveDraft(await newsletterEdition(date), edition);
  } else if (body.action === "save" && old) {
    edition = await editedLocalEdition(old, body);
  } else if (body.action === "approve" && old) {
    const issues = editionIssues(old); if (issues.length) throw new Error(issues[0]);
    for (const card of old.cards) await cardBlob(card);
    edition = { ...old, status: "approved", approvedAt: new Date().toISOString() };
  } else throw new Error("이 브라우저 작업 공간에서는 카드 제작과 다운로드를 사용할 수 있습니다. 게시하려면 서버와 인스타그램을 연결하세요.");
  // Detect another tab's edit while collection/rendering was awaiting the network.
  if ((read(date)?.revision || 0) !== (old?.revision || 0)) throw new Error("다른 탭에서 수정했습니다. 새로고침해 주세요.");
  edition.revision = (old?.revision || 0) + 1; edition.updatedAt = new Date().toISOString();
  try { localStorage.setItem(key + date, JSON.stringify(edition)); } catch { throw new Error("브라우저 저장 공간이 부족합니다. 원고를 백업한 뒤 저장 공간을 확인해 주세요."); }
  return localSnapshot(date);
}
let fontsReady: Promise<void> | undefined;
function loadFonts() {
  return fontsReady ||= Promise.all([
    new FontFace("CardGothic", "url(/fonts/NanumGothic-Bold.ttf)", { weight: "700" }),
    new FontFace("CardGothic", "url(/fonts/NanumGothic-ExtraBold.ttf)", { weight: "900" }),
    new FontFace("CardLatin", "url(/fonts/Arimo-Bold.ttf)", { weight: "700" }),
    new FontFace("CardLatin", "url(/fonts/Arimo-BoldItalic.ttf)", { weight: "700", style: "italic" }),
  ].map(async font => { document.fonts.add(await font.load()); })).then(() => undefined).catch(error => { fontsReady = undefined; throw error; });
}
async function cardBlob(card: Edition["cards"][number]) {
  const issues = cardIssues({ ...card, verified: true }).filter(s => !s.includes("주소"));
  if (issues.length) throw new Error(issues[0]);
  await loadFonts();
  const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = "#CCFF00"; ctx.fillRect(140, 128, 940, 132); ctx.textBaseline = "top";
  const draw = (text: string, x: number, y: number, size: number, family: string, spacing: number, italic = false, limit?: number, weight = 700) => {
    ctx.font = `${italic ? "italic " : ""}${weight} ${size}px "${family}"`; ctx.letterSpacing = `${spacing}px`;
    if (limit && ctx.measureText(text).width > limit) throw new Error("카드의 한 줄이 너무 깁니다. 줄을 나눠 주세요.");
    ctx.fillText(text, x, y);
  };
  ctx.fillStyle = "#111111"; draw("AI News 10", 154, 133, 126, "CardLatin", -8.19);
  ctx.textAlign = "right"; draw("AgentTutor", 1024, 216, 32, "CardLatin", -1.12, true); ctx.textAlign = "left";
  ctx.fillStyle = "#CCFF00";
  card.title.split("\n").forEach((line, i) => draw(line, 140, CARD_LAYOUT.titleTop + i * CARD_LAYOUT.titleLineHeight, 54, "CardGothic", -2.43, false, 870, 900));
  card.body.split("\n").forEach((line, i) => draw(line, 140, cardBodyTop(card.title) + i * 83.52, 48, "CardGothic", -1.68, false, 870));
  ctx.fillStyle = CARD_SOURCE.color;
  cardSourceLines(card).forEach((line, i) => draw(line, CARD_SOURCE.left, CARD_SOURCE.top + i * CARD_SOURCE.lineHeight, CARD_SOURCE.fontSize, "CardGothic", CARD_SOURCE.letterSpacing, false, CARD_SOURCE.width));
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("JPG 생성에 실패했습니다.")), "image/jpeg", 0.96));
}
export async function localImage(edition: Edition, index: number): Promise<string> { return URL.createObjectURL(await cardBlob(edition.cards[index])); }
export async function localBundle(edition: Edition): Promise<Blob> {
  const issues = editionIssues(edition); if (issues.length) throw new Error(issues[0]);
  if (edition.status !== "approved") throw new Error("검토를 완료한 뒤 내려받으세요.");
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < edition.cards.length; i++) files[`AgentTutor_AI_News10_${edition.date}_${String(i + 1).padStart(2, "0")}.jpg`] = new Uint8Array(await (await cardBlob(edition.cards[i])).arrayBuffer());
  files["caption.txt"] = strToU8(edition.caption);
  files["sources.txt"] = strToU8(edition.cards.map((c, i) => `${i + 1}. ${c.title.replace(/\n/g, " ")}\n${c.sourceName}\n${c.publishedAt}\n${c.sourceUrl}`).join("\n\n"));
  files["draft.json"] = strToU8(JSON.stringify(edition, null, 2));
  return new Blob([zipSync(files, { level: 0 })], { type: "application/zip" });
}
