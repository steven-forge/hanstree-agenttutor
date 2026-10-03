"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { cardIssues, captionFor, editionIssues, selectableCandidates, type AdminSnapshot, type Edition, type NewsCandidate, type NewsCard } from "../../lib/card-news/types";
import { localAction, localBundle, localImage, localSnapshot } from "../../lib/card-news/local";
import "./admin-news.css";

const API = "/api/admin/news";
const STATUS: Record<Edition["status"], string> = {
  draft: "초안", approved: "검토 완료", publishing: "발행 처리 중", published: "발행 완료", needs_check: "발행 결과 확인 필요",
};
const ACTION_LABEL: Record<string, string> = {
  load: "판본을 불러오는 중…", collect: "뉴스레터를 불러오는 중…", save: "원고를 저장하는 중…", zip: "JPG 10장을 묶는 중…", import: "원고 파일을 확인하고 가져오는 중…",
  approve: "카드 10장의 JPG와 검토 결과를 확인하는 중…", publish: "Instagram 발행을 요청하는 중…", reconcile: "최초 발행 요청을 이어 처리하고 결과를 확인하는 중…", check_connection: "연결된 Instagram 계정을 확인하는 중…", logout: "로그아웃 중…",
};
type ApiResult = Partial<AdminSnapshot> & { error?: string; id?: string; username?: string };

function safeHref(value?: string): string | undefined {
  try { const url = new URL(value || ""); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
function formatTime(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "시각 미확인";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
function kstInput(value: string) {
  if (!value || !/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return "";
  return new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 19);
}
function fromKstInput(value: string) {
  if (!value) return "";
  const date = new Date(`${value}+09:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}
function needsExactTime(card: NewsCard, candidate?: NewsCandidate) {
  return !/(Z|[+-]\d{2}:\d{2})$/.test(card.publishedAt) || !Number.isFinite(Date.parse(card.publishedAt)) ||
    (candidate?.datePrecision === "day" && card.publishedAt === candidate.publishedAt);
}
function timeIssue(card: NewsCard, edition: Edition) {
  if (needsExactTime(card, edition.candidates.find(candidate => candidate.id === card.candidateId))) return "원문에서 정확한 발행 시각을 확인해 입력하세요.";
  const time = Date.parse(card.publishedAt);
  if (time < Date.parse(edition.windowStart) || time > Date.parse(edition.windowEnd)) return "발행 시각이 이 판본의 후보 기간 밖입니다.";
  return "";
}
// All source text remains available; long drafts are flagged for editing rather than silently cut.
function draftLines(text: string, budget: number) {
  const lines: string[] = [];
  for (const paragraph of text.trim().split(/\n+/)) {
    let line = "", width = 0;
    for (const character of Array.from(paragraph.replace(/\s+/g, " "))) {
      const next = /[^\u0000-\u007f]/.test(character) || /[MW@%]/.test(character) ? 1 : .65;
      if (line && width + next > budget) { lines.push(line.trim()); line = ""; width = 0; }
      line += character; width += next;
    }
    if (line.trim()) lines.push(line.trim());
  }
  return lines.join("\n");
}
function candidateCard(candidate: NewsCandidate): NewsCard {
  return { candidateId: candidate.id, title: draftLines(candidate.title, 16), body: draftLines(candidate.summary, 18), sourceUrl: candidate.sourceUrl, sourceName: candidate.sourceName, publishedAt: candidate.datePrecision === "time" ? candidate.publishedAt : "", verified: false };
}
function editableContent(edition: Edition | null) {
  return edition ? JSON.stringify({ cards: edition.cards, caption: edition.caption, candidates: edition.candidates }) : "";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AdminNews({ initial, initialDate, localMode = false }: { initial: AdminSnapshot; initialDate: string; localMode?: boolean }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [date, setDate] = useState(initialDate);
  const [edition, setEdition] = useState<Edition | null>(initial.edition);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [publishUncertain, setPublishUncertain] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [showJpg, setShowJpg] = useState(false);
  const [jpgError, setJpgError] = useState(false);
  const [jpgPending, setJpgPending] = useState(false);
  const [localJpg, setLocalJpg] = useState("");
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [account, setAccount] = useState<{ id: string; username: string } | null>(null);
  const operation = useRef(false);
  const suppressUnload = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const saved = snapshot.edition;
  const dirty = editableContent(edition) !== editableContent(saved);
  const locked = publishUncertain || (!!edition && ["publishing", "published", "needs_check"].includes(edition.status));
  const canEdit = !!edition && !locked && !pending && !sessionExpired && (localMode || snapshot.setup.storage);
  const selected = edition?.cards || [];
  const candidateCount = edition ? selectableCandidates(edition).length : 0;
  const retainedCount = edition ? edition.candidates.length - candidateCount : 0;
  const currentIndex = Math.min(activeIndex, Math.max(0, selected.length - 1));
  const card = selected[currentIndex];
  const currentCandidate = edition?.candidates.find(candidate => candidate.id === card?.candidateId);
  const exactTimeNeeded = !!card && needsExactTime(card, currentCandidate);
  const savedIndex = saved?.cards.findIndex(item => item.candidateId === card?.candidateId) ?? -1;
  const hasSavedImage = !!saved && savedIndex >= 0;
  const jpgUrl = localMode ? localJpg : hasSavedImage ? `${API}?${new URLSearchParams({ date, image: String(savedIndex), revision: String(saved!.revision) })}` : "";
  const issues = useMemo(() => edition ? [...editionIssues(edition), ...edition.cards.flatMap((item, index) => {
    const problem = timeIssue(item, edition);
    return problem ? [`${index + 1}번: ${problem}`] : [];
  })] : [], [edition]);
  const verifiedCount = edition?.cards.filter(item => item.verified && !timeIssue(item, edition)).length || 0;
  const candidates = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (edition ? selectableCandidates(edition) : []).filter(candidate => !query || `${candidate.title} ${candidate.summary} ${candidate.sourceName}`.toLocaleLowerCase().includes(query));
  }, [edition?.candidates, search]);

  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { if (!suppressUnload.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  useEffect(() => {
    let disposed = false, checking = false;
    const controller = new AbortController();
    async function checkSession() {
      if (checking || disposed) return;
      checking = true;
      try {
        const response = await fetch(`${API}?session=1`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        if (response.status === 401 && !disposed) {
          setSessionExpired(true);
          suppressUnload.current = true;
          // Only reload the view; saved browser drafts remain in localStorage.
          window.location.reload();
        }
      } catch { /* A temporary network failure must not erase browser drafts. */ }
      finally { checking = false; }
    }
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void checkSession(); };
    window.addEventListener("focus", checkSession);
    window.addEventListener("pageshow", onPageShow);
    return () => { disposed = true; controller.abort(); window.removeEventListener("focus", checkSession); window.removeEventListener("pageshow", onPageShow); };
  }, []);
  useEffect(() => { setJpgError(false); }, [jpgUrl]);
  useEffect(() => {
    if (!localMode) return;
    let cancelled = false;
    operation.current = true; setPending("load");
    localSnapshot(initialDate).then(result => {
      if (!cancelled) { setSnapshot({ ...result, setup: { ...result.setup, auth: true } }); setEdition(result.edition); setDate(initialDate); }
    }).catch(caught => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "브라우저에 저장된 원고를 불러오지 못했습니다.");
    }).finally(() => { if (!cancelled) { operation.current = false; setPending(""); } });
    return () => { cancelled = true; };
  }, [localMode, initialDate]);
  useEffect(() => {
    if (!localMode || !showJpg || !saved || savedIndex < 0) { setLocalJpg(""); setJpgPending(false); return; }
    let cancelled = false, objectUrl = "";
    setLocalJpg(""); setJpgPending(true); setJpgError(false);
    localImage(saved, savedIndex).then(url => {
      if (cancelled) { URL.revokeObjectURL(url); return; }
      objectUrl = url; setLocalJpg(url);
    }).catch(() => { if (!cancelled) setJpgError(true); }).finally(() => { if (!cancelled) setJpgPending(false); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [localMode, showJpg, saved, savedIndex]);
  useEffect(() => {
    if (confirmPublish && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (!confirmPublish && dialog.current?.open) dialog.current.close();
  }, [confirmPublish]);

  function accept(result: ApiResult, nextDate = date) {
    setSnapshot(previous => ({ edition: result.edition !== undefined ? result.edition : previous.edition, setup: result.setup ? { ...result.setup, auth: localMode ? true : result.setup.auth } : previous.setup, history: result.history || previous.history }));
    if (result.edition !== undefined) setEdition(result.edition);
    setDate(nextDate);
    setSessionExpired(false);
    setPublishUncertain(false);
  }

  async function readResponse(response: Response): Promise<ApiResult> {
    const result = await response.json().catch(() => ({ error: "서버 응답을 읽지 못했습니다. 상태를 새로 확인해 주세요." } as ApiResult));
    if (!result || typeof result !== "object") throw new Error("서버 응답 형식을 확인하지 못했습니다. 상태를 새로 확인해 주세요.");
    if (response.status === 401) {
      setSessionExpired(true);
      throw new Error("로그인이 만료됐습니다. 수정한 원고를 따로 보관한 뒤 다시 로그인해 주세요.");
    }
    if (!response.ok || result.error) throw new Error(result.error || "요청을 처리하지 못했습니다.");
    return result;
  }

  async function loadDate(nextDate: string) {
    if (operation.current || !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return;
    if (dirty && !window.confirm("저장하지 않은 수정이 있습니다. 수정을 버리고 선택한 판본을 불러올까요?")) return;
    operation.current = true;
    setPending("load"); setError(""); setMessage("");
    try {
      const result = localMode ? await localSnapshot(nextDate) : await readResponse(await fetch(`${API}?${new URLSearchParams({ date: nextDate })}`, { cache: "no-store", credentials: "same-origin" }));
      if (result.edition === undefined) throw new Error("판본 정보가 응답에 없습니다. 다시 시도해 주세요.");
      accept(result, nextDate); setActiveIndex(0); setSearch(""); setShowJpg(false);
      setMessage(result.edition ? "저장된 판본을 불러왔습니다." : "아직 이 날짜의 판본이 없습니다. 뉴스레터 불러오기부터 시작하세요.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "판본을 불러오지 못했습니다."); }
    finally { operation.current = false; setPending(""); }
  }

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (operation.current || (sessionExpired && action !== "logout")) return;
    if (action === "collect" && dirty && !window.confirm("저장하지 않은 수정이 있습니다. 수정을 버리고 뉴스레터 후보를 다시 불러올까요? 저장된 원고와 선택은 유지됩니다.")) return;
    if (action === "logout" && dirty && !window.confirm("저장하지 않은 수정이 있습니다. 수정을 버리고 로그아웃할까요?")) return;
    operation.current = true; setPending(action); setError(""); setMessage("");
    try {
      const request = { action, date, revision: saved?.revision ?? 0, ...extra };
      const result = localMode && action !== "logout" ? await localAction(request) : await readResponse(await fetch(API, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      }));
      if (action === "logout") { suppressUnload.current = true; window.location.reload(); return; }
      if (result.edition === undefined) throw new Error("변경된 판본 정보가 응답에 없습니다. 상태를 새로 확인해 주세요.");
      accept(result);
      if (action === "collect") { setActiveIndex(0); setShowJpg(false); }
      const next = result.edition;
      if (action === "collect") {
        const count = next ? selectableCandidates(next).length : 0;
        if (count < 10) setError(`후보 수집 미달: ${count}개입니다. 제작 완료로 처리할 수 없습니다. 뉴스레터의 공개 기사와 수집 상태를 확인해 주세요.`);
        else setMessage(`${count}개 뉴스레터 후보를 가져왔습니다. 원문과 발행 시각을 확인해 10개를 선정하세요.`);
      }
      if (action === "save") setMessage("원고를 저장했습니다. 변경된 원고의 검토 상태는 초안입니다.");
      if (action === "approve") setMessage("검토를 완료했습니다. 저장본 JPG를 확인한 뒤 발행 버튼을 눌러 주세요.");
      if (action === "publish" || action === "reconcile") setMessage(next?.status === "published" ? "Instagram 발행 완료 기록을 확인했습니다." : next?.status === "needs_check" ? "발행 결과 확인이 필요합니다. 중복 발행을 막기 위해 결과 확인 버튼을 사용하세요." : "요청을 처리했습니다. 아래 판본 상태와 발행 기록을 확인하세요.");
    } catch (caught) {
      if (action === "logout") {
        try {
          // The server may have cleared this browser's cookie even if removing
          // the stored session failed. Do not leave the editor open in that case.
          const response = await fetch(`${API}?session=1`, { cache: "no-store", credentials: "same-origin" });
          if (response.status === 401) { suppressUnload.current = true; window.location.reload(); return; }
        } catch { /* Keep the original error if the session cannot be checked. */ }
      }
      const detail = caught instanceof Error ? caught.message : "서버에 연결하지 못했습니다.";
      if (action === "publish") setPublishUncertain(true);
      setError(action === "publish" ? `${detail} 게시 요청이 이미 접수됐을 수 있습니다. 먼저 ‘상태 새로 확인’을 눌러 결과를 확인하세요.` : detail);
    } finally { operation.current = false; setPending(""); }
  }

  async function preparePublication() {
    if (operation.current || localMode || !canPublish) return;
    operation.current = true; setPending("check_connection"); setError(""); setAccount(null);
    try {
      const result = await readResponse(await fetch(API, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check_connection", date, revision: saved?.revision }),
      }));
      if (!result.id || !result.username) throw new Error("발행할 Instagram 계정을 확인하지 못했습니다. 연결 설정을 확인해 주세요.");
      setAccount({ id: result.id, username: result.username }); setConfirmPublish(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Instagram 계정을 확인하지 못했습니다."); }
    finally { operation.current = false; setPending(""); }
  }

  async function downloadLocalBundle() {
    if (operation.current || !saved || !canDownload) return;
    operation.current = true; setPending("zip"); setError(""); setMessage("");
    try { downloadBlob(await localBundle(saved), `AgentTutor_AI_News10_${date}.zip`); setMessage("JPG 10장 ZIP 다운로드를 준비했습니다."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "ZIP을 만들지 못했습니다. 카드 원고를 확인해 주세요."); }
    finally { operation.current = false; setPending(""); }
  }
  function exportJson() {
    if (!edition) return;
    const draft = { ...edition, status: "draft", approvedAt: undefined, publishedAt: undefined, publication: undefined };
    downloadBlob(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json;charset=utf-8" }), `AgentTutor_AI_News10_${date}.json`);
  }
  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget, file = input.files?.[0];
    if (!file || !localMode || operation.current) return;
    if (edition && !window.confirm("현재 날짜의 원고를 가져온 파일의 초안으로 바꿀까요? 필요한 원고는 먼저 JSON으로 내보내 주세요.")) { input.value = ""; return; }
    operation.current = true; setPending("import"); setError(""); setMessage("");
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("원고 JSON은 2MB 이하 파일만 가져올 수 있습니다.");
      const draft: unknown = JSON.parse(await file.text());
      if (!draft || typeof draft !== "object" || !("date" in draft) || draft.date !== date) throw new Error("파일의 판본 날짜가 현재 선택 날짜와 다릅니다. 해당 날짜를 먼저 선택해 주세요.");
      const result = await localAction({ action: "import", date, revision: saved?.revision ?? 0, edition: draft });
      accept(result); setActiveIndex(0); setShowJpg(false); setMessage("원고를 초안으로 가져왔습니다. 원문 검토를 다시 확인한 뒤 승인하세요.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "원고 JSON을 가져오지 못했습니다."); }
    finally { input.value = ""; operation.current = false; setPending(""); }
  }

  function toggleCandidate(candidate: NewsCandidate) {
    if (!canEdit || !edition) return;
    const found = edition.cards.findIndex(item => item.candidateId === candidate.id);
    if (found < 0 && edition.cards.length >= 10) { setError("이미 10개를 선정했습니다. 다른 뉴스를 먼저 해제하세요."); return; }
    const cards = found >= 0 ? edition.cards.filter(item => item.candidateId !== candidate.id) : [...edition.cards, candidateCard(candidate)];
    setEdition({ ...edition, cards }); setMessage(""); setError("");
    if (found < 0) setActiveIndex(cards.length - 1);
  }
  function changeCard(changes: Partial<NewsCard>) {
    if (!canEdit || !edition || !card) return;
    setEdition({ ...edition, cards: edition.cards.map((item, index) => index === currentIndex ? { ...item, verified: false, ...changes } : item) });
    setMessage("");
  }
  function moveCard(offset: number) {
    if (!canEdit || !edition) return;
    const next = currentIndex + offset;
    if (next < 0 || next >= edition.cards.length) return;
    const cards = [...edition.cards];
    [cards[currentIndex], cards[next]] = [cards[next], cards[currentIndex]];
    setEdition({ ...edition, cards }); setActiveIndex(next); setMessage("");
  }
  function regenerateCaption() {
    if (!canEdit || !edition) return;
    if (edition.caption.trim() && !window.confirm("현재 설명을 선택한 뉴스와 출처 목록으로 바꿀까요?")) return;
    setEdition({ ...edition, caption: captionFor(date, edition.cards) }); setMessage("");
  }

  const canApprove = canEdit && !dirty && !issues.length && edition?.status === "draft";
  const canPublish = !localMode && !publishUncertain && !!edition && edition.status === "approved" && !dirty && !issues.length && snapshot.setup.instagram && !pending && !sessionExpired;
  const canDownload = !!saved && ["approved", "published"].includes(saved.status) && !dirty && !pending && !sessionExpired;
  const currentIssues = card && edition ? [...cardIssues(card), ...(timeIssue(card, edition) ? [timeIssue(card, edition)] : [])] : [];

  return <main className="cn-shell">
    <header className="cn-header">
      <div><p className="cn-eyebrow">AgentTutor · AI News 10</p><h1>카드뉴스 관리</h1><p className="cn-muted">뉴스레터에서 뉴스를 골라 카드 원고를 검토하고 Instagram 발행을 준비합니다.</p><div className="cn-targets"><span><strong>08:30</strong> 검토 준비 목표</span><span><strong>09:00</strong> 발행 목표 · 한국 시간</span></div></div>
      <button className="cn-button" onClick={() => act("logout")} disabled={!!pending}>로그아웃</button>
    </header>

    {localMode && <div className="cn-alert cn-alert-info"><strong>관리자 로그인됨 · 이 브라우저에 저장</strong><p>Instagram 연결 전에 뉴스 선정과 카드 제작을 할 수 있습니다. 원고는 현재 브라우저에만 저장되며, 기기를 바꾸거나 브라우저 데이터를 삭제하면 사용할 수 없습니다. JSON 내보내기로 원고를 보관하세요.</p><p>로그아웃해도 저장한 원고는 유지됩니다. 다시 관리자 비밀번호로 로그인하면 이어서 작업할 수 있습니다.</p><div className="cn-publish-actions"><button className="cn-button cn-button-small" onClick={exportJson} disabled={!edition || !!pending}>원고 JSON 내보내기</button><button className="cn-button cn-button-small" onClick={() => importInput.current?.click()} disabled={!!pending || locked}>원고 JSON 가져오기</button><input ref={importInput} type="file" accept="application/json,.json" hidden onChange={importJson} /></div></div>}

    <section className="cn-panel" aria-label="날짜와 판본 상태">
      <div className="cn-toolbar">
        <label className="cn-field">판본 날짜 · KST<input type="date" value={date} onChange={event => loadDate(event.target.value)} disabled={!!pending} /></label>
        {edition && <span className={`cn-tag ${edition.status === "published" || edition.status === "approved" ? "cn-tag-ok" : edition.status === "needs_check" ? "cn-tag-warn" : "cn-tag-info"}`}>{STATUS[edition.status]}</span>}
        {dirty && <span className="cn-tag cn-tag-warn">저장하지 않은 수정</span>}
        <div className="cn-toolbar-actions">
          <button className="cn-button" onClick={() => loadDate(date)} disabled={!!pending}>상태 새로 확인</button>
          <button className="cn-button" onClick={() => act("collect")} disabled={!!pending || locked || edition?.status === "approved" || sessionExpired || (!localMode && !snapshot.setup.storage)}>{edition ? "뉴스레터 다시 불러오기" : "뉴스레터 불러오기"}</button>
          <button className="cn-button cn-button-primary" onClick={() => edition && act("save", { cards: edition.cards, caption: edition.caption, candidates: edition.candidates })} disabled={!canEdit || !dirty}>원고 저장</button>
        </div>
      </div>
      <p className="cn-help">{edition ? `후보 발행 기간 ${formatTime(edition.windowStart)} ~ ${formatTime(edition.windowEnd)} KST · 불러옴 ${formatTime(edition.collectedAt)} · 저장본 v${edition.revision}` : "뉴스레터에 공개된 전체 기사를 최신순으로 불러옵니다. 판본 날짜 이후의 기사는 제외합니다."}</p>
      <p className="cn-help"><a className="cn-text-link" href="/today" target="_blank" rel="noopener noreferrer">뉴스레터 열기</a> · 후보는 뉴스레터 공개 기사만 사용합니다. 최신순이며 중요도 순위는 아닙니다.</p>
      {retainedCount > 0 && <p className="cn-alert cn-alert-info">이전 후보 {retainedCount}개는 원고 보존용으로 남겨 두었습니다. 새 뉴스레터 후보 수에는 포함하지 않으며, 해당 카드는 뉴스레터 후보로 다시 선정해야 합니다.</p>}
      {edition && !edition.candidateSource && <p className="cn-alert cn-alert-info">이전 방식으로 저장한 판본입니다. 뉴스레터 다시 불러오기를 누르면 저장한 카드와 설명을 유지하며 후보를 갱신합니다.</p>}
      <p className="cn-help">현재 발행 방식: 관리자 검토 후 버튼으로 발행. 화면의 목표 시각에 자동으로 게시되지는 않습니다.</p>
      {pending && <p className="cn-alert cn-alert-info" role="status">{ACTION_LABEL[pending] || "처리 중…"}</p>}
      {error && <div className="cn-alert cn-alert-error" role="alert"><p>{error}</p>{sessionExpired && <button className="cn-button cn-button-small" onClick={() => { if (!dirty || window.confirm("저장하지 않은 수정은 사라집니다. 원고를 따로 보관했다면 로그인 화면으로 이동할까요?")) { suppressUnload.current = true; window.location.reload(); } }}>다시 로그인</button>}</div>}
      {message && <p className="cn-alert cn-alert-success" role="status">{message}</p>}
      {edition && candidateCount < 10 && <div className="cn-alert cn-alert-error"><strong>뉴스 수집 부족 · {candidateCount}/10</strong><p>정상 제작 완료 상태가 아닙니다. 뉴스레터의 공개 기사와 수집 상태를 확인한 뒤 다시 불러오세요. 원문·날짜 확인을 통과한 서로 다른 뉴스가 최소 10개 필요합니다.</p></div>}
      {edition?.status === "needs_check" && <div className="cn-alert"><strong>중복 발행을 막기 위해 편집과 재발행을 잠갔습니다.</strong><p>{edition.publication?.message || "Instagram이 이전 요청을 처리했는지 먼저 확인해야 합니다."}</p><p>아래 버튼은 최초 요청한 발행을 이어서 처리합니다. 이미지 준비가 끝났다면 실제 게시까지 진행할 수 있습니다.</p><button className="cn-button" onClick={() => act("reconcile")} disabled={!!pending || sessionExpired}>발행 계속 및 확인</button></div>}
      {edition?.status === "publishing" && <div className="cn-alert cn-alert-info"><p>발행 요청을 처리하고 있습니다. 원고는 잠겨 있습니다. 아래 버튼으로 최초 발행 요청을 이어 처리하고 결과를 확인할 수 있습니다.</p><button className="cn-button" onClick={() => act("reconcile")} disabled={!!pending || sessionExpired}>발행 계속 및 확인</button></div>}
      {edition?.status === "published" && <p className="cn-alert cn-alert-success">{formatTime(edition.publishedAt)} KST 발행 완료. 이 판본의 원고는 잠겨 있습니다. {safeHref(edition.publication?.permalink) && <a className="cn-text-link" href={safeHref(edition.publication?.permalink)} target="_blank" rel="noopener noreferrer">Instagram 게시물 보기</a>}</p>}
    </section>

    {!edition ? <section className="cn-empty" style={{ marginTop: 22 }}><h2>아직 준비된 판본이 없습니다</h2><p>‘뉴스레터 불러오기’를 누르면 뉴스레터에 올라온 기사를 가져옵니다. 뉴스 10개를 선정하고 저장한 뒤 원문 확인과 최종 검토를 진행하세요.</p></section> : <>
      <div className="cn-stats" aria-label="제작 진행 상황">
        <div className={`cn-stat ${candidateCount < 10 ? "cn-stat-warn" : ""}`}><span>뉴스레터 후보</span><strong>{candidateCount}개</strong></div>
        <div className={`cn-stat ${selected.length !== 10 ? "cn-stat-warn" : ""}`}><span>선정한 뉴스</span><strong>{selected.length}/10</strong></div>
        <div className={`cn-stat ${verifiedCount !== 10 ? "cn-stat-warn" : ""}`}><span>원문 검토</span><strong>{verifiedCount}/10</strong></div>
      </div>
      <div className="cn-workspace">
        <section className="cn-panel" aria-labelledby="cn-candidates-heading">
          <div className="cn-section-head"><div><h2 id="cn-candidates-heading">1. 뉴스 후보 선정</h2><p className="cn-muted">뉴스레터 공개 기사에서 서로 다른 뉴스 10개를 골라 주세요.</p></div></div>
          <label className="cn-field">후보 검색<input type="search" placeholder="제목·출처·내용 검색" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <div className="cn-candidates">
            {candidates.length ? candidates.map(candidate => {
              const index = selected.findIndex(item => item.candidateId === candidate.id);
              return <div className="cn-candidate" key={candidate.id}>
                <label className="cn-candidate-label"><input type="checkbox" checked={index >= 0} disabled={!canEdit || (selected.length >= 10 && index < 0)} onChange={() => toggleCandidate(candidate)} /><span className="cn-candidate-title">{candidate.title} {index >= 0 && <span className="cn-tag cn-tag-info">카드 {index + 1}</span>}</span></label>
                <p>{candidate.summary || "요약이 없습니다. 원문을 읽고 카드 본문을 작성하세요."}</p>
                <div className="cn-candidate-meta">{safeHref(candidate.sourceUrl) ? <a className="cn-text-link" href={safeHref(candidate.sourceUrl)} target="_blank" rel="noopener noreferrer">{candidate.sourceName || "원문 보기"}</a> : <span>유효한 원문 주소 필요</span>}<span>{candidate.datePrecision === "time" ? `${formatTime(candidate.publishedAt)} KST` : `${candidate.publishedAt} · 날짜만 확인`}</span>{candidate.newsletterId && <a className="cn-text-link" href={`/today/${encodeURIComponent(candidate.newsletterId)}`} target="_blank" rel="noopener noreferrer">뉴스레터 보기</a>}</div>
              </div>;
            }) : <p className="cn-muted">{search ? "검색 결과가 없습니다." : "뉴스레터 후보가 없습니다. 뉴스레터의 수집 상태를 확인해 주세요."}</p>}
          </div>
          {selected.length >= 10 && <p className="cn-help">10개를 선정했습니다. 다른 후보를 고르려면 기존 선택을 해제하세요.</p>}

        </section>

        <div>
          <section className="cn-panel" aria-labelledby="cn-editor-heading">
            <div className="cn-section-head"><div><h2 id="cn-editor-heading">2. 카드 원고와 순서</h2><p className="cn-muted">제목 1~2줄 · 본문 1~6줄 · 카드 1080 × 1350</p></div></div>
            {selected.length ? <>
              <div className="cn-card-tabs" aria-label="편집할 카드 선택">{selected.map((item, index) => <button className="cn-card-tab" key={item.candidateId} aria-pressed={index === currentIndex} aria-label={`${index + 1}번 카드: ${item.title.replace(/\n/g, " ")}`} onClick={() => setActiveIndex(index)}>{index + 1}{item.verified ? " ✓" : ""}</button>)}</div>
              {card && <>
                <div className="cn-card-actions"><button className="cn-button cn-button-small" onClick={() => moveCard(-1)} disabled={!canEdit || currentIndex === 0}>앞으로 이동</button><button className="cn-button cn-button-small" onClick={() => moveCard(1)} disabled={!canEdit || currentIndex === selected.length - 1}>뒤로 이동</button><button className="cn-button cn-button-small" disabled={!canEdit} onClick={() => { if (window.confirm("이 카드 선택을 해제할까요? 편집한 내용이 필요하면 먼저 원고 JSON을 내보내 주세요.")) { setEdition({ ...edition, cards: edition.cards.filter((_, index) => index !== currentIndex) }); setMessage(""); } }}>카드 선택 해제</button><span className="cn-help">현재 {currentIndex + 1}번째 카드</span></div>
                <div className="cn-editor-grid">
                  <div className="cn-editor-fields">
                    <label className="cn-field">제목 · {card.title.split("\n").length}/2줄<textarea rows={2} value={card.title} onChange={event => changeCard({ title: event.target.value })} disabled={!canEdit} /><small>줄바꿈 위치가 이미지에 그대로 반영됩니다.</small></label>
                    <label className="cn-field">본문 · {card.body.split("\n").length}/6줄<textarea rows={6} value={card.body} onChange={event => changeCard({ body: event.target.value })} disabled={!canEdit} /></label>
                    {(!/[가-힣]/.test(card.title) || !/[가-힣]/.test(card.body)) && <p className="cn-alert">영문 원문이 그대로 들어간 초안은 한국어 제목과 본문으로 편집한 뒤 검토하세요.</p>}
                    <label className="cn-field">출처 이름<input value={card.sourceName} onChange={event => changeCard({ sourceName: event.target.value })} disabled={!canEdit} /></label>
                    <label className="cn-field">원문 주소<input type="url" value={card.sourceUrl} onChange={event => changeCard({ sourceUrl: event.target.value })} disabled={!canEdit} /></label>
                    {safeHref(card.sourceUrl) && <a className="cn-text-link" href={safeHref(card.sourceUrl)} target="_blank" rel="noopener noreferrer">원문을 새 탭에서 확인</a>}
                    <label className="cn-field">확인한 발행 시각 · KST<input type="datetime-local" step="1" value={exactTimeNeeded ? "" : kstInput(card.publishedAt)} onChange={event => changeCard({ publishedAt: fromKstInput(event.target.value) })} disabled={!canEdit} /><small>{exactTimeNeeded ? "날짜만으로 선정 구간 안의 기사인지 판단할 수 없습니다. 원문의 정확한 시각이 필요합니다." : "기사 작성·추가 공개 시각과 사건 발생 시점을 구분해 주세요."}</small></label>
                    <label className="cn-check"><input type="checkbox" checked={card.verified} disabled={!canEdit || exactTimeNeeded} onChange={event => changeCard({ verified: event.target.checked })} /><span>원문·수치·발행 시각을 확인했고 다른 카드와 같은 사건이 아님을 확인했습니다.</span></label>
                    {!!currentIssues.length && <ul className="cn-issues">{currentIssues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul>}
                  </div>
                  <div className="cn-preview-column">
                    <div className="cn-card-preview" aria-label="편집 중 카드 배치 미리보기"><div className="cn-card-surface"><div className="cn-card-band"><span className="cn-card-series">AI News 10</span><span className="cn-card-brand">AgentTutor</span></div><div className="cn-card-copy"><p className="cn-card-headline">{card.title || "제목을 입력하세요"}</p><p className="cn-card-body">{card.body || "본문을 입력하세요"}</p></div></div></div>
                    <p className="cn-preview-label">편집 미리보기 · 최종 줄바꿈과 넘침은 저장본 JPG에서 확인하세요.</p>
                    <button className="cn-button cn-button-small" onClick={() => { setJpgError(false); setShowJpg(value => !value); }} disabled={!hasSavedImage || !!pending || sessionExpired}>{showJpg ? "저장본 JPG 접기" : "실제 저장본 JPG 보기"}</button>
                    {!hasSavedImage && <p className="cn-help">이 카드를 저장하면 실제 JPG를 볼 수 있습니다.</p>}
                    {showJpg && hasSavedImage && <div className="cn-jpg-section">{dirty && <p className="cn-alert">아래 JPG는 수정 전 저장본입니다. 원고를 저장해야 최신 내용이 반영됩니다.</p>}{jpgPending ? <p className="cn-help" role="status">저장한 원고로 JPG를 만드는 중…</p> : jpgError ? <p className="cn-alert cn-alert-error" role="alert">JPG를 가져오지 못했습니다. 원고의 줄 길이{localMode ? "와 브라우저 상태" : "와 로그인 상태"}를 확인하고, 저장 후 다시 열어 주세요.</p> : jpgUrl && <img className="cn-jpg" key={jpgUrl} src={jpgUrl} width={1080} height={1350} alt={`저장된 ${savedIndex + 1}번 카드 JPG`} onError={() => setJpgError(true)} />}<p className="cn-preview-label">저장본 v{saved?.revision} · 1080 × 1350 JPG</p></div>}
                  </div>
                </div>
              </>}
            </> : <div className="cn-empty"><p>후보에서 뉴스를 선택하면 카드 원고를 편집할 수 있습니다.</p></div>}
          </section>

          <section className="cn-panel cn-caption-panel" aria-labelledby="cn-publish-heading">
            <div className="cn-section-head"><div><h2 id="cn-publish-heading">3. 설명 검토와 발행</h2><p className="cn-muted">날짜와 원문 출처는 게시글 설명에 함께 남깁니다.</p></div></div>
            <label className="cn-field">게시글 설명 · {Array.from(edition.caption).length.toLocaleString()}/2,200자<textarea rows={8} value={edition.caption} onChange={event => { if (canEdit) { setEdition({ ...edition, caption: event.target.value }); setMessage(""); } }} disabled={!canEdit} /></label>
            <div className="cn-publish-actions"><button className="cn-button cn-button-small" onClick={regenerateCaption} disabled={!canEdit || !selected.length}>선정 뉴스·출처로 설명 만들기</button></div>
            {!!issues.length && !locked && <details className="cn-details"><summary>검토 완료 전 확인할 항목 {issues.length}개</summary><ul className="cn-issues">{issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul></details>}
            {dirty && <p className="cn-alert">원고를 먼저 저장하세요. 승인 후 수정하면 다시 검토해야 합니다.</p>}
            {!snapshot.setup.instagram && <p className="cn-alert">Instagram 연결은 나중에 진행할 수 있습니다. 지금은 원고 작성·검토와 ZIP 다운로드를 이용하세요.{localMode && <> 서버 저장소로 전환하기 전에는 원고를 JSON으로 보관해 주세요. <a className="cn-text-link" href="#cn-setup-heading">연결 준비 상태 보기</a></>}</p>}
            <div className="cn-publish-actions">
              <button className="cn-button" onClick={() => act("approve")} disabled={!canApprove}>{edition.status === "approved" && !dirty ? "검토 완료됨" : "10개 원고 검토 완료"}</button>
              {canDownload ? localMode ? <button className="cn-button" onClick={downloadLocalBundle}>JPG 10장 ZIP 받기</button> : <a className="cn-button" href={`${API}?${new URLSearchParams({ date, download: "zip", revision: String(saved!.revision) })}`}>JPG 10장 ZIP 받기</a> : <button className="cn-button" disabled>검토 후 ZIP 받기</button>}
              <button className="cn-button cn-button-primary" onClick={preparePublication} disabled={!canPublish}>Instagram에 발행</button>
            </div>
            <p className="cn-help">{localMode ? "브라우저 원고 모드에서는 Instagram에 게시되지 않습니다. 계정 연결 후 서버 관리자 모드에서 발행합니다." : "최종 확인 창에서 동의한 뒤 실제로 게시합니다. 카드 원고를 저장하거나 검토 완료하는 것만으로 게시되지는 않습니다."}</p>
          </section>
        </div>
      </div>
    </>}

    <div className="cn-bottom">
      <section className="cn-panel" aria-labelledby="cn-setup-heading"><h2 id="cn-setup-heading">연결 준비 상태</h2><ul className="cn-setup-list">{([
        ["auth", "관리자 인증"], ["storage", "원고·발행 기록 저장소"], ["instagram", "Instagram 발행 연결"], ["scheduler", "일일 제작 예약"],
      ] as const).map(([key, label]) => <li key={key}><span>{localMode && key === "storage" ? "현재 브라우저 원고 저장" : label}</span><span className={`cn-tag ${snapshot.setup[key] || (localMode && key === "storage") ? "cn-tag-ok" : "cn-tag-warn"}`}>{localMode && key === "storage" ? "이 브라우저" : snapshot.setup[key] ? "설정됨" : "준비 필요"}</span></li>)}</ul><p className="cn-help">{localMode ? "관리자 로그인 후 브라우저에서 카드 제작을 할 수 있습니다. 서버 저장소·Instagram 연결·일일 예약은 나중에 설정합니다." : "설정 여부를 표시합니다. 실제 수집·게시 성공 여부는 각 실행 결과에서 확인하세요."}</p>
        {!!edition?.sources.length && <details className="cn-details"><summary>최근 수집 출처 {edition.sources.length}곳 확인</summary><div className="cn-source-status">{edition.sources.map((source, index) => <span className={`cn-tag ${source.status === "ok" ? "cn-tag-ok" : "cn-tag-warn"}`} key={`${source.name}-${index}`} title={source.message}>{source.name} · {source.status === "ok" ? `${source.count}개` : "실패"}</span>)}</div>{edition.sources.filter(source => source.status === "failed").map((source, index) => <p className="cn-help" key={`${source.name}-${index}`}>{source.name}: {source.message || "가져오지 못했습니다. 출처 상태를 확인한 뒤 재수집하세요."}</p>)}</details>}
      </section>
      <section className="cn-panel" aria-labelledby="cn-history-heading"><h2 id="cn-history-heading">판본 이력</h2>{snapshot.history.length ? <ul className="cn-history">{snapshot.history.map(item => <li key={item.date}><div><button className="cn-history-date" disabled={!!pending} onClick={() => loadDate(item.date)}>{item.date}{item.date === date ? " · 현재 판본" : ""}</button><small>최근 변경 {formatTime(item.updatedAt)} KST</small></div><span className={`cn-tag ${item.status === "published" ? "cn-tag-ok" : item.status === "needs_check" ? "cn-tag-warn" : ""}`}>{STATUS[item.status]}</span></li>)}</ul> : <p className="cn-muted">저장된 판본 이력이 없습니다.</p>}{edition?.publication?.message && <p className="cn-help">최근 발행 기록: {edition.publication.message}</p>}</section>
    </div>

    <dialog ref={dialog} className="cn-dialog" onCancel={() => setConfirmPublish(false)} onClose={() => setConfirmPublish(false)} aria-labelledby="cn-confirm-heading">
      <h2 id="cn-confirm-heading">Instagram에 이 판본을 발행할까요?</h2>
      <p><strong>{date} · 카드 10장 · 저장본 v{saved?.revision}</strong></p><p>발행할 계정: <strong>@{account?.username}</strong></p><p>위 Instagram 계정에 카드 10장과 저장된 설명을 하나의 게시물로 공개합니다. 실제 JPG, 원문 확인, 카드 순서를 마지막으로 확인해 주세요.</p>
      <div className="cn-publish-actions"><button className="cn-button" onClick={() => setConfirmPublish(false)}>돌아가서 확인</button><button className="cn-button cn-button-primary" disabled={!canPublish || !account} onClick={() => { if (!account) return; setConfirmPublish(false); void act("publish", { confirm: true, accountId: account.id }); }}>확인 · 10장 발행</button></div>
    </dialog>
  </main>;
}
