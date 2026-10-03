"use client";

import { useState, type FormEvent } from "react";
import type { AdminSetup } from "../../lib/card-news/types";
import "./admin-news.css";

export default function AdminLogin({ setup }: { setup: AdminSetup }) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const ready = setup.auth && setup.storage;

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
      <h1>매일의 AI 뉴스, 한곳에서 준비하세요.</h1>
      <p className="cn-muted">뉴스 10개를 골라 카드와 설명을 검토하고, 확인 버튼으로 Instagram에 발행하는 관리자 공간입니다.</p>
      <div className="cn-targets"><span><strong>08:30</strong> 카드 검토 목표</span><span><strong>09:00</strong> 발행 목표 · 한국 시간</span></div>
    </div>
    <section className="cn-panel cn-login-panel" aria-labelledby="cn-login-heading">
      <h2 id="cn-login-heading">{ready ? "관리자 로그인" : "관리자 페이지 준비"}</h2>
      <p className="cn-muted">{ready ? "등록된 관리자 비밀번호로 로그인하세요." : "카드 원고와 발행 기록을 안전하게 관리하려면 아래 설정이 필요합니다."}</p>
      <ul className="cn-setup-list">
        <li><span>관리자 인증</span><span className={setup.auth ? "cn-tag cn-tag-ok" : "cn-tag cn-tag-warn"}>{setup.auth ? "설정됨" : "준비 필요"}</span></li>
        <li><span>원고·발행 기록 저장소</span><span className={setup.storage ? "cn-tag cn-tag-ok" : "cn-tag cn-tag-warn"}>{setup.storage ? "설정됨" : "준비 필요"}</span></li>
        <li><span>Instagram 발행 연결</span><span className={setup.instagram ? "cn-tag cn-tag-ok" : "cn-tag"}>{setup.instagram ? "설정됨" : "준비 필요"}</span></li>
        <li><span>일일 제작 예약</span><span className={setup.scheduler ? "cn-tag cn-tag-ok" : "cn-tag"}>{setup.scheduler ? "설정됨" : "준비 필요"}</span></li>
      </ul>
      {ready ? <form className="cn-form" onSubmit={login}>
        <label className="cn-field">관리자 비밀번호<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} disabled={pending} /></label>
        {error && <p className="cn-alert cn-alert-error" role="alert">{error}</p>}
        <button className="cn-button cn-button-primary" type="submit" disabled={pending || !password}>{pending ? "로그인 중…" : "로그인"}</button>
      </form> : <p className="cn-alert">운영 담당자가 서버의 보안 설정에서 관리자 인증과 영속 저장소를 연결하면 로그인이 열립니다. Instagram 연결과 제작 예약도 이곳에서 준비 상태를 확인할 수 있습니다.</p>}
      <div className="cn-publish-actions"><a className="cn-text-link" href="/admin/news">브라우저에서 카드 작업하기</a><a className="cn-text-link" href="/today">뉴스 페이지로 돌아가기</a></div>
    </section>
  </main>;
}
