"use client";

import { useEffect, useState } from "react";
import type { ConnectionView } from "../../../lib/card-news/instagram-connection";
import "../admin-news.css";

const API = "/api/admin/news/instagram";
const time = (value?: string) => value && Number.isFinite(Date.parse(value)) ? `${new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })} KST` : "기록 없음";
const STATUS_MESSAGE: Record<string, string> = {
  denied: "Instagram에서 권한 동의를 완료하지 않았습니다.",
  invalid_state: "연결 요청 확인에 실패했습니다. 다시 시도해 주세요.",
  session: "관리자 로그인 상태가 바뀌어 연결을 저장하지 못했습니다. 다시 로그인한 뒤 연결해 주세요.",
  failed: "Instagram 연결 처리 중 오류가 발생했습니다. 설정을 확인한 뒤 다시 시도해 주세요.",
};
function stateLabel(view: ConnectionView) {
  if (view.state === "disabled") return "이 사이트에서 연결 해제됨";
  if (view.state === "expired") return "연결이 만료됨 · 다시 연결해야 합니다";
  if (view.state === "unreadable") return view.source === "legacy" ? "고정 토큰 설정 값을 확인해야 합니다" : "저장된 연결을 읽을 수 없음 · 다시 연결해야 합니다";
  if (view.state === "active") return view.source === "legacy" ? "고정 토큰 설정 있음 (설정만으로는 연결이 확인된 것이 아닙니다)" : "연결 정보 저장됨";
  return "연결 안 됨";
}

export default function InstagramConnection({ initial }: { initial: ConnectionView | null }) {
  const [view, setView] = useState<ConnectionView | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [returned, setReturned] = useState<{ status: string; reason: string } | null>(null);
  const [loginNeeded, setLoginNeeded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status === "connected" || status === "error") setReturned({ status, reason: params.get("reason") || "failed" });
    if (status) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function request(init?: RequestInit) {
    const response = await fetch(API, { cache: "no-store", credentials: "same-origin", ...init });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { setLoginNeeded(true); throw new Error("관리자 로그인이 만료되었습니다. 다시 로그인해 주세요."); }
    if (!response.ok || data.error) throw new Error(typeof data.error === "string" ? data.error : "요청을 처리하지 못했습니다.");
    return data as { view?: ConnectionView; url?: string; result?: { ok: boolean; message: string } };
  }
  async function reload() {
    setBusy(true); setError("");
    try { const data = await request(); if (data.view) setView(data.view); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "연결 상태를 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (!initial) void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function call(action: string, extra: Record<string, unknown> = {}) {
    if (busy) return;
    setBusy(true); setError(""); setMessage(""); setReturned(null);
    try {
      const data = await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      if (action === "start" && data.url) { window.location.href = data.url; return; }
      if (data.view) setView(data.view);
      if (data.result?.ok) setMessage(data.result.message); else setError(data.result?.message || "요청을 처리하지 못했습니다.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "서버에 연결하지 못했습니다."); }
    finally { setBusy(false); }
  }

  // The ?status=connected link is only a hint. Success is shown only when the stored record
  // itself shows a fresh, confirmed OAuth connection.
  const justConnected = !!view && view.source === "oauth" && view.state === "active" && view.lastCheckStatus === "ok" && !!view.obtainedAt && Date.now() - Date.parse(view.obtainedAt) < 15 * 60000;
  const returnNotice = !returned || !view ? null
    : returned.status === "error" ? { ok: false, text: STATUS_MESSAGE[returned.reason] || STATUS_MESSAGE.failed }
    : justConnected ? { ok: true, text: `Instagram 계정 @${view.username}을(를) 연결했습니다. ‘연결 확인’으로 발행 권한을 확인하세요.` }
    : { ok: false, text: "새 연결이 저장된 것을 확인하지 못했습니다. 아래 연결 상태를 확인하고 필요하면 다시 연결해 주세요." };
  const active = view?.state === "active";
  const needsReconnect = view?.state === "expired" || (view?.state === "unreadable" && view.source === "oauth");
  const refreshable = active && view?.source === "oauth" && !!view.obtainedAt && Date.now() - Date.parse(view.obtainedAt) >= 24 * 3600000;

  return <main className="cn-shell">
    <header className="cn-header"><div><p className="cn-eyebrow">AgentTutor · 카드뉴스</p><h1>Instagram 연결</h1><a className="cn-text-link" href="/admin/news">← 카드뉴스 관리로 돌아가기</a></div></header>
    <section className="cn-panel" aria-labelledby="ig-heading">
      <h2 id="ig-heading">연결 상태</h2>
      {loginNeeded && <p className="cn-alert cn-alert-error" role="alert">관리자 로그인이 만료되었습니다. <a className="cn-text-link" href="/admin/news/instagram">다시 로그인하기</a></p>}
      {returnNotice && <p className={`cn-alert ${returnNotice.ok ? "cn-alert-success" : "cn-alert-error"}`} role="status">{returnNotice.text}</p>}
      {error && !loginNeeded && <p className="cn-alert cn-alert-error" role="alert">{error}</p>}
      {message && <p className="cn-alert cn-alert-success" role="status">{message}</p>}
      {!view ? <p className="cn-muted">{error ? "연결 상태를 불러오지 못했습니다." : "불러오는 중…"} <button className="cn-button cn-button-small" onClick={reload} disabled={busy}>다시 불러오기</button></p> : <>
        <ul className="cn-setup-list">
          <li><span>연결 설정</span><span style={{ flexShrink: 1, textAlign: "right" }} className={`cn-tag ${active ? "cn-tag-ok" : "cn-tag-warn"}`}>{stateLabel(view)}</span></li>
          <li><span>실제 계정 확인</span><span style={{ flexShrink: 1, textAlign: "right" }} className={`cn-tag ${view.lastCheckStatus === "ok" ? "cn-tag-ok" : "cn-tag-warn"}`}>{view.lastCheckStatus === "ok" ? `확인됨 · @${view.username || "이름 없음"} · ${time(view.lastCheckedAt)}` : view.lastCheckStatus === "error" ? `확인 실패 · ${time(view.lastCheckedAt)}` : "아직 확인하지 않음"}</span></li>
          <li><span>발행 권한 확인</span><span style={{ flexShrink: 1, textAlign: "right" }} className={`cn-tag ${view.publishVerifiedAt ? "cn-tag-ok" : "cn-tag-warn"}`}>{view.publishVerifiedAt ? `확인됨 · ${time(view.publishVerifiedAt)}` : "아직 확인되지 않음"}</span></li>
          <li><span>카드뉴스 발행</span><span style={{ flexShrink: 1, textAlign: "right" }} className={`cn-tag ${view.publishReady ? "cn-tag-ok" : "cn-tag-warn"}`}>{view.publishReady ? "발행 화면에서 계정을 한 번 더 확인한 뒤 발행 가능" : "지금은 발행할 수 없음"}</span></li>
        </ul>
        <div className="cn-policy-status">
          {view.lastCheckMessage && <p>마지막 확인 결과 · {view.lastCheckMessage}</p>}
          {view.legacyChanged && <p>고정 토큰 설정이 지난 확인 이후 바뀌었습니다. ‘연결 확인’을 다시 눌러 주세요.</p>}
          {view.source === "oauth" && <>
            <p>계정 · {view.username ? `@${view.username}` : "확인 안 됨"}{view.accountType ? ` · ${view.accountType}` : ""}{view.userId ? ` · ID ${view.userId}` : ""}</p>
            <p>동의한 권한 · {view.scope || "기록 없음"}</p>
            <p>연결·갱신 시각 · {time(view.obtainedAt)} · 만료 · {time(view.expiresAt)}</p>
          </>}
        </div>
        {needsReconnect && <p className="cn-alert">{view.state === "expired" ? "연결이 만료되어 갱신할 수 없습니다." : "저장된 연결을 읽을 수 없습니다. 서버의 서명 비밀값이 바뀌었을 수 있습니다."} {view.appConfigured ? "‘다시 연결’을 눌러 Instagram에서 다시 동의해 주세요." : "아래 ‘연결 준비 상태’의 부족한 설정을 먼저 등록한 뒤 다시 연결해 주세요."} 필요 없는 연결이라면 ‘이 사이트 연결 해제’로 지울 수 있습니다.</p>}
        <div className="cn-publish-actions">
          <button className={`cn-button ${!active || needsReconnect ? "cn-button-primary" : ""}`} onClick={() => call("start")} disabled={busy || !view.appConfigured}>{view.stored ? "다시 연결" : "Instagram 연결"}</button>
          <button className={`cn-button ${active ? "cn-button-primary" : ""}`} onClick={() => call("verify")} disabled={busy || !active}>연결 확인</button>
          {view.source === "oauth" && <button className="cn-button" onClick={() => call("refresh")} disabled={busy || !refreshable}>연결 갱신</button>}
          <button className="cn-button" onClick={() => { if (window.confirm("이 사이트에 저장된 Instagram 연결 정보를 삭제할까요? Instagram 쪽의 앱 권한은 그대로 남으며, 완전히 철회하려면 Instagram 계정 설정에서 직접 해제해야 합니다.")) void call("disconnect", { confirm: true }); }} disabled={busy || !view.stored}>이 사이트 연결 해제</button>
          <button className="cn-button" onClick={reload} disabled={busy}>상태 새로 불러오기</button>
        </div>
        {!view.appConfigured && <p className="cn-alert">서버 설정이 부족해 새 연결을 시작할 수 없습니다. 아래 ‘연결 준비 상태와 설정 도움말’에서 부족한 항목을 확인하세요.</p>}
        <p className="cn-help">‘연결 확인’은 계정 정보와 게시 한도만 조회하며 게시물을 만들지 않습니다. ‘연결 갱신’은 연결·갱신 후 24시간이 지나고 만료 전일 때만 가능합니다.</p>
        <p className="cn-help">카드 10장과 설명은 관리자 검토 후 카드뉴스 관리 화면의 발행 버튼으로만 게시됩니다. 이 화면은 계정 연결만 관리합니다.</p>
        <p className="cn-help">‘이 사이트 연결 해제’는 이 서버에 저장된 연결만 지웁니다. 해제한 뒤에는 고정 토큰 설정이 있어도 사용하지 않으며, 다시 연결해야 발행할 수 있습니다.</p>
        <details className="cn-details">
          <summary>연결 준비 상태와 설정 도움말</summary>
          <div className="cn-policy-status">
            <p>새 연결 시작 준비 · {view.appConfigured ? "완료" : `부족한 서버 설정 ${view.missing.length}개`}</p>
            {!!view.missing.length && <ul>{view.missing.map(name => <li key={name}><code>{name}</code></li>)}</ul>}
            <p>Instagram 앱의 ‘유효한 OAuth 리디렉션 URI’에 등록할 주소{view.callbackUrl ? " (눌러서 전체 선택 후 복사)" : ""}</p>
            {view.callbackUrl ? <input readOnly value={view.callbackUrl} aria-label="OAuth 콜백 주소" onFocus={event => event.currentTarget.select()} style={{ width: "100%" }} /> : <p>공개 HTTPS 주소(<code>CARD_NEWS_PUBLIC_URL</code>)가 올바르게 설정되면 여기에 표시됩니다.</p>}
            <p>고정 토큰 설정(<code>INSTAGRAM_USER_ID</code> / <code>INSTAGRAM_ACCESS_TOKEN</code>) · {view.legacyConfigured ? "등록됨" : "미등록"}{view.legacyConfigured && view.source !== "legacy" ? " · 현재 사용하지 않음" : ""}</p>
            <p>설정 값은 배포 서비스의 환경변수 화면에서 운영자가 직접 등록하며, 이 화면에는 값이 표시되지 않습니다.</p>
          </div>
        </details>
      </>}
    </section>
  </main>;
}
