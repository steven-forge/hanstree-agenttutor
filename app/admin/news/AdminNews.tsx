"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { cardIssues, captionFor, CAPTION_INTRO, editionKey, editionIssues, selectableCandidates, preserveDraft, cardDateIssue, usesContentDate, isSupplement, type AdminSnapshot, type Edition, type NewsCandidate, type NewsCard } from "../../lib/card-news/types";
import { copyFor } from "../../lib/card-news/auto-copy";
import { fitCardCopy, copyIssues, CARD_TEXT, CARD_LAYOUT, CARD_SOURCE, cardBodyTop, cardSourceLines, cardFontSize, wrapCardText, wrapCardTitle } from "../../lib/card-news/copy";
import { localAction, localBundle, localImage, localSnapshot } from "../../lib/card-news/local";
import type { ExtractedArticle } from "../../lib/card-news/article-extract";
import PublicationProgress, { publicationSummary } from "./PublicationProgress";
import "./admin-news.css";

const API = "/api/admin/news";
const STATUS: Record<Edition["status"], string> = {
  draft: "초안", approved: "검토 완료", publishing: "발행 처리 중", published: "발행 완료", needs_check: "발행 결과 확인 필요",
};
const ACTION_LABEL: Record<string, string> = {
  create_webtoon: "기존 웹툰을 발행 원고로 불러오는 중…",
  add_manual: "직접 입력한 뉴스를 등록하는 중…",
  extract: "원문을 요약하고 제목과 본문을 한국어로 옮기는 중…",
  compose: "카드용 요약을 적용하는 중…", load: "판본을 불러오는 중…", collect: "뉴스레터를 불러오는 중…", save: "원고를 저장하는 중…", zip: "JPG를 묶는 중…", import: "원고 파일을 확인하고 가져오는 중…",
  approve: "카드 JPG와 검토 결과를 확인하는 중…", publish: "Instagram 발행을 요청하는 중…", reconcile: "최초 발행 요청을 이어 처리하고 결과를 확인하는 중…", check_connection: "연결된 Instagram 계정을 확인하는 중…", logout: "로그아웃 중…",
};
type ApiResult = Partial<AdminSnapshot> & { error?: string; message?: string; id?: string; username?: string; article?: ExtractedArticle };
type ExploreOption = { slug: string; title: string; summary: string; date: string; format?: "webtoon" };
const EMPTY_MANUAL = { title: "", summary: "", sourceName: "", sourceUrl: "", publishedAt: "" };

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
  if (usesContentDate(candidate)) return false;
  return !/(Z|[+-]\d{2}:\d{2})$/.test(card.publishedAt) || !Number.isFinite(Date.parse(card.publishedAt)) ||
    (candidate?.datePrecision === "day" && card.publishedAt === candidate.publishedAt);
}
function timeIssue(card: NewsCard, edition: Edition) { return cardDateIssue(card, edition); }
const CONTENT_LABELS = { release: "릴리스", glossary: "용어사전", explore: "Explore" };
function contentDateLabel(candidate: NewsCandidate) {
  return candidate.datePrecision === "none" ? "날짜 기록 없음 · 최신 등록순" : candidate.datePrecision === "day" ? `${candidate.publishedAt} · 콘텐츠 날짜` : `${formatTime(candidate.publishedAt)} KST`;
}
function candidateCard(candidate: NewsCandidate): NewsCard {
  if (candidate.image) return { candidateId: candidate.id, title: candidate.title, body: candidate.summary, sourceUrl: candidate.sourceUrl, sourceName: candidate.sourceName, publishedAt: candidate.publishedAt, image: candidate.image, verified: false };
  // Prepared copy, then complete lead sentences; otherwise keep the original text editable instead of blanking it.
  const copy = fitCardCopy(candidate.cardCopy || { title: candidate.title, body: candidate.summary }) || copyFor(candidate).copy || { title: wrapCardTitle(candidate.title), body: wrapCardText(candidate.summary, CARD_TEXT.body.width) };
  return { candidateId: candidate.id, title: copy.title, body: copy.body, sourceUrl: candidate.sourceUrl, sourceName: candidate.sourceName, publishedAt: candidate.datePrecision === "time" || usesContentDate(candidate) ? candidate.publishedAt : "", verified: false };
}
function editableContent(edition: Edition | null) {
  return edition ? JSON.stringify({ cards: edition.cards, caption: edition.caption, candidates: edition.candidates }) : "";
}
function editorCaption(edition: Edition, cards: NewsCard[], candidates = edition.candidates) {
  if (edition.explore?.format === "webtoon") return edition.caption;
  const caption = captionFor(cards, candidates);
  return edition.explore ? caption.replace(CAPTION_INTRO, `AgentTutor Explore · ${edition.explore.title}\n\n${edition.candidates[0]?.sourceUrl || ""}`) : caption;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AdminNews({ initial, initialDate, localMode = false, explore, exploreDocs = [] }: { initial: AdminSnapshot; initialDate: string; localMode?: boolean; explore?: ExploreOption; exploreDocs?: ExploreOption[] }) {
  const targetKey = (day: string) => explore ? `${day}~webtoon~${explore.slug}` : day;
  const [snapshot, setSnapshot] = useState(initial);
  const [date, setDate] = useState(initialDate);
  const viewDate = useRef(targetKey(initialDate));
  const [pickedExplore, setPickedExplore] = useState(explore?.slug || exploreDocs[0]?.slug || "");
  const [edition, setEdition] = useState<Edition | null>(initial.edition);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [publishUncertain, setPublishUncertain] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [manual, setManual] = useState(EMPTY_MANUAL);
  const [extractNotice, setExtractNotice] = useState("");
  const [extractError, setExtractError] = useState("");
  const [showJpg, setShowJpg] = useState(false);
  const [jpgError, setJpgError] = useState(false);
  const [jpgPending, setJpgPending] = useState(false);
  const [localJpg, setLocalJpg] = useState("");
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [account, setAccount] = useState<{ id: string; username: string } | null>(null);
  const daily = !explore;
  const [stage, setStage] = useState<1 | 2 | 3>(() => initial.edition && ["approved", "publishing", "needs_check", "published"].includes(initial.edition.status) ? 3 : 1);
  const operation = useRef(false);
  const suppressUnload = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const toolsDialog = useRef<HTMLDialogElement>(null);
  const manualRef = useRef<HTMLDetailsElement>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const saved = snapshot.edition;
  const dirty = editableContent(edition) !== editableContent(saved);
  const manualDirty = Object.values(manual).some(value => value.length > 0);
  const manualTooLong = manual.title.length > 200 || manual.summary.length > 600 || manual.sourceName.length > 100;
  const unsaved = dirty || manualDirty;
  const locked = publishUncertain || (!!edition && ["publishing", "published", "needs_check"].includes(edition.status));
  const canRegister = !locked && !pending && !sessionExpired && (localMode || snapshot.setup.storage);
  const canEdit = !!edition && canRegister;
  const selected = edition?.cards || [];
  const expectedCount = explore ? selected.length : 10;
  const series = explore ? "AI Explore" : "AI News 10";
  const candidateCount = edition ? selectableCandidates(edition).length : 0;
  const retainedCount = edition ? edition.candidates.length - candidateCount : 0;
  const currentIndex = Math.min(activeIndex, Math.max(0, selected.length - 1));
  const card = selected[currentIndex];
  const currentCandidate = edition?.candidates.find(candidate => candidate.id === card?.candidateId);
  const exactTimeNeeded = !!card && needsExactTime(card, currentCandidate);
  const savedIndex = saved?.cards.findIndex(item => item.candidateId === card?.candidateId) ?? -1;
  const hasSavedImage = !!saved && savedIndex >= 0;
  const jpgUrl = localMode ? localJpg : hasSavedImage ? `${API}?${new URLSearchParams({ date: targetKey(date), image: String(savedIndex), revision: String(saved!.revision) })}` : "";
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
    if (!explore) return;
    const controller = new AbortController();
    fetch(API, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "discard_explore_text", date: targetKey(initialDate) }), signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("이전 텍스트 초안을 정리하지 못했습니다. 페이지를 다시 열어 주세요."); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [explore?.slug, initialDate]);

  useEffect(() => {
    if (!unsaved) return;
    const protect = (event: BeforeUnloadEvent) => { if (!suppressUnload.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [unsaved]);
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
  // Publishing or a finished publication always brings the progress stage into view.
  const publishView = publishUncertain || pending === "publish" || pending === "reconcile" || (!!edition && ["publishing", "needs_check", "published"].includes(edition.status));
  const stage3View = publishView || edition?.status === "approved";
  useEffect(() => { if (stage3View) setStage(3); }, [stage3View, edition ? editionKey(edition) : ""]);
  useEffect(() => {
    if (confirmPublish && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (!confirmPublish && dialog.current?.open) dialog.current.close();
  }, [confirmPublish]);

  function accept(result: ApiResult, nextDate = date) {
    viewDate.current = targetKey(nextDate);
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

  function acceptProgress(next: Edition) {
    if (editionKey(next) !== viewDate.current) return;
    setSnapshot(previous => {
      if (editionKey(next) !== viewDate.current || (previous.edition && (editionKey(previous.edition) !== editionKey(next) || previous.edition.revision > next.revision))) return previous;
      return { ...previous, edition: next, history: previous.history.map(item => (item.id || item.date) === editionKey(next) ? { date: next.date, id: next.id, explore: next.explore, status: next.status, updatedAt: next.updatedAt } : item) };
    });
    setEdition(previous => editionKey(next) !== viewDate.current || (previous && (editionKey(previous) !== editionKey(next) || previous.revision > next.revision)) ? previous : next);
    if (["publishing", "needs_check", "published"].includes(next.status)) setPublishUncertain(false);
  }

  async function loadDate(nextDate: string) {
    if (operation.current || !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return;
    if (unsaved && !window.confirm("저장하지 않은 원고나 등록 중인 뉴스가 있습니다. 입력을 버리고 선택한 판본을 불러올까요?")) return;
    operation.current = true;
    setPending("load"); setError(""); setMessage("");
    try {
      const result = localMode ? await localSnapshot(nextDate) : await readResponse(await fetch(`${API}?${new URLSearchParams({ date: targetKey(nextDate) })}`, { cache: "no-store", credentials: "same-origin" }));
      if (result.edition === undefined) throw new Error("판본 정보가 응답에 없습니다. 다시 시도해 주세요.");
      accept(result, nextDate); setActiveIndex(0); setSearch(""); setShowJpg(false); setManual(EMPTY_MANUAL); setExtractNotice(""); setExtractError("");
      setMessage(result.edition ? "저장된 판본을 불러왔습니다." : explore ? "이 날짜에는 Explore 원고가 없습니다. ‘웹툰 불러오기’를 눌러 시작하세요." : "아직 이 날짜의 판본이 없습니다. 뉴스레터를 불러오거나 뉴스를 직접 등록하세요.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "판본을 불러오지 못했습니다."); }
    finally { operation.current = false; setPending(""); }
  }

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (operation.current || (sessionExpired && action !== "logout")) return;
    if (action === "collect" && dirty && !window.confirm("저장하지 않은 수정이 있습니다. 수정을 버리고 뉴스레터 후보를 다시 불러올까요? 저장된 원고와 선택은 유지됩니다.")) return;
    if (action === "logout" && unsaved && !window.confirm("저장하지 않은 원고나 등록 중인 뉴스가 있습니다. 입력을 버리고 로그아웃할까요?")) return;
    operation.current = true; setPending(action); setError(""); setMessage("");
    try {
      const request = { action, date: targetKey(date), revision: saved?.revision ?? 0, ...extra };
      const result: ApiResult = localMode && action !== "logout" ? await localAction(request) : await readResponse(await fetch(API, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      }));
      if (action === "logout") { suppressUnload.current = true; window.location.reload(); return; }
      if (action === "check_explore_text") {
        const history = result.history;
        if (!history) throw new Error("발행 이력을 가져오지 못했습니다.");
        setSnapshot(previous => ({ ...previous, history })); setMessage(result.message || "발행 상태를 확인했습니다."); return;
      }
      if (result.edition === undefined) throw new Error("변경된 판본 정보가 응답에 없습니다. 상태를 새로 확인해 주세요.");
      accept(result);
      if (action === "collect") { setActiveIndex(0); setShowJpg(false); }
      const next = result.edition;
      if (action === "create_webtoon") setMessage("웹툰을 불러왔습니다. 실제 JPG와 게시글 설명을 검토한 뒤 발행하세요.");
      if (action === "collect") {
        const count = next ? selectableCandidates(next).length : 0;
        if (count < 10) setError(`후보 수집 미달: ${count}개입니다. 제작 완료로 처리할 수 없습니다. 뉴스레터의 공개 기사와 수집 상태를 확인해 주세요.`);
        else setMessage(`직접 등록한 뉴스를 포함해 후보 ${count}개가 준비됐습니다. 원문과 발행 시각을 확인해 10개를 선정하세요.`);
      }
      if (action === "add_manual") {
        setManual(EMPTY_MANUAL); setSearch(""); setShowJpg(false); setExtractNotice(""); setExtractError("");
        setMessage("뉴스를 후보에 등록했습니다. 작성 중인 원고도 함께 저장했습니다. 후보 목록에서 선택해 카드로 만드세요.");
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

  async function extractManualArticle() {
    if (!canRegister || operation.current || !safeHref(manual.sourceUrl)) return;
    if ((manual.title || manual.summary || manual.sourceName || manual.publishedAt) && !window.confirm("작성 중인 제목·내용을 한국어 제목과 핵심 요약으로 바꿀까요? 출처·발행 시각도 원문에서 가져오며, 확인되지 않는 시각은 비워집니다.")) return;
    operation.current = true; setPending("extract"); setError(""); setMessage(""); setExtractError(""); setExtractNotice("");
    try {
      const result = await readResponse(await fetch(`${API}/extract`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: manual.sourceUrl.trim() }), signal: AbortSignal.timeout(65000),
      }));
      const article = result.article;
      if (!article || typeof article.title !== "string" || typeof article.body !== "string" || typeof article.sourceName !== "string" || typeof article.publishedAt !== "string" || !safeHref(article.sourceUrl)) throw new Error("가져온 기사 형식을 확인하지 못했습니다. 내용을 직접 입력해 주세요.");
      setManual({ title: article.title, summary: article.body, sourceName: article.sourceName, sourceUrl: article.sourceUrl, publishedAt: kstInput(article.publishedAt) });
      setExtractNotice(`한국어 제목과 핵심 요약을 가져왔습니다. 본문에서 핵심 문장을 골라 한국어로 정리했습니다. 번역과 수치·조건을 원문과 대조한 뒤 등록하세요.${article.publishedAt ? " 발행 시각도 확인해 주세요." : " 정확한 발행 시각을 찾지 못했습니다. 원문에서 확인해 직접 입력해 주세요."}`);
    } catch (caught) {
      setExtractError(caught instanceof Error && caught.name === "TimeoutError" ? "원문 또는 번역 응답이 늦어 처리를 중단했습니다. 다시 시도하거나 직접 입력해 주세요." : caught instanceof Error ? caught.message : "한국어 제목과 요약을 가져오지 못했습니다. 직접 입력해 주세요.");
    } finally { operation.current = false; setPending(""); }
  }

  async function preparePublication() {
    if (operation.current || localMode || !canPublish) return;
    operation.current = true; setPending("check_connection"); setError(""); setAccount(null);
    try {
      const result = await readResponse(await fetch(API, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check_connection", date: targetKey(date), revision: saved?.revision }),
      }));
      if (!result.id || !result.username) throw new Error("발행할 Instagram 계정을 확인하지 못했습니다. 연결 설정을 확인해 주세요.");
      setAccount({ id: result.id, username: result.username }); setConfirmPublish(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Instagram 계정을 확인하지 못했습니다."); }
    finally { operation.current = false; setPending(""); }
  }

  async function openExplore() {
    if (operation.current || unsaved || localMode || sessionExpired || !snapshot.setup.storage || !pickedExplore) return;
    operation.current = true; setPending("create_webtoon"); setError("");
    try {
      await readResponse(await fetch(API, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_webtoon", date: `${date}~webtoon~${pickedExplore}` }) }));
      window.location.assign(`/admin/news/explore?${new URLSearchParams({ date, explore: pickedExplore })}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Explore 원고를 열지 못했습니다."); }
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
    if ((edition || manualDirty) && !window.confirm("현재 날짜의 원고와 등록 중인 입력을 가져온 파일의 초안으로 바꿀까요? 필요한 원고는 먼저 JSON으로 내보내 주세요.")) { input.value = ""; return; }
    operation.current = true; setPending("import"); setError(""); setMessage("");
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("원고 JSON은 2MB 이하 파일만 가져올 수 있습니다.");
      const draft: unknown = JSON.parse(await file.text());
      if (!draft || typeof draft !== "object" || !("date" in draft) || draft.date !== date) throw new Error("파일의 판본 날짜가 현재 선택 날짜와 다릅니다. 해당 날짜를 먼저 선택해 주세요.");
      const result = await localAction({ action: "import", date, revision: saved?.revision ?? 0, edition: draft });
      accept(result); setActiveIndex(0); setShowJpg(false); setManual(EMPTY_MANUAL); setExtractNotice(""); setExtractError(""); setMessage("원고를 초안으로 가져왔습니다. 원문 검토를 다시 확인한 뒤 승인하세요.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "원고 JSON을 가져오지 못했습니다."); }
    finally { input.value = ""; operation.current = false; setPending(""); }
  }

  function toggleCandidate(candidate: NewsCandidate) {
    if (!canEdit || !edition) return;
    const found = edition.cards.findIndex(item => item.candidateId === candidate.id);
    if (found < 0 && edition.cards.length >= 10) { setError("이미 10개를 선정했습니다. 다른 뉴스를 먼저 해제하세요."); return; }
    const cards = found >= 0 ? edition.cards.filter(item => item.candidateId !== candidate.id) : [...edition.cards, candidateCard(candidate)];
    setEdition({ ...edition, cards, caption: editorCaption(edition, cards) }); setMessage(""); setError("");
    const added = found < 0 ? cards.at(-1) : undefined, problems = added && !added.image ? copyIssues(added) : [];
    if (problems.length) setMessage(`카드 규격에 맞는 요약이 없어 원문 내용을 그대로 두었습니다. ${problems.join(" ")} 원문을 참고해 제목 2줄·본문 7줄 이내로 정리하세요.`);
    if (found < 0) setActiveIndex(cards.length - 1);
  }
  async function composeCards() {
    if (!canEdit || !edition || !selected.length || operation.current) return;
    if (!window.confirm("선정한 카드의 제목·본문을 짧은 카드용 요약으로 바꾸고 설명도 다시 만들까요? 기존 편집 내용을 보관하려면 먼저 원고 JSON을 내보내 주세요. 적용 후 원고를 저장하고 다시 검토해야 합니다.")) return;
    operation.current = true; setPending("compose"); setError(""); setMessage("");
    try {
      let refreshed = edition;
      if (!explore) {
        const response = await fetch(`/api/card-news-candidates?date=${date}`, { cache: "no-store" });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || "카드용 요약을 가져오지 못했습니다.");
        refreshed = preserveDraft(result.edition, edition);
      }
      let applied = 0;
      const cards = edition.cards.map(card => {
        const candidate = refreshed.candidates.find(c => c.id === card.candidateId);
        const copy = candidate && (["newsletter", "manual"].includes(candidate.origin) || isSupplement(candidate)) && ((candidate.cardCopy && fitCardCopy(candidate.cardCopy)) || copyFor(candidate).copy);
        if (copy) { applied++; return { ...card, ...copy, verified: false, verification: undefined }; }
        // Repair only an empty field with the original text; never overwrite what was edited.
        if (!candidate || card.image || (card.title.trim() && card.body.trim())) return card;
        const original = candidateCard(candidate);
        return { ...card, title: card.title.trim() ? card.title : original.title, body: card.body.trim() ? card.body : original.body, verified: false, verification: undefined };
      });
      setEdition({ ...edition, windowStart: refreshed.windowStart, candidates: refreshed.candidates, cards, caption: editorCaption(edition, cards, refreshed.candidates) }); setShowJpg(false);
      setMessage(`${applied}개 카드에 제목 최대 2줄·본문 최대 7줄 요약을 적용했습니다. 원고를 저장하고 내용을 다시 확인하세요.`);
      if (applied < cards.length) setError(`카드 ${cards.length - applied}개는 짧은 요약이 준비되지 않아 기존 원고를 유지했습니다. 해당 기사 내용을 직접 정리해 주세요.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "카드 원고를 정리하지 못했습니다."); }
    finally { operation.current = false; setPending(""); }
  }
  function changeCard(changes: Partial<NewsCard>) {
    if (!canEdit || !edition || !card) return;
    const cards = edition.cards.map((item, index) => index === currentIndex ? { ...item, verified: false, ...changes, verification: undefined } : item);
    setEdition({ ...edition, cards, caption: changes.title === undefined ? edition.caption : editorCaption(edition, cards) });
    setMessage("");
  }
  function moveCard(offset: number) {
    if (!canEdit || !edition) return;
    const next = currentIndex + offset;
    if (next < 0 || next >= edition.cards.length) return;
    const cards = [...edition.cards];
    [cards[currentIndex], cards[next]] = [cards[next], cards[currentIndex]];
    setEdition({ ...edition, cards, caption: editorCaption(edition, cards) }); setActiveIndex(next); setMessage("");
  }
  function removeCard() {
    if (!canEdit || !edition || !card) return;
    if (!window.confirm("이 카드 선택을 해제하고 설명의 번호 목록을 갱신할까요? 편집한 내용이 필요하면 먼저 원고 JSON을 내보내 주세요.")) return;
    const cards = edition.cards.filter((_, index) => index !== currentIndex);
    setEdition({ ...edition, cards, caption: editorCaption(edition, cards) }); setMessage("");
  }
  function regenerateCaption() {
    if (!canEdit || !edition) return;
    if (edition.caption.trim() && !window.confirm("현재 설명을 기본 소개 문구와 선택한 뉴스 제목 목록으로 바꿀까요? 직접 수정한 설명도 바뀝니다.")) return;
    setEdition({ ...edition, caption: editorCaption(edition, edition.cards) }); setMessage("");
  }

  const canApprove = canEdit && !unsaved && !issues.length && edition?.status === "draft";
  const canPublish = !localMode && !publishUncertain && !!edition && edition.status === "approved" && !unsaved && !issues.length && snapshot.setup.instagram && !pending && !sessionExpired;
  const canDownload = !!saved && ["approved", "published"].includes(saved.status) && !unsaved && !pending && !sessionExpired;
  const previewIssues = card && !card.image ? copyIssues(card) : [];
  const currentIssues = card && edition ? [...cardIssues(card), ...(timeIssue(card, edition) ? [timeIssue(card, edition)] : [])] : [];

  const openTools = () => { setToolsOpen(true); toolsDialog.current?.showModal(); };
  const logoutButton =<button className="cn-button" onClick={() => act("logout")} disabled={!!pending}>로그아웃</button>;
  const header = <header className="cn-header">
      <div><p className="cn-eyebrow">AgentTutor · {series}</p><h1>{explore ? "Explore 웹툰 발행" : "카드뉴스 관리"}</h1><p className="cn-muted">{explore ? explore.title : "뉴스 카드 10장을 직접 만들고 검토해 발행합니다."}</p></div>
      {logoutButton}
    </header>;

  const localAlert = localMode && <div className="cn-alert cn-alert-info"><strong>관리자 로그인됨 · 이 브라우저에 저장</strong><p>Instagram 연결 전에 뉴스 선정과 카드 제작을 할 수 있습니다. 원고는 현재 브라우저에만 저장되며, 기기를 바꾸거나 브라우저 데이터를 삭제하면 사용할 수 없습니다. JSON 내보내기로 원고를 보관하세요.</p><p>로그아웃해도 저장한 원고는 유지됩니다. 다시 관리자 비밀번호로 로그인하면 이어서 작업할 수 있습니다.</p><div className="cn-publish-actions"><button className="cn-button cn-button-small" onClick={exportJson} disabled={!edition || !!pending}>원고 JSON 내보내기</button><button className="cn-button cn-button-small" onClick={() => importInput.current?.click()} disabled={!!pending || locked}>원고 JSON 가져오기</button><input ref={importInput} type="file" accept="application/json,.json" hidden onChange={importJson} /></div></div>;

  const links = <>
    <p><a className="cn-text-link" href="/admin/news/settings">뉴스레터 기준 설정으로 이동 →</a></p>
    <p><a className="cn-text-link" href="/admin/news/instagram">Instagram 연결·자동 제작과 예약 발행으로 이동 →</a></p>

    {!explore && <p><a className="cn-text-link" href="/admin/news/explore">Explore 웹툰 발행으로 이동 →</a></p>}
    {explore && <section className="cn-panel" aria-labelledby="cn-explore-heading">
      <h2 id="cn-explore-heading">Explore 웹툰 발행</h2>
      <p className="cn-muted">문서에 이미 만들어진 웹툰을 그대로 사용합니다. 한 장은 사진 게시물로, 여러 장은 넘겨 보는 게시물로 발행합니다.</p>
      <label className="cn-field">발행할 문서<select aria-label="발행할 문서" value={pickedExplore} onChange={event => setPickedExplore(event.target.value)} disabled={!!pending}>{exploreDocs.map(doc => <option key={doc.slug} value={doc.slug}>{doc.title}</option>)}</select></label>
      <p className="cn-help">{exploreDocs.find(doc => doc.slug === pickedExplore)?.summary}</p>
      <div className="cn-publish-actions"><button className="cn-button cn-button-primary" onClick={openExplore} disabled={!!pending || unsaved || localMode || sessionExpired || !snapshot.setup.storage || !pickedExplore}>선택한 문서의 웹툰 불러오기</button>{pickedExplore && <a className="cn-text-link" href={`/explore/${encodeURIComponent(pickedExplore)}`} target="_blank" rel="noopener noreferrer">문서 보기</a>}{explore && <a className="cn-text-link" href="/admin/news">일일 뉴스 관리로 돌아가기</a>}</div>
      <p className="cn-help">처음 열면 등록된 웹툰 이미지를 불러옵니다. 저장한 웹툰 원고가 있으면 그대로 엽니다. 기존 텍스트 초안은 정리하며, 발행은 검토 후 진행합니다.{unsaved && " 현재 원고를 먼저 저장하거나 입력을 비워 주세요."}{localMode && " Explore 원고에는 서버 저장소 연결이 필요합니다."}</p>
    </section>}
  </>;

  const dateField = <label className="cn-field">{daily ? "날짜 · KST" : "판본 날짜 · KST"}<input type="date" value={date} onChange={event => loadDate(event.target.value)} disabled={!!pending} /></label>;
  const statusTags = <>
        {edition && <span className={`cn-tag ${edition.status === "published" || edition.status === "approved" ? "cn-tag-ok" : edition.status === "needs_check" ? "cn-tag-warn" : "cn-tag-info"}`}>{STATUS[edition.status]}</span>}
        {dirty && <span className="cn-tag cn-tag-warn">저장하지 않은 수정</span>}
        {manualDirty && <span className="cn-tag cn-tag-warn">등록 중인 뉴스</span>}
  </>;
  const saveButton = <button className="cn-button cn-button-primary" onClick={() => edition && act("save", { cards: edition.cards, caption: edition.caption, candidates: edition.candidates })} disabled={!canEdit || !dirty}>원고 저장</button>;
  const collectButtons = <>
          {!explore && <button className="cn-button" onClick={() => act("collect")} disabled={!!pending || locked || edition?.status === "approved" || sessionExpired || (!localMode && !snapshot.setup.storage)}>{edition ? "뉴스레터 다시 불러오기" : "뉴스레터 불러오기"}</button>}
          {explore && !edition && <button className="cn-button" onClick={() => act("create_webtoon")} disabled={!!pending || sessionExpired}>웹툰 불러오기</button>}
  </>;
  const toolbarActions = <div className="cn-toolbar-actions">
          <button className="cn-button" onClick={() => loadDate(date)} disabled={!!pending}>상태 새로 확인</button>
          {collectButtons}
          {!daily && saveButton}
  </div>;
  const dateInfo = <>
      <p className="cn-help">{edition ? explore ? `문서 날짜 ${edition.candidates[0]?.publishedAt || explore.date} · 초안 생성 ${formatTime(edition.collectedAt)} KST · 저장본 v${edition.revision}` : `후보 발행 기간 ${formatTime(edition.windowStart)} ~ ${formatTime(edition.windowEnd)} KST · 불러옴 ${formatTime(edition.collectedAt)} · 저장본 v${edition.revision}` : explore ? "선택한 문서에 등록된 웹툰을 불러올 수 있습니다." : "뉴스레터에 공개된 전체 기사를 최신순으로 불러옵니다. 판본 날짜 이후의 기사는 제외합니다."}</p>
      {!explore && <p className="cn-help"><a className="cn-text-link" href="/today" target="_blank" rel="noopener noreferrer">뉴스레터 열기</a> · 뉴스레터·직접 등록 뉴스를 우선 사용하고, 자동 제작 시 부족하면 릴리스·용어·Explore로 보충합니다. 목록은 중요도 순위가 아닙니다.</p>}
      {retainedCount > 0 && <p className="cn-alert cn-alert-info">이전 후보 {retainedCount}개는 원고 보존용으로 남겨 두었습니다. 새 뉴스레터 후보 수에는 포함하지 않으며, 해당 카드는 뉴스레터 후보로 다시 선정해야 합니다.</p>}
      {edition && !edition.candidateSource && !explore && <p className="cn-alert cn-alert-info">이전 방식으로 저장한 판본입니다. 뉴스레터 다시 불러오기를 누르면 저장한 카드와 설명을 유지하며 후보를 갱신합니다.</p>}
      <p className="cn-help">{explore ? "웹툰의 그림·말풍선과 게시글 설명을 확인하세요. 검토 후 발행 버튼으로 게시하며, 최근 Instagram 게시 후 최소 1시간이 지나야 합니다." : "직접 편집한 원고는 검토 후 아래 발행 버튼으로 게시합니다. 매일 자동 제작·발행 여부와 시간은 Instagram 연결 페이지에서 확인하세요."}</p>
      {edition?.automation && <p className="cn-alert cn-alert-info">자동 제작된 판본입니다. 날짜·중복·글 길이를 자동 점검했으며, 사람이 원문을 검토한 것으로 표시하지 않습니다. 원고를 수정·저장하면 자동 발행 대상에서 빠지고 다시 검토해야 합니다.</p>}
  </>;
  const statusBlock = <>
      {pending &&<p className="cn-alert cn-alert-info" role="status">{ACTION_LABEL[pending] || "처리 중…"}</p>}
      {error && <div className="cn-alert cn-alert-error" role="alert"><p>{error}</p>{sessionExpired && <button className="cn-button cn-button-small" onClick={() => { if (!unsaved || window.confirm("저장하지 않은 원고와 등록 중인 입력은 사라집니다. 따로 보관했다면 로그인 화면으로 이동할까요?")) { suppressUnload.current = true; window.location.reload(); } }}>다시 로그인</button>}</div>}
      {message && (daily ? <details className="cn-alert cn-alert-success cn-alert-compact" role="status"><summary>{message}</summary></details> : <p className="cn-alert cn-alert-success" role="status">{message}</p>)}
      {!explore && edition && candidateCount < 10 && <div className="cn-alert cn-alert-error"><strong>뉴스 수집 부족 · {candidateCount}/10</strong><p>정상 제작 완료 상태가 아닙니다. 자동 제작으로 미발행 릴리스·용어·Explore를 보충하거나 뉴스를 직접 등록하세요. 원고 검사를 통과한 서로 다른 콘텐츠 10개가 필요합니다.</p></div>}
  </>;
  const progress = !localMode && edition && (edition.publication || pending === "publish" || publishUncertain || ["publishing", "needs_check", "published"].includes(edition.status)) && <PublicationProgress key={editionKey(edition)} edition={edition} pending={pending} uncertain={publishUncertain} sessionExpired={sessionExpired} onEdition={acceptProgress} onExpired={() => setSessionExpired(true)} onContinue={() => act("reconcile")} />;

  const openManual = () => { openTools(); if (manualRef.current) { manualRef.current.open = true; manualRef.current.querySelector("input")?.focus(); } };
  const manualPanel = !explore && <details ref={manualRef} className="cn-panel cn-manual-panel">
      <summary>뉴스 직접 등록</summary>
      <p className="cn-muted">제목·내용·출처·발행 시각을 입력해 이 날짜의 카드뉴스 후보에 추가하세요. 공개 뉴스레터에는 올라가지 않습니다.</p>
      <form className="cn-form" onSubmit={event => {
        event.preventDefault();
        if (!canRegister || manualTooLong) return;
        void act("add_manual", {
          candidate: { ...manual, publishedAt: fromKstInput(manual.publishedAt) },
          ...(edition ? { cards: edition.cards, candidates: edition.candidates, caption: edition.caption } : {}),
        });
      }}>
        <div className="cn-url-extract">
          <label className="cn-field">원문 URL<input required type="url" maxLength={2000} placeholder="https://" value={manual.sourceUrl} onChange={event => { setManual({ ...manual, sourceUrl: event.target.value }); setExtractNotice(""); setExtractError(""); }} disabled={!canRegister} /></label>
          <button className="cn-button" type="button" onClick={extractManualArticle} disabled={!canRegister || !safeHref(manual.sourceUrl)}>{pending === "extract" ? "요약·번역 중…" : "한국어 제목·요약 가져오기"}</button>
        </div>
        <p className="cn-help">제목은 한국어로 번역하고, 본문은 핵심 문장을 추려 한국어로 요약합니다. 이미 한국어인 기사는 요약만 합니다. 결과를 검토한 뒤 등록하세요.</p>
        {extractNotice && <p className="cn-alert cn-alert-success" role="status">{extractNotice}</p>}
        {extractError && <p className="cn-alert cn-alert-error" role="alert">{extractError} 기존 입력은 유지했습니다.</p>}
        <label className="cn-field">뉴스 제목<input aria-label="뉴스 제목" required maxLength={200} value={manual.title} onChange={event => setManual({ ...manual, title: event.target.value })} disabled={!canRegister} /><small>{manual.title.length.toLocaleString()}/200자</small></label>
        <label className="cn-field">뉴스 내용<textarea aria-label="뉴스 내용" aria-describedby="cn-manual-copy-help" required rows={manual.summary.length > 600 ? 10 : 4} maxLength={600} value={manual.summary} onChange={event => setManual({ ...manual, summary: event.target.value })} disabled={!canRegister} /><small id="cn-manual-copy-help">{manual.summary.length.toLocaleString()}/600자 · 카드에는 제목 최대 2줄·본문 최대 7줄로 정리합니다.</small></label>
        {manualTooLong && <p className="cn-alert" role="status">가져온 내용을 임의로 자르지 않았습니다. 제목 200자·내용 600자·출처 100자 이내로 정리하면 등록할 수 있습니다.</p>}
        <div className="cn-field-pair">
          <label className="cn-field">출처 이름<input required maxLength={100} placeholder="매체 또는 발표 기관" value={manual.sourceName} onChange={event => setManual({ ...manual, sourceName: event.target.value })} disabled={!canRegister} /></label>
          <label className="cn-field">원문 발행 시각 · KST<input required type="datetime-local" step="1" max={`${date}T23:59:59`} value={manual.publishedAt} onChange={event => setManual({ ...manual, publishedAt: event.target.value })} disabled={!canRegister} /><small>원문에서 확인한 실제 한국 시각을 입력하세요.</small></label>
        </div>
        <div className="cn-publish-actions">
          <button className="cn-button cn-button-primary" type="submit" disabled={!canRegister || manualTooLong}>뉴스 등록</button>
          <button className="cn-button" type="button" disabled={!manualDirty || !canRegister} onClick={() => { if (window.confirm("등록 중인 뉴스 입력을 비울까요?")) { setManual(EMPTY_MANUAL); setExtractNotice(""); setExtractError(""); } }}>입력 비우기</button>
        </div>
        <p className="cn-help">등록하면 작성 중인 카드 원고도 함께 저장됩니다. 등록한 뉴스는 후보 목록에서 선택할 수 있으며, 뉴스레터를 다시 불러와도 유지됩니다.</p>
      </form>
    </details>;

  const emptyState = <section className="cn-empty" style={{ marginTop: daily ? 0 : 22 }}><h2>아직 준비된 판본이 없습니다</h2><p>{explore ? "‘웹툰 불러오기’를 눌러 등록된 이미지를 선택하세요." : "‘뉴스레터 불러오기’ 또는 ‘뉴스 직접 등록’으로 시작하세요. 뉴스 10개를 선정하고 저장한 뒤 원문 확인과 최종 검토를 진행하세요."}</p></section>;
  const stats = edition && <div className="cn-stats" aria-label="제작 진행 상황">
        <div className={`cn-stat ${candidateCount < (explore ? 1 : 10) ? "cn-stat-warn" : ""}`}><span>{explore ? "등록된 웹툰" : "뉴스 후보 · 직접 등록 포함"}</span><strong>{candidateCount}개</strong></div>
        <div className={`cn-stat ${(explore ? selected.length < 1 : selected.length !== 10) ? "cn-stat-warn" : ""}`}><span>{explore ? "선택한 웹툰" : "선정한 뉴스"}</span><strong>{selected.length}{explore ? "장 · 최대 10장" : "/10"}</strong></div>
        <div className={`cn-stat ${verifiedCount !== expectedCount ? "cn-stat-warn" : ""}`}><span>사람이 확인한 원문</span><strong>{verifiedCount}/{expectedCount}</strong></div>
      </div>;
  const candidatesSection = edition && <section className="cn-panel" aria-labelledby="cn-candidates-heading">
          <div className="cn-section-head"><div><h2 id="cn-candidates-heading">1. {explore ? "웹툰 선택" : "뉴스 후보 선정"}</h2><p className="cn-muted">{explore ? "게시할 웹툰을 선택하세요. 비교 웹툰이 있으면 함께 올리거나 선택을 해제할 수 있습니다." : "서로 다른 뉴스·보충 콘텐츠 10개를 골라 주세요. 보충 항목에는 종류가 표시됩니다."}</p></div></div>
          <label className="cn-field">후보 검색<input type="search" placeholder="제목·출처·내용 검색" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <div className="cn-candidates">
            {candidates.length ? candidates.map(candidate => {
              const index = selected.findIndex(item => item.candidateId === candidate.id);
              return <div className="cn-candidate" key={candidate.id}>
                <label className="cn-candidate-label"><input type="checkbox" checked={index >= 0} disabled={!canEdit || (selected.length >= 10 && index < 0)} onChange={() => toggleCandidate(candidate)} /><span className="cn-candidate-title">{candidate.title} {candidate.origin === "manual" && <span className="cn-tag">직접 등록</span>} {isSupplement(candidate) && <span className="cn-tag">{CONTENT_LABELS[candidate.origin as keyof typeof CONTENT_LABELS]}{explore ? "" : " 보충"}</span>} {index >= 0 && <span className="cn-tag cn-tag-info">카드 {index + 1}</span>}</span></label>
                {candidate.image && <img src={candidate.image.src} alt={candidate.image.alt} loading="lazy" style={{ width: "100%", maxHeight: 280, objectFit: "contain" }} />}
                <p>{candidate.summary || "요약이 없습니다. 원문을 읽고 카드 본문을 작성하세요."}</p>
                <div className="cn-candidate-meta">{safeHref(candidate.sourceUrl) ? <a className="cn-text-link" href={safeHref(candidate.sourceUrl)} target="_blank" rel="noopener noreferrer">{candidate.sourceName || "원문 보기"}</a> : <span>유효한 원문 주소 필요</span>}<span>{isSupplement(candidate) ? contentDateLabel(candidate) : candidate.datePrecision === "time" ? `${formatTime(candidate.publishedAt)} KST` : `${candidate.publishedAt} · 날짜만 확인`}</span>{candidate.newsletterId && <a className="cn-text-link" href={`/today/${encodeURIComponent(candidate.newsletterId)}`} target="_blank" rel="noopener noreferrer">뉴스레터 보기</a>}</div>
              </div>;
            }) : <p className="cn-muted">{search ? "검색 결과가 없습니다." : "뉴스 후보가 없습니다. 뉴스레터를 불러오거나 뉴스를 직접 등록하세요."}</p>}
          </div>
          {selected.length >= 10 && <p className="cn-help">10개를 선정했습니다. 다른 후보를 고르려면 기존 선택을 해제하세요.</p>}
        </section>;

  const verifyBox = card && <label className="cn-check"><input type="checkbox" checked={card.verified} disabled={!canEdit || exactTimeNeeded} onChange={event => changeCard({ verified: event.target.checked })} /><span>{explore ? "웹툰 그림·말풍선·출처와 실제 JPG의 글씨를 확인했습니다." : daily ? "원문·수치·날짜·중복을 확인했습니다." : "원문·수치·기록된 날짜를 확인했고 다른 카드와 같은 내용이 아님을 확인했습니다."}</span></label>;
  const OrderBox: "details" | "div" = daily ? "details" : "div";
  const cardTabs = <div className="cn-card-tabs" aria-label="편집할 카드 선택">{selected.map((item, index) => <button className="cn-card-tab" key={item.candidateId} aria-pressed={index === currentIndex} aria-label={`${index + 1}번 카드: ${item.title.replace(/\n/g, " ")}`} onClick={() => setActiveIndex(index)}>{index + 1}{item.verified ? " ✓" : ""}</button>)}</div>;
  const editorSection = edition && <section className={`cn-panel${daily ? " cn-editor-daily" : ""}`} aria-labelledby="cn-editor-heading">
            <div className="cn-section-head"><div><h2 id="cn-editor-heading">2. {explore ? "웹툰 확인과 순서" : "카드 원고와 순서"}</h2><p className="cn-muted">{explore ? "원본 전체를 자르지 않고 1080×1350 JPG에 맞춥니다. 긴 웹툰은 그림이 작아질 수 있으니 실제 JPG로 글씨를 확인하세요." : "제목 최대 2줄 · 본문 최대 7줄 · 말줄임표 없이 핵심 내용 정리"}</p></div>{daily && !!selected.length && cardTabs}{!explore && <button className="cn-button cn-button-small" onClick={composeCards} disabled={!canEdit || !selected.length}>{daily ? "원고 정리" : "선정한 카드 원고 정리"}</button>}</div>
            {selected.length ? <>
              {!daily && cardTabs}
              {card && <>
                <div className={daily ? "cn-order-verify" : undefined}>
                <OrderBox className="cn-order-tools">{daily && <summary>순서·선택</summary>}
                <div className="cn-card-actions"><button className="cn-button cn-button-small" onClick={() => moveCard(-1)} disabled={!canEdit || currentIndex === 0}>앞으로 이동</button><button className="cn-button cn-button-small" onClick={() => moveCard(1)} disabled={!canEdit || currentIndex === selected.length - 1}>뒤로 이동</button><button className="cn-button cn-button-small" disabled={!canEdit} onClick={removeCard}>카드 선택 해제</button><span className="cn-help">현재 {currentIndex + 1}번째 카드</span></div>
                </OrderBox>
                {daily && <div className="cn-verify-row">{verifyBox}{exactTimeNeeded && <span className="cn-help">정확한 발행 시각 입력 후 확인할 수 있습니다.</span>}</div>}
                </div>
                <div className={daily ? "cn-editor-scroll" : undefined}>
                <div className="cn-editor-grid">
                  <div className="cn-editor-fields">
                    {card.verification === "automatic" && <p className="cn-help"><span className="cn-tag cn-tag-info">자동 제작</span> 원문 확인 체크는 사람이 직접 확인한 경우에만 선택하세요.</p>}
                    {!card.image && <>
                    <label className="cn-field">제목 · {card.title.split("\n").length}/2줄<textarea rows={2} value={card.title} onChange={event => changeCard({ title: event.target.value })} disabled={!canEdit} /><small>줄바꿈 위치가 이미지에 그대로 반영됩니다.</small></label>
                    <label className="cn-field">본문 · {card.body.split("\n").length}/7줄<textarea rows={7} value={card.body} onChange={event => changeCard({ body: event.target.value })} disabled={!canEdit} /></label>
                    {[card.title, card.body].some(text => text.trim() && !/[가-힣]/.test(text)) && <p className="cn-alert">영문 원문이 그대로 들어간 초안은 한국어 제목과 본문으로 편집한 뒤 검토하세요.</p>}
                    </>}
                    {card.image && <p className="cn-help">등록된 원본 웹툰입니다. 이미지 속 글과 그림은 이 화면에서 바꾸지 않습니다.</p>}
                    <label className="cn-field">출처 이름<input value={card.sourceName} onChange={event => changeCard({ sourceName: event.target.value })} disabled={!canEdit || !!explore} /></label>
                    <label className="cn-field">원문 주소<input type="url" value={card.sourceUrl} onChange={event => changeCard({ sourceUrl: event.target.value })} disabled={!canEdit || !!explore} /></label>
                    {safeHref(card.sourceUrl) && <a className="cn-text-link" href={safeHref(card.sourceUrl)} target="_blank" rel="noopener noreferrer">원문을 새 탭에서 확인</a>}
                    {usesContentDate(currentCandidate) ? <p className="cn-help">콘텐츠 기준: {contentDateLabel(currentCandidate!)}. 원문 기록을 사용하며 시각을 임의로 만들지 않습니다.</p> : <label className="cn-field">확인한 발행 시각 · KST<input type="datetime-local" step="1" value={exactTimeNeeded ? "" : kstInput(card.publishedAt)} onChange={event => changeCard({ publishedAt: fromKstInput(event.target.value) })} disabled={!canEdit} /><small>{exactTimeNeeded ? "날짜만으로 선정 구간 안의 기사인지 판단할 수 없습니다. 원문의 정확한 시각이 필요합니다." : "기사 작성·추가 공개 시각과 사건 발생 시점을 구분해 주세요."}</small></label>}
                    {!daily && verifyBox}
                    {!!currentIssues.length && <ul className="cn-issues">{currentIssues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul>}
                  </div>
                  <div className="cn-preview-column">
                    {card.image ? <img className="cn-jpg" src={card.image.src} alt={card.image.alt} style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "contain", background: "#fff" }} /> : previewIssues.length ? <div className="cn-empty" role="status"><strong>카드 내용 정리가 필요합니다</strong><p>{previewIssues.join(" ")}</p><p>제목은 최대 2줄, 본문은 최대 7줄로 완결되게 작성하세요. 말줄임표는 사용할 수 없습니다. 원문 내용을 직접 줄이거나 ‘선정한 카드 원고 정리’로 준비된 요약을 적용하세요.</p></div> : <div className="cn-card-preview" aria-label="편집 중 카드 배치 미리보기"><div className="cn-card-surface"><div className="cn-card-band"><span className="cn-card-series">{series}</span><span className="cn-card-brand">AgentTutor</span></div><div className="cn-card-copy" style={{ top: `${CARD_LAYOUT.titleTop / 10.8}cqw` }}><p className="cn-card-headline" style={{ fontSize: `${cardFontSize(card.title, CARD_LAYOUT.titleSize) / 10.8}cqw`, lineHeight: `${CARD_LAYOUT.titleLineHeight / 10.8}cqw` }}>{card.title || "제목을 입력하세요"}</p><p className="cn-card-body" style={{ fontSize: `${cardFontSize(card.body, CARD_LAYOUT.bodySize) / 10.8}cqw`, top: `${(cardBodyTop(card.title) - CARD_LAYOUT.titleTop) / 10.8}cqw` }}>{card.body || "본문을 입력하세요"}</p></div><p className="cn-card-source" style={{ left: `${CARD_SOURCE.left / 10.8}cqw`, top: `${CARD_SOURCE.top / 10.8}cqw`, width: `${CARD_SOURCE.width / 10.8}cqw`, fontSize: `${cardFontSize(cardSourceLines(card).join("\n"), CARD_SOURCE.fontSize) / 10.8}cqw`, lineHeight: `${CARD_SOURCE.lineHeight / 10.8}cqw`, letterSpacing: `${CARD_SOURCE.letterSpacing / CARD_SOURCE.fontSize}em`, color: CARD_SOURCE.color }}>{cardSourceLines(card).join("\n")}</p></div></div>}
                    <p className="cn-preview-label">{card.image ? "원본 웹툰 미리보기 · 실제 저장본 JPG에서 글씨 크기를 확인하세요." : "편집 미리보기 · 최종 줄바꿈과 넘침은 저장본 JPG에서 확인하세요."}</p>
                    <button className="cn-button cn-button-small" title={card.image ? "원본 웹툰 미리보기 · 실제 저장본 JPG에서 글씨 크기를 확인하세요." : "최종 줄바꿈과 넘침은 저장본 JPG에서 확인하세요."} onClick={() => { setJpgError(false); setShowJpg(value => !value); }} disabled={!hasSavedImage || !!pending || sessionExpired}>{showJpg ? "저장본 JPG 접기" : "실제 저장본 JPG 보기"}</button>
                    {!hasSavedImage && <p className="cn-help">이 카드를 저장하면 실제 JPG를 볼 수 있습니다.</p>}
                    {showJpg && hasSavedImage && <div className="cn-jpg-section">{dirty && <p className="cn-alert">아래 JPG는 수정 전 저장본입니다. 원고를 저장해야 최신 내용이 반영됩니다.</p>}{jpgPending ? <p className="cn-help" role="status">저장한 원고로 JPG를 만드는 중…</p> : jpgError ? <p className="cn-alert cn-alert-error" role="alert">JPG를 가져오지 못했습니다. 원고의 줄 길이{localMode ? "와 브라우저 상태" : "와 로그인 상태"}를 확인하고, 저장 후 다시 열어 주세요.</p> : jpgUrl && <img className="cn-jpg" key={jpgUrl} src={jpgUrl} width={1080} height={1350} alt={`저장된 ${savedIndex + 1}번 카드 JPG`} onError={() => setJpgError(true)} />}<p className="cn-preview-label">저장본 v{saved?.revision} · 1080 × 1350 JPG</p></div>}
                  </div>
                </div>
                </div>
              </>}
            </> : <div className="cn-empty"><p>후보에서 뉴스를 선택하면 카드 원고를 편집할 수 있습니다.</p></div>}
          </section>;

  const publishActions = edition && <div className="cn-publish-actions">
              <button className="cn-button" onClick={() => act("approve")} disabled={!canApprove}>{edition.status === "approved" && !dirty ? "검토 완료됨" : `${selected.length}개 원고 검토 완료`}</button>
              {canDownload ? localMode ? <button className="cn-button" onClick={downloadLocalBundle}>JPG 10장 ZIP 받기</button> : <a className="cn-button" href={`${API}?${new URLSearchParams({ date: targetKey(date), download: "zip", revision: String(saved!.revision) })}`}>JPG {selected.length}장 ZIP 받기</a> : <button className="cn-button" disabled>검토 후 ZIP 받기</button>}
              <button className="cn-button cn-button-primary" onClick={preparePublication} disabled={!canPublish}>Instagram에 발행</button>
            </div>;

  const captionSection = edition && <section className="cn-panel cn-caption-panel" aria-labelledby="cn-publish-heading">
            <div className="cn-section-head"><div><h2 id="cn-publish-heading">3. 설명 검토와 발행</h2><p className="cn-muted">{explore ? "문서 소개와 원문 링크를 확인하고 게시글 설명을 수정하세요." : "소개 문구 아래에 선택한 카드 제목이 순서대로 자동 입력됩니다."}</p></div></div>
            <label className="cn-field">게시글 설명 · {Array.from(edition.caption).length.toLocaleString()}/2,200자<textarea rows={8} value={edition.caption} onChange={event => { if (canEdit) { setEdition({ ...edition, caption: event.target.value }); setMessage(""); } }} disabled={!canEdit} /></label>
            <p className="cn-help">{explore ? "웹툰 선택과 순서를 바꿔도 작성한 설명은 유지됩니다." : "설명을 직접 수정할 수 있습니다. 뉴스 선택·해제·순서·제목을 바꾸거나 카드 원고를 정리하면 설명이 다시 만들어집니다."}</p>
            {!explore && <div className="cn-publish-actions"><button className="cn-button cn-button-small" onClick={regenerateCaption} disabled={!canEdit}>선택한 카드 제목으로 설명 다시 만들기</button></div>}
            {!!issues.length && !locked && <details className="cn-details" open={daily || undefined}><summary>검토 완료 전 확인할 항목 {issues.length}개</summary><ul className="cn-issues">{issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul></details>}
            {dirty && <p className="cn-alert">원고를 먼저 저장하세요. 승인 후 수정하면 다시 검토해야 합니다.</p>}
            {manualDirty && <p className="cn-alert">입력 중인 뉴스를 등록하거나 입력을 비운 뒤 검토를 완료하세요.</p>}
            {!snapshot.setup.instagram && <p className="cn-alert">Instagram 발행 연결이 준비되지 않았습니다. 원고 작성·검토와 ZIP 다운로드는 지금도 이용할 수 있습니다. <a className="cn-text-link" href="/admin/news/instagram">Instagram 연결 관리에서 상태 확인</a>{localMode && <> 서버 저장소로 전환하기 전에는 원고를 JSON으로 보관해 주세요. <a className="cn-text-link" href="#cn-setup-heading" onClick={daily ? event => { event.preventDefault(); openTools(); } : undefined}>연결 준비 상태 보기</a></>}</p>}
            {!daily && publishActions}
            <p className="cn-help">{localMode ? "브라우저 원고 모드에서는 Instagram에 게시되지 않습니다. 계정 연결 후 서버 관리자 모드에서 발행합니다." : "최종 확인 창에서 동의한 뒤 실제로 게시합니다. 카드 원고를 저장하거나 검토 완료하는 것만으로 게시되지는 않습니다."}</p>
          </section>;

  const bottom = <div className="cn-bottom">
      <section className="cn-panel" aria-labelledby="cn-setup-heading"><h2 id="cn-setup-heading">연결 준비 상태</h2><ul className="cn-setup-list">{([
        ["auth", "관리자 인증"], ["storage", "원고·발행 기록 저장소"], ["instagram", "Instagram 발행 연결"],
      ] as const).map(([key, label]) => <li key={key}><span>{localMode && key === "storage" ? "현재 브라우저 원고 저장" : label}</span><span className={`cn-tag ${snapshot.setup[key] || (localMode && key === "storage") ? "cn-tag-ok" : "cn-tag-warn"}`}>{localMode && key === "storage" ? "이 브라우저" : snapshot.setup[key] ? "설정됨" : "준비 필요"}</span></li>)}</ul><p className="cn-help">{localMode ? "관리자 로그인 후 브라우저에서 카드 제작을 할 수 있습니다. 서버 저장소·Instagram 연결·일일 예약은 나중에 설정합니다." : "설정 여부를 표시합니다. 실제 수집·게시 성공 여부는 각 실행 결과에서 확인하세요."}</p>
        {!!edition?.sources.length && <details className="cn-details"><summary>최근 수집 출처 {edition.sources.length}곳 확인</summary><div className="cn-source-status">{edition.sources.map((source, index) => <span className={`cn-tag ${source.status === "ok" ? "cn-tag-ok" : "cn-tag-warn"}`} key={`${source.name}-${index}`} title={source.message}>{source.name} · {source.status === "ok" ? `${source.count}개` : "실패"}</span>)}</div>{edition.sources.filter(source => source.status === "failed").map((source, index) => <p className="cn-help" key={`${source.name}-${index}`}>{source.name}: {source.message || "가져오지 못했습니다. 출처 상태를 확인한 뒤 재수집하세요."}</p>)}</details>}
      </section>
      <section className="cn-panel" aria-labelledby="cn-history-heading"><h2 id="cn-history-heading">판본 이력</h2>{snapshot.history.length ? <ul className="cn-history">{snapshot.history.filter(item => !item.explore || item.explore.format === "webtoon" || ["published", "publishing", "needs_check"].includes(item.status)).map(item => {
        const current = (item.id || item.date) === targetKey(date);
        const href = `/admin/news${item.explore ? "/explore" : ""}?${new URLSearchParams({ date: item.date, ...(item.explore ? { explore: item.explore.slug } : {}) })}`;
        return <li key={item.id || item.date}><div><a className="cn-history-date" href={item.explore && item.explore.format !== "webtoon" ? undefined : href} aria-current={current ? "page" : undefined} onClick={event => { if (pending) event.preventDefault(); }}>{item.date} · {item.explore ? `Explore ${item.explore.format === "webtoon" ? "웹툰" : "텍스트 발행 기록"} · ${item.explore.title}` : "AI News 10"}{current ? " · 현재 판본" : ""}</a><small>최근 변경 {formatTime(item.updatedAt)} KST</small>{item.explore && item.explore.format !== "webtoon" && ["publishing", "needs_check"].includes(item.status) && <button className="cn-button cn-button-small" disabled={!!pending || localMode || sessionExpired} onClick={() => act("check_explore_text", { date: item.id })}>이전 발행 결과 확인</button>}{current && edition?.publication && <><small>{publicationSummary(edition)}</small><a className="cn-text-link" href="#cn-publication-progress" onClick={daily ? event => { event.preventDefault(); toolsDialog.current?.close(); setStage(3); } : undefined}>발행 진행 자세히 보기 ↑</a></>}</div><span className={`cn-tag ${item.status === "published" ? "cn-tag-ok" : item.status === "needs_check" ? "cn-tag-warn" : ""}`}>{STATUS[item.status]}</span></li>;
      })}</ul> : <p className="cn-muted">저장된 판본 이력이 없습니다.</p>}{edition?.publication?.message && <p className="cn-help">최근 발행 기록: {edition.publication.message}</p>}</section>
    </div>;

  const publishDialog = <dialog ref={dialog} className="cn-dialog" onCancel={() => setConfirmPublish(false)} onClose={() => setConfirmPublish(false)} aria-labelledby="cn-confirm-heading">
      <h2 id="cn-confirm-heading">Instagram에 이 판본을 발행할까요?</h2>
      <p><strong>{date} · 카드 {selected.length}장 · 저장본 v{saved?.revision}</strong></p><p>발행할 계정: <strong>@{account?.username}</strong></p><p>위 Instagram 계정에 카드 {selected.length}장과 저장된 설명을 하나의 게시물로 공개합니다. 실제 JPG, 원문 확인, 카드 순서를 마지막으로 확인해 주세요.</p>
      <div className="cn-publish-actions"><button className="cn-button" onClick={() => setConfirmPublish(false)}>돌아가서 확인</button><button className="cn-button cn-button-primary" disabled={!canPublish || !account} onClick={() => { if (!account) return; setConfirmPublish(false); void act("publish", { confirm: true, accountId: account.id }); }}>확인 · {selected.length}장 발행</button></div>
    </dialog>;

  const steps = [[1, "뉴스 선택"], [2, "카드 검토"], [3, "발행"]] as const;
  const nextBlocked = stage === 1 && !selected.length;
  const checks: [boolean, string][] = edition ? [
    [selected.length === expectedCount, `선정한 뉴스 ${selected.length}/${expectedCount}`],
    [verifiedCount === expectedCount, `사람이 확인한 원문 ${verifiedCount}/${expectedCount}`],
    [!unsaved, unsaved ? "저장하지 않은 원고 또는 등록 중인 뉴스가 있습니다" : "원고 저장됨"],
    [["approved", "published"].includes(edition.status), `판본 상태: ${STATUS[edition.status]}`],
    [!issues.length, issues.length ? `확인할 항목 ${issues.length}개` : "확인할 항목 없음"],
    [localMode ? false : snapshot.setup.instagram, localMode ? "브라우저 원고 모드 · Instagram 발행 불가" : snapshot.setup.instagram ? "Instagram 연결됨" : "Instagram 연결 필요"],
    [!sessionExpired, sessionExpired ? "로그인 만료" : "로그인 유지 중"],
  ] : [];

  return <main className={`cn-shell cn-admin-shell${daily ? " cn-daily" : ""}`}>
    {daily ? <>
      <div className="cn-daily-bar">
        <h1>카드뉴스 관리</h1>
        {dateField}
        <div className="cn-daily-tags">
          {statusTags}
          {pending && <span className="cn-tag cn-tag-info">처리 중</span>}
          {sessionExpired && <span className="cn-tag cn-tag-warn">로그인 만료</span>}
          {edition && <span className="cn-tag">선정 {selected.length}/{expectedCount}</span>}
          {edition && <span className="cn-tag">확인 {verifiedCount}/{expectedCount}</span>}
        </div>
        <button className="cn-button cn-button-small" onClick={openTools}>도구·설정</button>
      </div>
      <nav className="cn-daily-steps" aria-label="카드뉴스 제작 단계">
        {steps.map(([number, label]) => <button key={number} className="cn-card-tab" aria-current={stage === number ? "step" : undefined} aria-pressed={stage === number} onClick={() => setStage(number)}>{number}. {label}</button>)}
      </nav>
      {!toolsOpen && <div className="cn-daily-alerts">{statusBlock}</div>}
      <div className="cn-daily-body">
        <div className="cn-daily-panel cn-daily-list" hidden={stage !== 1}><div className="cn-stage-start">{collectButtons}<button className="cn-button" onClick={openManual} disabled={!!pending}>뉴스 직접 등록</button></div>{edition ? candidatesSection : emptyState}</div>
        <div className="cn-daily-panel cn-daily-list" hidden={stage !== 2}>{edition ? editorSection : emptyState}</div>
        <div className="cn-daily-panel" hidden={stage !== 3}>
          {progress}
          {edition ? <>
            <details className="cn-panel cn-ready" aria-label="발행 준비 상태"><summary><span className={`cn-tag ${checks.every(([ok]) => ok) ? "cn-tag-ok" : "cn-tag-warn"}`}>준비 {checks.filter(([ok]) => ok).length}/{checks.length}</span> {checks.find(([ok]) => !ok)?.[1] || "발행 준비 완료"}</summary><ul className="cn-checklist">{checks.map(([ok, text]) => <li key={text}><span className={`cn-tag ${ok ? "cn-tag-ok" : "cn-tag-warn"}`}>{ok ? "확인" : "필요"}</span> {text}</li>)}</ul></details>
            {captionSection}
          </> : emptyState}
        </div>
      </div>
      <div className="cn-daily-footer cn-workflow-actions">
        <button className="cn-button" onClick={() => setStage(stage === 3 ? 2 : 1)} disabled={stage === 1}>이전</button>
        {saveButton}
        {stage < 3 ? <button className="cn-button cn-button-primary" onClick={() => setStage(stage === 1 ? 2 : 3)} disabled={nextBlocked} title={nextBlocked ? "뉴스를 한 개 이상 선택하세요" : undefined}>다음 · {steps[stage === 1 ? 1 : 2][1]}</button> : publishActions}
      </div>
    </> : <>
      {header}{localAlert}{links}
      <section className="cn-panel" aria-label="날짜와 판본 상태">
        <div className="cn-toolbar">{dateField}{statusTags}{toolbarActions}</div>
        {dateInfo}{statusBlock}{progress}
      </section>
      {manualPanel}
      {!edition ? emptyState : <>
        {stats}
        <div className="cn-workspace">{candidatesSection}<div>{editorSection}{captionSection}</div></div>
      </>}
      {bottom}
    </>}
    {daily && <dialog ref={toolsDialog} className="cn-dialog cn-tools-dialog" onClose={() => setToolsOpen(false)} aria-labelledby="cn-tools-heading">
      <div className="cn-section-head"><h2 id="cn-tools-heading">도구·설정</h2><button className="cn-button cn-button-small" onClick={() => toolsDialog.current?.close()}>닫기</button></div>
      {toolsOpen && statusBlock}
      <div className="cn-toolbar">{toolbarActions}{logoutButton}</div>
      {localAlert}{links}{dateInfo}{manualPanel}{bottom}
    </dialog>}
    {publishDialog}
  </main>;
}
