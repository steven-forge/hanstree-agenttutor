"use client";

import { useState, type FormEvent } from "react";
import type { AdminSetup } from "../../lib/card-news/types";
import "./admin-news.css";

export default function AdminLogin({ setup, title = "카드뉴스 관리", description = "관리자 비밀번호를 확인한 뒤 뉴스 선정과 카드 제작을 시작할 수 있습니다." }: { setup: AdminSetup; title?: string; description?: string }) {
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const ready = setup.auth;
  const setupMessage = {
    password_missing: "운영 서버에 CARD_NEWS_ADMIN_PASSWORD가 적용되지 않았습니다. 이 사이트의 Vercel 프로젝트에서 Production 대상으로 등록한 뒤 재배포해 주세요.",
    password_length: "CARD_NEWS_ADMIN_PASSWORD는 4~256자여야 합니다. 값을 수정한 뒤 재배포해 주세요.",
    signing_missing: "운영 서버에 CARD_NEWS_SIGNING_SECRET이 적용되지 않았습니다. 이 사이트의 Vercel 프로젝트에서 Production 대상으로 등록한 뒤 재배포해 주세요.",
    signing_length: "CARD_NEWS_SIGNING_SECRET은 비밀번호와 별개인 무작위 32자 이상 문자열이어야 합니다. 값을 수정한 뒤 재배포해 주세요.",
  };

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || pending || !password) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "login", password, remember }),
      });
      const result = await response.json().catch(() => ({}));
      if (!result || typeof result !== "object") throw new Error("로그인 응답을 확인하지 못했습니다. 다시 시도해 주세요.");
      if (!response.ok || result.error) throw new Error(result.error || "로그인하지 못했습니다. 다시 시도해 주세요.");
      setPassword("");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "서버에 연결하지 못했습니다.");
      setPending(false);
    }
  }

  return <main className="cn-shell cn-login-shell">
    <div className="cn-login-intro">
      <p className="cn-eyebrow">AgentTutor · AI News 10</p>
      <h1>{title}</h1>
      <p className="cn-muted">{description}</p>
    </div>
    <section className="cn-panel cn-login-panel" aria-labelledby="cn-login-heading">
      <h2 id="cn-login-heading">관리자 로그인</h2>
      {!ready && <p className="cn-alert">{setup.authIssue ? setupMessage[setup.authIssue] : "운영 담당자가 관리자 로그인 설정을 확인해 주세요."}</p>}
      <form className="cn-form" onSubmit={login}>
        <label className="cn-field">관리자 비밀번호<input type="password" autoComplete="current-password" required minLength={4} maxLength={256} value={password} onChange={event => setPassword(event.target.value)} disabled={pending || !ready} /></label>
        <label className="cn-check"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={pending || !ready} aria-describedby="cn-remember-help" />하루 동안 로그인 유지</label>
        <p className="cn-help" id="cn-remember-help">체크하면 같은 브라우저에서 로그인한 시점부터 24시간 동안 비밀번호를 다시 묻지 않습니다.</p>
        {error && <p className="cn-alert cn-alert-error" role="alert">{error}</p>}
        <button className="cn-button cn-button-primary" type="submit" disabled={pending || !password || !ready}>{pending ? "비밀번호 확인 중…" : "관리자 화면 진입"}</button>
      </form>
      <div className="cn-publish-actions"><a className="cn-text-link" href="/today">뉴스 페이지로 돌아가기</a></div>
    </section>
  </main>;
}
