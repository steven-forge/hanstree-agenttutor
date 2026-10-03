"use client";
import { useEffect, useState, type FormEvent } from "react";
import { EXTERNAL_SOURCES, OFFICIAL_SOURCES, validateNewsPolicy, type NewsPolicy, type SourceRule } from "../../lib/news-policy";

type Snapshot = {
  policy: NewsPolicy; storageConfigured: boolean;
  applied: { officialRevision: number | null; externalRevision: number | null; officialAt: string | null; externalAt: string | null };
  daily: { date: string; count: number };
};
const endpoint = "/api/admin/news-policy";
const time = (value: string | null) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "기록 없음";
const keywords = (value: string) => value.split(/[\n,]+/).map(k => k.trim()).filter(Boolean);

export default function NewsPolicySettings({ disabled = false }: { disabled?: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<NewsPolicy | null>(null);
  const [keywordText, setKeywordText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const proposed = draft ? { ...draft, ai_keywords: keywords(keywordText) } : null;
  const dirty = !!snapshot && !!proposed && JSON.stringify(proposed) !== JSON.stringify(snapshot.policy);
  function accept(data: Snapshot) { setSnapshot(data); setDraft(data.policy); setKeywordText(data.policy.ai_keywords.join("\n")); }
  async function read(signal?: AbortSignal) {
    const response = await fetch(endpoint, { cache: "no-store", signal }); const data = await response.json();
    if (!response.ok) throw new Error(data.error || "뉴스레터 기준을 불러오지 못했습니다.");
    return { ...data, policy: validateNewsPolicy(data.policy) } as Snapshot;
  }
  useEffect(() => {
    const controller = new AbortController();
    read(controller.signal).then(accept).catch(caught => { if (!controller.signal.aborted) setError(caught.message || "기준을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  async function reload() {
    if (busy || disabled || (dirty && !window.confirm("저장하지 않은 기준 수정을 버리고 최신 기준을 불러올까요?"))) return;
    setBusy(true); setError(""); setMessage("");
    try { accept(await read()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "기준을 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || disabled || !proposed || !snapshot?.storageConfigured) return;
    setError(""); setMessage("");
    let policy: NewsPolicy;
    try { policy = validateNewsPolicy(proposed); } catch (caught) { setError(caught instanceof Error ? caught.message : "설정을 확인해 주세요."); return; }
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(policy) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "저장 결과를 확인하지 못했습니다. 최신 기준을 다시 불러와 주세요.");
      accept({ ...snapshot, policy: validateNewsPolicy(data.policy), storageConfigured: data.storageConfigured });
      setMessage("기준을 저장했습니다. 다음 수집부터 적용되며, 수집과 사이트 반영이 끝나면 적용 버전이 갱신됩니다.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "저장 결과를 확인하지 못했습니다. 최신 기준을 다시 불러와 주세요."); }
    finally { setBusy(false); }
  }
  function update(changes: Partial<NewsPolicy>) { setDraft(p => p ? { ...p, ...changes } : p); setMessage(""); }
  function publish(changes: Partial<NewsPolicy["publish"]>) { if (draft) update({ publish: { ...draft.publish, ...changes } }); }
  function source(id: string, changes: Partial<SourceRule>) { if (draft) update({ sources: { ...draft.sources, [id]: { ...draft.sources[id], ...changes } } }); }

  return <details className="cn-panel cn-policy" id="newsletter-policy">
    <summary>뉴스레터 기준 설정 <span className="cn-tag cn-tag-info">{dirty ? "저장하지 않은 수정" : snapshot ? `저장 버전 ${snapshot.policy.revision}` : "불러오는 중"}</span></summary>
    <p className="cn-muted">뉴스를 수집하고 뉴스레터에 공개하는 기준입니다. 인스타그램 카드 10장과 관리자 검토 후 발행 방식은 별도로 유지됩니다.</p>
    {error && <p className="cn-alert cn-alert-error" role="alert">{error}</p>}
    {message && <p className="cn-alert cn-alert-success" role="status">{message}</p>}
    {snapshot && <>
      {!snapshot.storageConfigured && <div className="cn-alert"><strong>뉴스레터 설정 저장소 연결 필요</strong><p>현재 기준을 확인하고 수정안을 작성할 수 있습니다. 서버 저장소가 연결되기 전에는 변경 사항이 저장되거나 수집에 적용되지 않습니다.</p><a className="cn-text-link" href="#newsletter-policy-setup">저장소 연결 안내</a></div>}
      <div className="cn-policy-status">
        <p>마지막 기준 저장 · {time(snapshot.policy.updated_at)} KST</p>
        <p>공식 수집 · {snapshot.applied.officialRevision === null ? "적용 버전 확인 대기" : `버전 ${snapshot.applied.officialRevision}`} · {time(snapshot.applied.officialAt)} KST</p>
        <p>외부 수집 · {snapshot.applied.externalRevision === null ? "적용 버전 확인 대기" : `버전 ${snapshot.applied.externalRevision}`} · {time(snapshot.applied.externalAt)} KST</p>
        {snapshot.applied.officialRevision !== snapshot.policy.revision || snapshot.applied.externalRevision !== snapshot.policy.revision ? <p className="cn-tag cn-tag-warn">저장된 기준의 수집 적용 확인 대기</p> : <p className="cn-tag cn-tag-ok">두 수집기에 저장 버전 적용 확인</p>}
        <p>{snapshot.daily.date} 발행일 뉴스 · {snapshot.daily.count}건 / 부족 알림 기준 {snapshot.policy.daily_target}건{snapshot.daily.count < snapshot.policy.daily_target ? " · 기준 미달" : " · 충족"}</p>
      </div>
    </>}
    {draft && <form onSubmit={save}>
      <fieldset disabled={busy || disabled} className="cn-policy-fields">
        <legend>수집과 게시</legend>
        <div className="cn-policy-grid">
          <label className="cn-field">수집 주기<select value={draft.collection_interval_hours} onChange={e => update({ collection_interval_hours: Number(e.target.value) })}>{[1, 2, 3, 6, 12, 24].map(n => <option key={n} value={n}>{n}시간마다</option>)}</select><small>KST 정각 기준. 예약 실행과 배포는 지연될 수 있습니다.</small></label>
          <label className="cn-field">공식 뉴스 수집 기간 · 일<input type="number" min={1} max={60} required value={draft.official_window_days} onChange={e => update({ official_window_days: Number(e.target.value) })} /></label>
          <label className="cn-field">외부 뉴스 수집 기간 · 시간<input type="number" min={1} max={168} required value={draft.window_hours} onChange={e => update({ window_hours: Number(e.target.value) })} /></label>
          <label className="cn-field">게시 최소 매체 수<input type="number" min={1} max={8} required value={draft.publish.min_independent} onChange={e => publish({ min_independent: Number(e.target.value) })} /><small>‘게시 근거’로 지정한 서로 다른 도메인 수입니다.</small></label>
          <label className="cn-field">중요도 높음 · 매체 수<input type="number" min={draft.publish.min_independent} max={8} required value={draft.publish.high_importance_at} onChange={e => publish({ high_importance_at: Number(e.target.value) })} /></label>
          <label className="cn-field">오늘 뉴스 부족 알림 기준 · 건<input type="number" min={1} max={100} required value={draft.daily_target} onChange={e => update({ daily_target: Number(e.target.value) })} /><small>부족 여부를 표시합니다. 기사 수를 보장하거나 오래된 기사를 오늘 뉴스로 바꾸지 않습니다.</small></label>
        </div>
        <label className="cn-check"><input type="checkbox" checked={draft.publish.auto_publish} onChange={e => publish({ auto_publish: e.target.checked })} />조건을 통과한 뉴스레터 기사 자동 게시</label>
        <p className="cn-help">끄면 뉴스 수집과 후보 보관만 진행합니다. 다시 켜면 다음 수집에서 기준을 통과한 대기 기사도 게시될 수 있습니다. 릴리스 페이지는 별도로 갱신됩니다.</p>
        <label className="cn-check"><input type="checkbox" checked={draft.publish.official_single_source} onChange={e => publish({ official_single_source: e.target.checked })} />공식 발표는 외부 매체 없이 단독 게시 허용</label>
        <label className="cn-check"><input type="checkbox" checked={draft.publish.official_model_high} onChange={e => publish({ official_model_high: e.target.checked })} />주요 공식 출처의 새 모델 발표는 중요도 높음으로 표시</label>
        <p className="cn-help">날짜·원문·한국어 설명 확인과 URL 중복 방지는 항상 적용합니다. 기존 공개 기사는 삭제하거나 일괄 재평가하지 않습니다.</p>
      </fieldset>
      <fieldset disabled={busy || disabled} className="cn-policy-fields">
        <legend>공식 출처</legend><div className="cn-policy-grid">{OFFICIAL_SOURCES.map(s => <label className="cn-check" key={s.id}><input type="checkbox" checked={draft.official_sources[s.id]} onChange={e => update({ official_sources: { ...draft.official_sources, [s.id]: e.target.checked } })} />{s.name}</label>)}</div>
      </fieldset>
      <fieldset disabled={busy || disabled} className="cn-policy-fields">
        <legend>외부 매체와 참고 채널</legend>
        <p className="cn-help">사용 여부, 게시 근거 포함 여부, 키워드 필터, 실행당 최대 수집 수를 수정합니다. 게시 근거 표시는 사실 검증 완료를 뜻하지 않습니다.</p>
        <div className="cn-policy-sources">{EXTERNAL_SOURCES.map(s => <div className="cn-policy-source" key={s.id}>
          <strong>{s.name}</strong>{s.needsConnection && <small>사용 설정과 별도로 해당 서비스 연결이 필요합니다.</small>}
          <div className="cn-policy-source-options">
            <label className="cn-check"><input type="checkbox" aria-label={`${s.name} 수집`} checked={draft.sources[s.id].enabled} onChange={e => source(s.id, { enabled: e.target.checked })} />수집</label>
            <label className="cn-check"><input type="checkbox" aria-label={`${s.name} 게시 근거`} checked={draft.sources[s.id].independent} onChange={e => source(s.id, { independent: e.target.checked })} />게시 근거</label>
            <label className="cn-check"><input type="checkbox" aria-label={`${s.name} 키워드 필터`} checked={draft.sources[s.id].keyword_filter} onChange={e => source(s.id, { keyword_filter: e.target.checked })} />키워드 필터</label>
            <label className="cn-field">최대 수집 수<input aria-label={`${s.name} 최대 수집 수`} type="number" min={1} max={100} required value={draft.sources[s.id].max_items} onChange={e => source(s.id, { max_items: Number(e.target.value) })} /></label>
          </div>
        </div>)}</div>
        <label className="cn-field">AI 관련 키워드<textarea rows={5} value={keywordText} onChange={e => { setKeywordText(e.target.value); setMessage(""); }} /><small>쉼표 또는 줄바꿈으로 구분합니다. 1~100개, 각 80자 이내. 필터를 켠 채널의 제목과 설명에 적용합니다.</small></label>
      </fieldset>
      <fieldset disabled={busy || disabled} className="cn-policy-fields">
        <legend>뉴스레터 목록</legend><div className="cn-policy-grid">
          <label className="cn-field">페이지당 기사 수<select value={draft.display.page_size} onChange={e => update({ display: { ...draft.display, page_size: Number(e.target.value) } })}>{[10, 20, 30, 50].map(n => <option key={n} value={n}>{n}건</option>)}</select></label>
          <label className="cn-field">기본 정렬<select value={draft.display.sort} onChange={e => update({ display: { ...draft.display, sort: e.target.value as NewsPolicy["display"]["sort"] } })}><option value="latest">최신순</option><option value="importance">중요도 높은 기사 우선 · 같은 중요도는 최신순</option></select></label>
        </div><p className="cn-help">목록 설정도 다음 수집과 사이트 반영이 끝난 뒤 적용됩니다. 표시 날짜는 원문 발행일을 따릅니다.</p>
      </fieldset>
      <div className="cn-publish-actions"><button type="submit" className="cn-button cn-button-primary" disabled={busy || disabled || !dirty || !snapshot?.storageConfigured}>{busy ? "처리 중…" : "기준 저장 · 다음 수집부터 적용"}</button><button type="button" className="cn-button" onClick={reload} disabled={busy || disabled}>최신 기준 다시 불러오기</button></div>
    </form>}
    {!draft && <button className="cn-button" onClick={reload} disabled={busy || disabled}>기준 다시 불러오기</button>}
    {snapshot && !snapshot.storageConfigured && <details className="cn-details" id="newsletter-policy-setup"><summary>저장소 연결 안내</summary><p className="cn-help">운영 담당자가 Vercel 프로젝트에 Upstash Redis를 연결하고, 뉴스레터 전용 NEWSLETTER_REDIS_REST_URL과 NEWSLETTER_REDIS_REST_TOKEN을 Production 환경에 등록한 뒤 재배포해야 합니다. 값은 이 화면이나 채팅에 입력하지 않습니다. 카드 원고와 Instagram 연결은 변경하지 않습니다.</p></details>}
  </details>;
}
