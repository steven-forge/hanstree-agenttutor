import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../SiteHeader";
import DocsSidebar from "../DocsSidebar";
import { learnDocs } from "../content";

export const metadata: Metadata = {
  title: "Agent 기초 개념 학습 · AgentTutor",
  description: "Agent를 처음 배우는 분들을 위한 6단계 순차 기초 학습 로드맵"
};

export default function LearnIndexPage() {
  const sortedDocs = [...learnDocs].sort((a, b) => a.order - b.order);

  return (
    <>
      <SiteHeader currentPath="/learn" />
      <div className="docs-shell">
        <DocsSidebar currentPath="/learn" />
        <div className="doc-main" role="main">
          <header className="home-hero" id="overview">
            <p className="brand-kicker">LEARN ROADMAP</p>
            <h1>Agent 기초 개념 학습</h1>
            <p>
              AI Agent의 핵심 개념을 순서대로 이해하도록 구성된 입문자용 학습 과정입니다.
              사전 지식 없이도 개념부터 쉬운 비유, 동작 흐름, 흔한 실수까지 단계별로 습득할 수 있습니다.
            </p>
          </header>

          <section style={{ marginTop: "40px" }} id="curriculum" aria-label="학습 커리큘럼">
            <div className="section-head">
              <div>
                <h2>학습 순서 (6단계)</h2>
                <p className="section-note">1단계부터 순서대로 학습하는 것을 권장합니다.</p>
              </div>
            </div>

            <div style={{ display: "grid", gap: "16px", marginTop: "20px" }}>
              {sortedDocs.map((doc) => (
                <Link
                  key={doc.slug}
                  href={`/learn/${doc.slug}`}
                  className="card"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    textDecoration: "none",
                    padding: "20px 24px",
                    transition: "border-color .15s, box-shadow .15s"
                  }}
                >
                  <div style={{ maxWidth: "720px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                      <span className="badge" style={{ margin: 0 }}>
                        Step {doc.order}
                      </span>
                      <strong style={{ fontSize: "1.15rem", color: "var(--ink)" }}>{doc.title}</strong>
                    </div>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem" }}>{doc.description}</p>
                    <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {doc.related_glossary_ids.map((id) => (
                        <span key={id} style={{ fontSize: "0.75rem", color: "var(--blue)", background: "var(--blue-soft)", padding: "1px 6px", borderRadius: "4px" }}>
                          #{id}
                        </span>
                      ))}
                    </div>
                  </div>
                  <b style={{ color: "var(--blue)", fontSize: "0.9rem", flexShrink: 0, marginLeft: "16px" }}>
                    학습 시작 →
                  </b>
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
            <a href="#curriculum">커리큘럼</a>
          </nav>
        </aside>
      </div>
    </>
  );
}
