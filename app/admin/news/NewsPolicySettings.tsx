"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { EXTERNAL_SOURCES, OFFICIAL_SOURCES, defaultSourceRule, externalSources, validateNewsPolicy, type NewsPolicy, type SourceRule } from "../../lib/news-policy";

type Snapshot = {
  policy: NewsPolicy; storageConfigured: boolean;
  applied: { officialRevision: number | null; externalRevision: number | null; officialAt: string | null; externalAt: string | null };
  daily: { date: string; count: number };
};
const endpoint = "/api/admin/news-policy";
const time = (value: string | null) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "기록 없음";
const keywords = (value: string) => value.split(/[\n,]+/).map(k => k.trim()).filter(Boolean);

export default function NewsPolicySettings() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<NewsPolicy | null>(null);
  const [keywordText, setKeywordText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: "", site_url: "", url: "" });
  const [channelError, setChannelError] = useState("");
  const [channelMessage, setChannelMessage] = useState("");
  const suppressUnload = useRef(false);
  const disabled = sessionExpired;
  const proposed = draft ? { ...draft, ai_keywords: keywords(keywordText) } : null;
  const policyDirty = !!snapshot && !!proposed && JSON.stringify(proposed) !== JSON.stringify(snapshot.policy);
  const channelPending = !!(newChannel.name || newChannel.site_url || newChannel.url);
  const dirty = policyDirty || channelPending;
  function accept(data: Snapshot) { setSnapshot(data); setDraft(data.policy); setKeywordText(data.policy.ai_keywords.join("\n")); setNewChannel({ name: "", site_url: "", url: "" }); setChannelError(""); setChannelMessage(""); }
  async function read(signal?: AbortSignal) {
    const response = await fetch(endpoint, { cache: "no-store", signal }); const data = await response.json();
    if (response.status === 401) setSessionExpired(true);
    if (!response.ok) throw new Error(data.error || "뉴스레터 기준을 불러오지 못했습니다.");
    return { ...data, policy: validateNewsPolicy(data.policy) } as Snapshot;
  }
  useEffect(() => {
    const controller = new AbortController();
    read(controller.signal).then(accept).catch(caught => { if (!controller.signal.aborted) setError(caught.message || "기준을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let checking = false;
    async function checkSession() {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch("/api/admin/news?session=1", { cache: "no-store", signal: controller.signal });
        if (response.status === 401 && !controller.signal.aborted) setSessionExpired(true);
      } catch { /* Keep unsaved settings during a temporary connection failure. */ }
      finally { checking = false; }
    }
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void checkSession(); };
    window.addEventListener("focus", checkSession);
    window.addEventListener("pageshow", onPageShow);
    return () => { controller.abort(); window.removeEventListener("focus", checkSession); window.removeEventListener("pageshow", onPageShow); };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { if (!suppressUnload.current) { event.preventDefault(); event.returnValue = ""; } };
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
    if (busy || disabled || channelPending || !proposed || !snapshot?.storageConfigured) return;
    setError(""); setMessage("");
    let policy: NewsPolicy;
    try { policy = validateNewsPolicy(proposed); } catch (caught) { setError(caught instanceof Error ? caught.message : "설정을 확인해 주세요."); return; }
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(policy) });
      const data = await response.json();
      if (response.status === 401) setSessionExpired(true);
      if (!response.ok) throw new Error(data.error || "저장 결과를 확인하지 못했습니다. 최신 기준을 다시 불러와 주세요.");
      accept({ ...snapshot, policy: validateNewsPolicy(data.policy), storageConfigured: data.storageConfigured });
      setMessage("기준을 저장했습니다. 다음 수집부터 적용되며, 수집과 사이트 반영이 끝나면 적용 버전이 갱신됩니다.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "저장 결과를 확인하지 못했습니다. 최신 기준을 다시 불러와 주세요."); }
    finally { setBusy(false); }
  }
  function loginAgain() {
    if (dirty && !window.confirm("저장하지 않은 기준 수정은 사라집니다. 로그인 화면으로 이동할까요?")) return;
    suppressUnload.current = true; window.location.reload();
  }
  async function logout() {
    if (busy || (dirty && !window.confirm("저장하지 않은 기준 수정을 버리고 로그아웃할까요?"))) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/news", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
      if (!response.ok) throw new Error("로그아웃을 완료하지 못했습니다. 다시 시도해 주세요.");
      suppressUnload.current = true; window.location.reload();
    } catch (caught) {
      try {
        const session = await fetch("/api/admin/news?session=1", { cache: "no-store" });
        if (session.status === 401) { suppressUnload.current = true; window.location.reload(); return; }
      } catch { /* Keep the original error when session status is unavailable. */ }
      setError(caught instanceof Error ? caught.message : "로그아웃하지 못했습니다.");
    } finally { setBusy(false); }
  }
  function update(changes: Partial<NewsPolicy>) { setDraft(p => p ? { ...p, ...changes } : p); setMessage(""); }
  function publish(changes: Partial<NewsPolicy["publish"]>) { if (draft) update({ publish: { ...draft.publish, ...changes } }); }
  function source(id: string, changes: Partial<SourceRule>) { if (draft) update({ sources: { ...draft.sources, [id]: { ...draft.sources[id], ...changes } } }); }
  function addChannel() {
    if (!draft || busy || disabled) return;
    setChannelError(""); setChannelMessage("");
    try {
      const id = `custom-${crypto.randomUUID().replaceAll("-", "")}`;
      const channel = { id, name: newChannel.name.trim(), site_url: newChannel.site_url.trim(), url: newChannel.url.trim() };
      const next = { ...draft, custom_sources: [...draft.custom_sources, channel], sources: { ...draft.sources, [id]: { enabled: true, independent: false, keyword_filter: true, max_items: 30 } } };
      validateNewsPolicy(next);
      update(next); setNewChannel({ name: "", site_url: "", url: "" });
      setChannelMessage(`${channel.name}을 수정안에 추가했습니다. 아래 ‘기준 저장’을 눌러야 다음 수집부터 적용됩니다.`);
    } catch (caught) { setChannelError(caught instanceof Error ? caught.message : "채널 정보를 확인해 주세요."); }
  }
  function removeChannel(id: string, name: string) {
    if (!draft || busy || disabled || !window.confirm(`${name}을 수집 채널에서 삭제할까요? 기준을 저장하면 다음 수집부터 제외됩니다. 이미 발행된 뉴스는 유지됩니다.`)) return;
    const sources = { ...draft.sources }; delete sources[id];
    update({ sources, custom_sources: draft.custom_sources.filter(s => s.id !== id) });
    setChannelError(""); setChannelMessage(`${name}을 수정안에서 삭제했습니다. ‘기준 저장’ 전에는 실제 수집 설정이 바뀌지 않습니다.`);
  }
  function restoreChannel(id: string) {
    if (!draft || busy || disabled) return;
    source(id, defaultSourceRule(id)); setChannelError(""); setChannelMessage("기본 채널을 수정안에 다시 추가했습니다. ‘기준 저장’ 후 다음 수집부터 적용됩니다.");
  }

  return <main className="cn-shell">
    <header className="cn-header"><div><p className="cn-eyebrow">AgentTutor · 카드뉴스</p><h1>뉴스레터 기준 설정</h1><a className="cn-text-link" href="/admin/news">← 카드뉴스 관리로 돌아가기</a></div><button className="cn-button" onClick={logout} disabled={busy}>로그아웃</button></header>
    <section className="cn-panel cn-policy" id="newsletter-policy" aria-labelledby="newsletter-policy-heading">
    <h2 id="newsletter-policy-heading">수집·게시 기준 <span className="cn-tag cn-tag-info">{dirty ? "저장하지 않은 수정" : snapshot ? `저장 버전 ${snapshot.policy.revision}` : error ? "불러오기 실패" : "불러오는 중"}</span></h2>
    <p className="cn-muted">뉴스를 수집하고 뉴스레터에 공개하는 기준입니다. 인스타그램 카드 10장과 관리자 검토 후 발행 방식은 별도로 유지됩니다.</p>
    {error && <p className="cn-alert cn-alert-error" role="alert">{error}</p>}
    {sessionExpired && <div className="cn-alert cn-alert-error" role="alert"><p>관리자 로그인이 만료됐습니다. 수정한 내용을 따로 보관한 뒤 다시 로그인해 주세요.</p><button className="cn-button" onClick={loginAgain}>다시 로그인</button></div>}
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
        <div className="cn-policy-grid cn-policy-grid-single">
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
        <p className="cn-help">채널 추가·삭제도 아래 ‘기준 저장’ 후 다음 수집부터 적용됩니다. 삭제해도 이미 발행된 뉴스는 유지됩니다.</p>
        <div className="cn-policy-sources">{externalSources(draft).map(s => <div className="cn-policy-source" key={s.id}>
          <div className="cn-policy-source-head"><strong>{s.name}{s.custom && <span className="cn-tag">추가 채널</span>}</strong><button type="button" className="cn-button cn-button-small" aria-label={`${s.name} 채널 삭제`} onClick={() => removeChannel(s.id, s.name)}>삭제</button></div>
          <div className="cn-policy-source-links"><span>홈페이지</span><a className="cn-text-link" href={s.site_url} target="_blank" rel="noopener noreferrer">{s.site_url}</a><span>{s.feed ? "RSS / Atom" : "수집 API"}</span><a className="cn-text-link" href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a></div>
          {s.needsConnection && <small>사용 설정과 별도로 해당 서비스 연결이 필요합니다.</small>}
          <div className="cn-policy-source-options">
            <label className="cn-check"><input type="checkbox" aria-label={`${s.name} 수집`} checked={draft.sources[s.id].enabled} onChange={e => source(s.id, { enabled: e.target.checked })} />수집</label>
            <label className="cn-check"><input type="checkbox" aria-label={`${s.name} 게시 근거`} checked={draft.sources[s.id].independent} onChange={e => source(s.id, { independent: e.target.checked })} />게시 근거</label>
            <label className="cn-check"><input type="checkbox" aria-label={`${s.name} 키워드 필터`} checked={draft.sources[s.id].keyword_filter} onChange={e => source(s.id, { keyword_filter: e.target.checked })} />키워드 필터</label>
            <label className="cn-field">최대 수집 수<input aria-label={`${s.name} 최대 수집 수`} type="number" min={1} max={100} required value={draft.sources[s.id].max_items} onChange={e => source(s.id, { max_items: Number(e.target.value) })} /></label>
          </div>
        </div>)}</div>
        {Object.keys(draft.sources).length === 0 && <p className="cn-empty">등록된 외부 채널이 없습니다. 채널을 추가하거나 기본 채널을 다시 추가해 주세요.</p>}
        {EXTERNAL_SOURCES.some(s => !Object.hasOwn(draft.sources, s.id)) && <details className="cn-details cn-policy-restore"><summary>삭제한 기본 채널 다시 추가</summary><div className="cn-publish-actions">{EXTERNAL_SOURCES.filter(s => !Object.hasOwn(draft.sources, s.id)).map(s => <button key={s.id} type="button" className="cn-button cn-button-small" onClick={() => restoreChannel(s.id)}>{s.name} 다시 추가</button>)}</div></details>}
        <div className="cn-policy-add" aria-labelledby="new-channel-heading" onKeyDown={e => { if (e.key === "Enter" && e.target instanceof HTMLInputElement) { e.preventDefault(); addChannel(); } }}>
          <h3 id="new-channel-heading">새 채널 추가 <span className="cn-tag">{draft.custom_sources.length} / 20</span></h3>
          <p className="cn-help">공개 RSS·Atom 피드를 지원합니다. 홈페이지와 피드 주소를 각각 입력해 주세요. 로그인·비밀키가 필요한 주소는 등록할 수 없습니다.</p>
          <div className="cn-policy-grid">
            <label className="cn-field">채널 이름<input maxLength={80} value={newChannel.name} onChange={e => setNewChannel(p => ({ ...p, name: e.target.value }))} placeholder="예: AI 연구 소식" /></label>
            <label className="cn-field">홈페이지 주소<input inputMode="url" autoCapitalize="none" spellCheck={false} maxLength={2048} value={newChannel.site_url} onChange={e => setNewChannel(p => ({ ...p, site_url: e.target.value }))} placeholder="https://…" /></label>
            <label className="cn-field">RSS / Atom 주소<input inputMode="url" autoCapitalize="none" spellCheck={false} maxLength={2048} value={newChannel.url} onChange={e => setNewChannel(p => ({ ...p, url: e.target.value }))} placeholder="https://…/feed.xml" /></label>
          </div>
          <p className="cn-help">추가한 채널은 수집·키워드 필터가 켜집니다. 뉴스레터 게시 판단에 포함하려면 해당 채널의 ‘게시 근거’를 선택해 주세요. 피드와 홈페이지에 등록한 도메인의 기사만 수집합니다.</p>
          <button type="button" className="cn-button" onClick={addChannel} disabled={draft.custom_sources.length >= 20}>수정안에 채널 추가</button>
          {channelPending && <><button type="button" className="cn-button cn-button-small cn-policy-clear" onClick={() => { setNewChannel({ name: "", site_url: "", url: "" }); setChannelError(""); }}>새 채널 입력 비우기</button><p className="cn-help">입력한 채널을 수정안에 추가하거나 입력을 비운 뒤 기준을 저장해 주세요.</p></>}
        </div>
        {channelError && <p className="cn-alert cn-alert-error" role="alert">{channelError}</p>}
        {channelMessage && <p className="cn-alert cn-alert-info" role="status">{channelMessage}</p>}
        <label className="cn-field">AI 관련 키워드<textarea rows={5} value={keywordText} onChange={e => { setKeywordText(e.target.value); setMessage(""); }} /><small>쉼표 또는 줄바꿈으로 구분합니다. 1~100개, 각 80자 이내. 필터를 켠 채널의 제목과 설명에 적용합니다.</small></label>
      </fieldset>
      <fieldset disabled={busy || disabled} className="cn-policy-fields">
        <legend>뉴스레터 목록</legend><div className="cn-policy-grid">
          <label className="cn-field">페이지당 기사 수<select value={draft.display.page_size} onChange={e => update({ display: { ...draft.display, page_size: Number(e.target.value) } })}>{[10, 20, 30, 50].map(n => <option key={n} value={n}>{n}건</option>)}</select></label>
          <label className="cn-field">기본 정렬<select value={draft.display.sort} onChange={e => update({ display: { ...draft.display, sort: e.target.value as NewsPolicy["display"]["sort"] } })}><option value="latest">최신순</option><option value="importance">중요도 높은 기사 우선 · 같은 중요도는 최신순</option></select></label>
        </div><p className="cn-help">목록 설정도 다음 수집과 사이트 반영이 끝난 뒤 적용됩니다. 표시 날짜는 원문 발행일을 따릅니다.</p>
      </fieldset>
      <div className="cn-publish-actions"><button type="submit" className="cn-button cn-button-primary" disabled={busy || disabled || !policyDirty || channelPending || !snapshot?.storageConfigured}>{busy ? "처리 중…" : "기준 저장 · 다음 수집부터 적용"}</button><button type="button" className="cn-button" onClick={reload} disabled={busy || disabled}>최신 기준 다시 불러오기</button></div>
    </form>}
    {!draft && <button className="cn-button" onClick={reload} disabled={busy || disabled}>기준 다시 불러오기</button>}
    {snapshot && !snapshot.storageConfigured && <details className="cn-details" id="newsletter-policy-setup"><summary>저장소 연결 안내</summary><p className="cn-help">운영 담당자가 Vercel 프로젝트에 Upstash Redis를 연결하고, 뉴스레터 전용 NEWSLETTER_REDIS_REST_URL과 NEWSLETTER_REDIS_REST_TOKEN을 Production 환경에 등록한 뒤 재배포해야 합니다. 값은 이 화면이나 채팅에 입력하지 않습니다. 카드 원고와 Instagram 연결은 변경하지 않습니다.</p></details>}
    </section>
  </main>;
}
