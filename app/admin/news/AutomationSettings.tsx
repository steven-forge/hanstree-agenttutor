"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AUTOMATION_DEFAULTS, validateAutomationSettings, type AutomationSettings as Settings, type AutomationView, type AutomationRun } from "../../lib/card-news/automation-policy";

const API = "/api/admin/news/automation";
const PHASE: Record<AutomationRun["phase"], string> = { idle: "대기", preparing: "카드 제작 중", ready: "10장 준비 완료", waiting: "발행 대기", publishing: "Instagram 발행 중", published: "발행 완료", failed: "확인 필요", preserved: "기존 원고 보존" };
type Action = "save" | "stop" | "prepare" | "test" | "cancel_test";
type Props = { localMode: boolean; parentBusy: boolean; unsaved: boolean; sessionExpired: boolean; onExpired: () => void; onPrepared: () => void; onBusyChange: (busy: boolean) => void };

function signature(settings: Settings) { return JSON.stringify([settings.enabled, settings.prepareTime, settings.publishTime, settings.maxAgeHours]); }
function timeLabel(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "기록 없음";
  return `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value))} KST`;
}

export default function AutomationSettings(props: Props) {
  const [view, setView] = useState<AutomationView | null>(null);
  const [draft, setDraft] = useState<Settings>(AUTOMATION_DEFAULTS);
  const [busy, setBusy] = useState<Action | "">("");
  const [loading, setLoading] = useState(!props.localMode);
  const [error, setError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [notice, setNotice] = useState("");
  const dirty = !!view && signature(draft) !== signature(view.settings);
  const latest = useRef({ props, dirty, view, draft });
  latest.current = { props, dirty, view, draft };
  const busyRef = useRef(false);
  const reading = useRef(false);
  const sequence = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);

  async function read(response: Response): Promise<AutomationView> {
    if (response.status === 401) {
      latest.current.props.onExpired();
      throw new Error("로그인이 만료됐습니다. 입력한 설정과 원고를 따로 보관한 뒤 다시 로그인하세요.");
    }
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.error) throw new Error(typeof result?.error === "string" ? result.error : "예약 상태를 확인하지 못했습니다. 잠시 후 다시 확인하세요.");
    if (!result?.settings || !("run" in result)) throw new Error("예약 상태 응답을 읽지 못했습니다. 상태를 다시 확인하세요.");
    return result as AutomationView;
  }

  async function refresh() {
    if (reading.current || busyRef.current || latest.current.props.localMode || latest.current.props.sessionExpired) return;
    reading.current = true;
    const request = ++sequence.current;
    try {
      const result = await read(await fetch(API, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(15000) }));
      if (!mounted.current || request !== sequence.current) return;
      // Never rebase the revision of an edited form: a concurrent save must conflict.
      if (!latest.current.dirty) setDraft(result.settings);
      setView(result); setStatusError("");
    } catch (caught) {
      if (mounted.current && request === sequence.current) setStatusError(caught instanceof Error ? caught.message : "예약 상태를 불러오지 못했습니다.");
    } finally { reading.current = false; if (mounted.current && request === sequence.current) setLoading(false); }
  }

  useEffect(() => {
    mounted.current = true;
    if (props.localMode) { setLoading(false); return; }
    void refresh();
    const poll = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(poll, 15000);
    document.addEventListener("visibilitychange", poll);
    return () => { mounted.current = false; sequence.current++; window.clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [props.localMode]);

  async function act(action: Action) {
    if (!view || busyRef.current || props.parentBusy || props.sessionExpired || props.localMode) return;
    if ((action === "prepare" || action === "test") && (dirty || props.unsaved)) { setError("입력 중인 예약 설정과 카드 원고를 먼저 저장하세요."); return; }
    if (action === "test" && !window.confirm("연결된 Instagram 계정에 카드 10장을 실제로 공개하는 테스트입니다. 마지막 게시 후 1시간이 지나지 않았으면 기다렸다가 발행합니다. 테스트 발행을 요청할까요?")) return;
    if (action === "save" && draft.enabled && !view.settings.enabled && !window.confirm("자동 제작과 Instagram 예약 발행을 함께 켭니다. 매일 지정한 시각에 카드 10장을 만들어 실제로 게시하며, 마지막 게시 후 최소 1시간을 기다립니다. 예약을 저장할까요?")) return;
    let settings: Settings | undefined;
    try { if (action === "save" || action === "stop") settings = validateAutomationSettings(action === "stop" ? { ...view.settings, enabled: false } : draft); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "설정을 확인하세요."); return; }
    const request = ++sequence.current;
    busyRef.current = true; setBusy(action); setError(""); setStatusError(""); setNotice(""); props.onBusyChange(true);
    try {
      const result = await read(await fetch(API, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(180000), body: JSON.stringify({ action: action === "stop" ? "save" : action, ...(settings ? { settings } : {}), ...(action === "test" ? { confirm: true } : {}) }) }));
      if (!mounted.current || request !== sequence.current) return;
      setView(result);
      if (action === "stop" && latest.current.dirty) setDraft(previous => ({ ...previous, enabled: false, revision: result.settings.revision }));
      else if (action === "save" || action === "stop" || !latest.current.dirty) setDraft(result.settings);
      setNotice(action === "stop" ? "정기 예약을 중지했습니다. 대기 중인 테스트는 별도로 취소하세요. 이미 시작된 게시 요청은 되돌리지 않습니다." : action === "save" ? "예약 설정을 저장했습니다." : action === "cancel_test" ? "테스트 취소 요청을 처리했습니다. 이미 시작된 게시 요청은 되돌리지 않습니다." : action === "prepare" ? "오늘 판본의 제작 요청을 처리했습니다. 아래 최근 실행 결과를 확인하세요. 현재 편집 화면은 유지됩니다." : "실제 테스트 발행을 요청했습니다. 아래에서 발행 결과와 대기 사유를 확인하세요.");
      if (action === "prepare" || action === "test") latest.current.props.onPrepared();
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error && caught.name !== "TimeoutError" ? caught.message : "응답을 확인하지 못했습니다. 요청이 진행 중일 수 있으니 다시 요청하기 전에 예약 상태를 새로 확인하세요.");
    } finally {
      busyRef.current = false;
      if (mounted.current) { setBusy(""); setLoading(false); latest.current.props.onBusyChange(false); }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void act("save"); }
  const disabled = !!busy || props.parentBusy || props.sessionExpired || !view;
  const run = view?.run;
  return <section className="cn-panel cn-automation" aria-labelledby="cn-automation-heading" aria-busy={loading || !!busy}>
    <div className="cn-section-head"><div><h2 id="cn-automation-heading">매일 자동 제작과 예약 발행</h2><p className="cn-muted">뉴스 10개를 카드로 만들고, 연결한 Instagram에 하나의 게시물로 발행합니다.</p></div>{view && <span className={`cn-tag ${view.settings.enabled && view.schedulerConfigured ? "cn-tag-ok" : ""}`}>{view.settings.enabled ? view.schedulerConfigured ? "정기 예약 켜짐 · 실행 기록 확인" : "예약 저장됨 · 실행 연결 필요" : "정기 예약 꺼짐"}</span>}</div>
    {props.localMode ? <p className="cn-alert cn-alert-info">자동 제작과 예약 발행에는 서버 저장소가 필요합니다. 현재는 이 브라우저에서 직접 카드 원고를 만들 수 있습니다. 서버 저장소와 <a className="cn-text-link" href="/admin/news/instagram">Instagram 연결</a>을 준비한 뒤 이용하세요.</p> : <>
      {loading && <p className="cn-help" role="status">예약 상태를 불러오는 중…</p>}
      {error && <p className="cn-alert cn-alert-error" role="alert">{error}</p>}
      {statusError && statusError !== error && <p className="cn-alert cn-alert-error" role="alert">{statusError}</p>}
      {notice && <p className="cn-alert cn-alert-success" role="status">{notice}</p>}
      {view && <>
        <form className="cn-form" onSubmit={submit}>
          <label className="cn-check"><input type="checkbox" checked={draft.enabled} disabled={disabled} onChange={event => setDraft(previous => ({ ...previous, enabled: event.target.checked }))} /><span>매일 카드 10장 자동 제작 + Instagram 자동 발행</span></label>
          <div className="cn-automation-grid">
            <label className="cn-field">제작 시각 · KST<input type="time" value={draft.prepareTime} required disabled={disabled} onChange={event => setDraft(previous => ({ ...previous, prepareTime: event.target.value }))} /></label>
            <label className="cn-field">발행 시각 · KST<input type="time" value={draft.publishTime} required disabled={disabled} onChange={event => setDraft(previous => ({ ...previous, publishTime: event.target.value }))} /></label>
            <label className="cn-field">뉴스 선정 기간<select value={draft.maxAgeHours} disabled={disabled} onChange={event => setDraft(previous => ({ ...previous, maxAgeHours: Number(event.target.value) }))}>{[[72, 3], [168, 7], [336, 14], [720, 30]].map(([hours, days]) => <option key={hours} value={hours}>최근 {days}일</option>)}</select></label>
          </div>
          <p className="cn-help">최근 24시간 뉴스를 먼저 고르고, 부족하면 72시간과 선택 기간까지 넓힙니다. 이미 게시한 기사·중복 사건은 제외하며, 완결된 한국어 카드가 10개 미만이면 발행하지 않습니다. 자동 제작은 사람이 원문을 확인한 것과 구분됩니다.</p>
          <div className="cn-publish-actions"><button className="cn-button cn-button-primary" type="submit" disabled={disabled || !dirty}>{busy === "save" ? "저장 중…" : "예약 설정 저장"}</button><button className="cn-button" type="button" disabled={disabled || !view.settings.enabled} onClick={() => act("stop")}>{busy === "stop" ? "중지 중…" : "정기 예약 중지"}</button>{dirty && <span className="cn-tag cn-tag-warn">저장하지 않은 예약 설정</span>}</div>
        </form>
        {!view.schedulerConfigured && <p className="cn-alert">예약 실행 연결이 준비되지 않았습니다. 설정을 저장해도 정기 실행을 보장할 수 없으니 예약 연결을 확인하세요.</p>}
        <p className="cn-help">한국 시간 기준으로 약 5분마다 실행 여부를 확인합니다. 실행 대기나 처리 시간에 따라 늦어질 수 있습니다. 마지막 Instagram 게시 후 1시간이 지나지 않으면 기다렸다가 발행합니다.</p>
        <dl className="cn-automation-times"><div><dt>다음 제작</dt><dd>{view.settings.enabled ? timeLabel(view.nextPrepareAt) : "정기 예약 꺼짐"}</dd></div><div><dt>다음 발행</dt><dd>{view.settings.enabled ? timeLabel(view.nextPublishAt) : "정기 예약 꺼짐"}</dd></div></dl>
        <div className="cn-automation-run" aria-live="polite"><h3>최근 실행 · {run ? PHASE[run.phase] : "실행 기록 없음"}</h3>{run && <><p>{run.message}</p><p className="cn-help">{run.date} 판본 · 갱신 {timeLabel(run.updatedAt)}{typeof run.candidates === "number" ? ` · 선정 가능 ${run.candidates}개` : ""}{typeof run.cards === "number" ? ` · 카드 ${run.cards}/10장` : ""}</p>{run.nextAttemptAt && <p className="cn-help">다음 처리 가능 시각: {timeLabel(run.nextAttemptAt)}</p>}{run.lastTickAt && <p className="cn-help">최근 예약 확인: {timeLabel(run.lastTickAt)}</p>}{run.lastSuccessAt && <p className="cn-help">최근 제작·발행 성공: {timeLabel(run.lastSuccessAt)}</p>}{run.testRequested && <span className="cn-tag cn-tag-warn">실제 테스트 발행 요청 중</span>}</>}</div>
        <div className="cn-publish-actions"><button className="cn-button" disabled={disabled || dirty || props.unsaved} onClick={() => act("prepare")}>{busy === "prepare" ? "카드 제작 중…" : "지금 카드 10장 준비"}</button><button className="cn-button" disabled={disabled || dirty || props.unsaved || !!run?.testRequested} onClick={() => act("test")}>{busy === "test" ? "테스트 요청 중…" : "실제 Instagram 테스트 발행"}</button><button className="cn-button" disabled={disabled || !run?.testRequested} onClick={() => act("cancel_test")}>{busy === "cancel_test" ? "취소 중…" : "대기 중인 테스트 취소"}</button></div>
        <p className="cn-help">‘지금 카드 10장 준비’는 제작만 요청합니다. 정기 예약이 켜져 있으면 설정한 시각에 발행될 수 있습니다. 테스트 발행은 실제 게시되며, 정기 예약과 별도로 요청됩니다. 기존 편집 원고는 자동으로 덮어쓰지 않습니다.{props.unsaved && " 현재 입력한 원고와 뉴스를 먼저 저장하세요."}</p>
      </>}
      <div className="cn-publish-actions"><button className="cn-button cn-button-small" disabled={!!busy || props.parentBusy || props.sessionExpired || loading} onClick={() => refresh()}>예약 상태 새로 확인</button></div>
    </>}
  </section>;
}
