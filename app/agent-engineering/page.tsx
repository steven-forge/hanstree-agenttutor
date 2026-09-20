import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../SiteHeader";
import DocsSidebar from "../DocsSidebar";
import { engineeringDocs } from "../content";

export const metadata: Metadata = {
  title: "Agent 엔지니어링 · AgentTutor",
  description: "AI Agent를 구축하고 확장하는 9대 핵심 엔지니어링 기술 가이드"
};

export default function AgentEngineeringIndexPage() {
  const sortedDocs = [...engineeringDocs].sort((a, b) => a.order - b.order);

  const learningPhases = [
    { phase: "1단계", topics: ["Tools", "Skills"], desc: "기본 도구 실행과 작업 지침의 모듈화" },
    { phase: "2단계", topics: ["Hooks", "Commands"], desc: "이벤트 기반 자동 제어와 사용자 명시적 명령" },
    { phase: "3단계", topics: ["MCP", "Plugins"], desc: "표준 외부 연동 프로토콜과 통합 배포 패키징" },
    { phase: "4단계", topics: ["Sub Agents"], desc: "독립 컨텍스트 위임과 작업 분할 격리" },
    { phase: "5단계", topics: ["Memory", "Context Management"], desc: "장기 상태 보존과 런타임 토큰 윈도우 최적화" }
  ];

  return (
    <>
      <SiteHeader currentPath="/agent-engineering" />
      <div className="docs-shell">
        <DocsSidebar currentPath="/agent-engineering" />
        <div className="doc-main" role="main">
          <header className="home-hero" id="overview">
            <p className="brand-kicker">AGENT ENGINEERING GUIDE</p>
            <h1>Agent 엔지니어링</h1>
            <p>
              단순한 프롬프트를 넘어, 실제 운영 환경에서 Agent를 안전하고 강력하게 확장하는 9가지 핵심 기술입니다.
              기능의 이름보다 해결하려는 문제와 실행 책임을 중심으로 학습합니다.
            </p>
          </header>

          <section style={{ marginTop: "36px" }} id="learning-path">
            <div className="section-head">
              <div>
                <h2>권장 학습 단계</h2>
                <p className="section-note">연관된 기술을 묶어 단계적으로 접근하는 것이 효과적입니다.</p>
              </div>
            </div>

            <div className="flow" style={{ marginTop: "16px" }}>
              {learningPhases.map((p, idx) => (
                <div key={idx} className="step">
                  <strong>{p.phase}: {p.topics.join(", ")}</strong>
                  <span>{p.desc}</span>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginTop: "44px" }} id="topics" aria-label="엔지니어링 주제 목록">
            <div className="section-head">
              <div>
                <h2>9대 엔지니어링 주제</h2>
                <p className="section-note">상세 구현 예시, 보안·권한 주의점, 선택 기준을 확인하세요.</p>
              </div>
            </div>

            <div className="doc-grid" style={{ marginTop: "20px" }}>
              {sortedDocs.map((doc) => (
                <Link key={doc.slug} href={`/agent-engineering/${doc.slug}`} className="doc-card">
                  <span style={{ display: "block", fontSize: "0.8rem", color: "var(--blue)", marginBottom: "4px" }}>
                    엔지니어링 #{doc.order}
                  </span>
                  <span>{doc.title}</span>
                  <p>{doc.description}</p>
                  <b>기술 문서 열기 <span aria-hidden="true">→</span></b>
                </Link>
              ))}
            </div>
          </section>

          <footer className="home-foot" style={{ marginTop: "48px" }}>
            <span>기준일: 2026-09-20 KST</span>
            <Link href="/glossary" style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}>
              관련 용어사전 확인하기 →
            </Link>
          </footer>
        </div>

        <aside className="page-outline">
          <p>이 페이지에서</p>
          <nav aria-label="페이지 목차">
            <a href="#overview">개요</a>
            <a href="#learning-path">권장 학습 단계</a>
            <a href="#topics">9대 주제 목록</a>
          </nav>
        </aside>
      </div>
    </>
  );
}
