"use client";

import { useState, type FormEvent } from "react";
import type { AdminSetup } from "../../lib/card-news/types";
import "./admin-news.css";

export default function AdminLogin({ setup }: { setup: AdminSetup }) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const ready = setup.auth;

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
        body: JSON.stringify({ action: "login", password }),
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
      <h1>카드뉴스 관리</h1>
      <p className="cn-muted">관리자 비밀번호를 확인한 뒤 뉴스 선정과 카드 제작을 시작할 수 있습니다.</p>
    </div>
    <section className="cn-panel cn-login-panel" aria-labelledby="cn-login-heading">
      <h2 id="cn-login-heading">관리자 로그인</h2>
      {!ready && <p className="cn-alert">관리자 비밀번호 설정이 필요합니다. 운영 담당자가 배포 서버의 보안 설정에 비밀번호를 등록하면 진입할 수 있습니다.</p>}
      <form className="cn-form" onSubmit={login}>
        <label className="cn-field">관리자 비밀번호<input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} disabled={pending || !ready} /></label>
        {error && <p className="cn-alert cn-alert-error" role="alert">{error}</p>}
        <button className="cn-button cn-button-primary" type="submit" disabled={pending || !password || !ready}>{pending ? "비밀번호 확인 중…" : "관리자 화면 진입"}</button>
      </form>
      <div className="cn-publish-actions"><a className="cn-text-link" href="/today">뉴스 페이지로 돌아가기</a></div>
    </section>
  </main>;
}
