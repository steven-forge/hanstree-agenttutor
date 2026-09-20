import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../SiteHeader";
import DocsSidebar from "../DocsSidebar";
import { agentDocs, agentsMetadata, isDocFreshnessWarning } from "../content";

export const metadata: Metadata = {
  title: "주요 AI Agent 비교 · AgentTutor",
  description: "Claude, Codex, Gemini, Grok의 사용 형태, 강점, 공식 지원 상태 객관적 비교"
};

export default function AgentsIndexPage() {
  const hasVerificationWarning = agentDocs.some((doc) => isDocFreshnessWarning(doc));
  const reviewedDate = agentsMetadata.reviewed_at ? agentsMetadata.reviewed_at.split("T")[0] : "2026-09-20";

  return (
    <>
      <SiteHeader currentPath="/agents" />
      <div className="docs-shell">
        <DocsSidebar currentPath="/agents" />
        <div className="doc-main" role="main">
          <header className="home-hero" id="overview">
            <p className="brand-kicker">AGENT COMPARISON</p>
            <h1>주요 AI Agent 비교</h1>
            <p>
              Claude, Codex, Gemini, Grok의 실제 작업 방식과 지원 형태(App/CLI/API)를 동일한 기준으로 비교합니다.
              근거 없는 성능 수치나 가격 추정을 배제하고, 공식 확인된 사실과 사용 맥락을 중심으로 정리했습니다.
            </p>
          </header>

          {hasVerificationWarning && (
            <div className="health-notice" style={{ marginTop: "24px" }}>
              <strong>확인 필요:</strong> 일부 공식 문서 출처의 변경이 감지되었거나 접속 점검이 필요합니다.
              마지막 검토일({reviewedDate}) 기준 내용을 유지하고 있습니다.
            </div>
          )}

          {/* Comparison Table */}
          <section style={{ marginTop: "36px" }} id="comparison-table">
            <div className="section-head">
              <div>
                <h2>핵심 비교 요약표</h2>
                <p className="section-note">4대 주요 Agent의 제공 형태와 핵심 특성을 한눈에 비교합니다.</p>
              </div>
            </div>

            <div className="table-wrap" tabIndex={0} role="region" aria-label="핵심 비교 요약표" style={{ marginTop: "16px" }}>
              <table>
                <thead>
                  <tr>
                    <th>에이전트</th>
                    <th>제공 형태 (App / CLI / API)</th>
                    <th>주요 강점 & 적합한 상황</th>
                    <th>상세 링크</th>
                  </tr>
                </thead>
                <tbody>
                  {agentDocs.map((agent) => (
                    <tr key={agent.slug}>
                      <td>
                        <strong>{agent.title}</strong>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {agent.form_factors.map((f) => (
                            <span
                              key={f.type}
                              className={
                                f.status === "공식지원확인"
                                  ? "status-confirmed"
                                  : f.status.startsWith("조건부")
                                  ? "status-conditional"
                                  : "status-unconfirmed"
                              }
                              style={{ fontSize: "0.7rem", padding: "1px 6px" }}
                            >
                              {f.type}: {f.status}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ fontSize: "0.88rem", color: "#374151" }}>
                        {agent.tagline}
                      </td>
                      <td>
                        <Link
                          href={`/agents/${agent.slug}`}
                          style={{ color: "var(--blue)", fontWeight: 700, textDecoration: "none", fontSize: "0.85rem" }}
                        >
                          상세 보기 →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Cards Grid */}
          <section style={{ marginTop: "44px" }} id="agent-cards" aria-label="에이전트 목록">
            <div className="section-head">
              <div>
                <h2>개별 Agent 상세 문서</h2>
                <p className="section-note">각 도구의 작업 방식, 주의점, 공식 출처를 확인하세요.</p>
              </div>
            </div>

            <div className="doc-grid" style={{ marginTop: "20px" }}>
              {agentDocs.map((agent) => (
                <Link key={agent.slug} href={`/agents/${agent.slug}`} className="doc-card">
                  <span style={{ display: "block", fontSize: "0.8rem", color: "var(--blue)", marginBottom: "4px" }}>
                    Agent Profile
                  </span>
                  <span>{agent.title}</span>
                  <p>{agent.tagline}</p>
                  <b>프로필 열기 <span aria-hidden="true">→</span></b>
                </Link>
              ))}
            </div>
          </section>

          <footer className="home-foot" style={{ marginTop: "48px" }}>
            <span>기준일: {reviewedDate} KST (공식 문서 기준 점검)</span>
            <span>미확인 상태는 미지원을 의미하지 않습니다.</span>
          </footer>
        </div>

        <aside className="page-outline">
          <p>이 페이지에서</p>
          <nav aria-label="페이지 목차">
            <a href="#overview">개요</a>
            <a href="#comparison-table">핵심 비교 요약표</a>
            <a href="#agent-cards">상세 문서 목록</a>
          </nav>
        </aside>
      </div>
    </>
  );
}
