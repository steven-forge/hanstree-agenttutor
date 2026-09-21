import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../SiteHeader";
import DocsSidebar from "../DocsSidebar";
import { agentDocs, agentsMetadata, isDocFreshnessWarning, getAgentReviewStatus } from "../content";

export const metadata: Metadata = {
  title: "주요 AI Agent 비교 · AgentTutor",
  description: "Claude, Codex, Gemini, Grok의 사용 형태, 강점, 공식 지원 상태 객관적 비교"
};

const ALLOWED_FORMS = ["App", "CLI", "API"] as const;
type AllowedForm = (typeof ALLOWED_FORMS)[number];

const ALLOWED_TOOLS = ["MCP", "IDE", "Terminal"] as const;
type AllowedTool = (typeof ALLOWED_TOOLS)[number];

const ALLOWED_STATUSES = ["공식 확인", "조건부", "확인 필요"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

function normalizeForm(param?: string): AllowedForm | "" {
  if (!param) return "";
  const match = ALLOWED_FORMS.find((f) => f.toLowerCase() === param.trim().toLowerCase());
  return match ?? "";
}

function normalizeTool(param?: string): AllowedTool | "" {
  if (!param) return "";
  const match = ALLOWED_TOOLS.find((t) => t.toLowerCase() === param.trim().toLowerCase());
  return match ?? "";
}

function normalizeStatus(param?: string): AllowedStatus | "" {
  if (!param) return "";
  const trimmed = param.trim().toLowerCase();
  if (
    trimmed === "공식 확인" ||
    trimmed === "공식확인" ||
    trimmed === "공식지원확인" ||
    trimmed === "confirmed" ||
    trimmed === "official"
  ) {
    return "공식 확인";
  }
  if (trimmed === "조건부" || trimmed === "conditional") {
    return "조건부";
  }
  if (
    trimmed === "확인 필요" ||
    trimmed === "확인필요" ||
    trimmed === "warning" ||
    trimmed === "needs_review"
  ) {
    return "확인 필요";
  }
  return "";
}

export default async function AgentsIndexPage({
  searchParams
}: {
  searchParams?: Promise<{ form?: string | string[]; tool?: string | string[]; status?: string | string[] }>;
}) {
  const params = searchParams ? await searchParams : {};
  const rawForm = Array.isArray(params.form) ? params.form[0] : params.form;
  const rawTool = Array.isArray(params.tool) ? params.tool[0] : params.tool;
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;

  const selectedForm = normalizeForm(rawForm);
  const selectedTool = normalizeTool(rawTool);
  const selectedStatus = normalizeStatus(rawStatus);

  const hasActiveFilter = Boolean(selectedForm || selectedTool || selectedStatus);
  const hasVerificationWarning = agentDocs.some((doc) => isDocFreshnessWarning(doc));
  const reviewedDate = agentsMetadata.reviewed_at ? agentsMetadata.reviewed_at.split("T")[0] : "2026-09-20";

  const filteredAgents = agentDocs.filter((agent) => {
    if (selectedForm) {
      const matchForm = agent.form_factors.some(
        (f) => f.type === selectedForm && f.status !== "미확인"
      );
      if (!matchForm) return false;
    }

    if (selectedTool) {
      const matchTool = agent.tool_modes && agent.tool_modes.includes(selectedTool);
      if (!matchTool) return false;
    }

    if (selectedStatus) {
      const currentReviewStatus = getAgentReviewStatus(agent);
      if (currentReviewStatus !== selectedStatus) return false;
    }

    return true;
  });

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

          {/* Comparison List Section */}
          <section style={{ marginTop: "36px" }} id="comparison-list">
            <div className="section-head">
              <div>
                <h2>에이전트 목록형 비교</h2>
                <p className="section-note">조밀한 목록에서 주요 사양, 도구 연동 방식, 검토 상태를 비교합니다.</p>
              </div>
            </div>

            {/* Filter Form (Server-rendered GET form) */}
            <form
              method="GET"
              action="/agents"
              className="agents-filter-bar"
              role="search"
              aria-label="에이전트 필터"
            >
              <div className="filter-field">
                <label htmlFor="filter-form" className="filter-label">
                  제공 형태
                </label>
                <select
                  id="filter-form"
                  name="form"
                  defaultValue={selectedForm}
                  className="filter-select"
                >
                  <option value="">제공 형태: 전체</option>
                  <option value="App">App</option>
                  <option value="CLI">CLI</option>
                  <option value="API">API</option>
                </select>
              </div>

              <div className="filter-field">
                <label htmlFor="filter-tool" className="filter-label">
                  도구 방식
                </label>
                <select
                  id="filter-tool"
                  name="tool"
                  defaultValue={selectedTool}
                  className="filter-select"
                >
                  <option value="">도구 방식: 전체</option>
                  <option value="MCP">MCP</option>
                  <option value="IDE">IDE</option>
                  <option value="Terminal">Terminal</option>
                </select>
              </div>

              <div className="filter-field">
                <label htmlFor="filter-status" className="filter-label">
                  검토 상태
                </label>
                <select
                  id="filter-status"
                  name="status"
                  defaultValue={selectedStatus}
                  className="filter-select"
                >
                  <option value="">검토 상태: 전체</option>
                  <option value="공식 확인">공식 확인</option>
                  <option value="조건부">조건부</option>
                  <option value="확인 필요">확인 필요</option>
                </select>
              </div>

              <div className="filter-actions">
                <button type="submit" className="filter-submit-btn">
                  필터 적용
                </button>
                {hasActiveFilter && (
                  <Link href="/agents" className="filter-reset-link">
                    필터 초기화
                  </Link>
                )}
              </div>
            </form>

            <div className="filter-count">
              전체 {agentDocs.length}개 중 {filteredAgents.length}개 에이전트 표시
            </div>

            {filteredAgents.length > 0 ? (
              <div
                className="table-wrap agents-table-wrap"
                tabIndex={0}
                role="region"
                aria-label="에이전트 비교 목록"
              >
                <table className="agents-table">
                  <thead>
                    <tr>
                      <th scope="col">에이전트 · 개발사</th>
                      <th scope="col">제공 형태</th>
                      <th scope="col">도구 방식</th>
                      <th scope="col">검토 상태</th>
                      <th scope="col">핵심 강점 & 적합한 상황</th>
                      <th scope="col">공식 출처 · 검토일</th>
                      <th scope="col">상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAgents.map((agent) => {
                      const reviewStatus = getAgentReviewStatus(agent);
                      return (
                        <tr key={agent.slug} className="agent-table-row">
                          <td>
                            <Link href={`/agents/${agent.slug}`} className="agent-row-link">
                              <strong>{agent.title}</strong>
                            </Link>
                            <span className="agent-provider-tag">{agent.provider}</span>
                          </td>
                          <td>
                            <div className="agent-badges-wrap">
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
                                  style={{ fontSize: "0.72rem", padding: "1px 6px" }}
                                >
                                  {f.type}: {f.status}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <div className="agent-badges-wrap">
                              {agent.tool_modes && agent.tool_modes.length > 0 ? (
                                agent.tool_modes.map((mode) => (
                                  <span
                                    key={mode}
                                    className="badge-concept"
                                    style={{ fontSize: "0.72rem", padding: "1px 6px" }}
                                  >
                                    {mode}
                                  </span>
                                ))
                              ) : (
                                <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>-</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span
                              className={
                                reviewStatus === "공식 확인"
                                  ? "status-confirmed"
                                  : reviewStatus === "조건부"
                                  ? "status-conditional"
                                  : "status-unconfirmed"
                              }
                              style={{ fontSize: "0.72rem", padding: "2px 7px" }}
                            >
                              {reviewStatus}
                            </span>
                          </td>
                          <td style={{ fontSize: "0.88rem", color: "#374151" }}>
                            {agent.tagline}
                          </td>
                          <td style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                            <div>
                              {agent.sources.length > 0 && (
                                <a
                                  href={agent.sources[0].url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}
                                  aria-label={`${agent.title} 공식 출처 (${agent.sources[0].name})`}
                                >
                                  공식 문서 ↗
                                </a>
                              )}
                            </div>
                            <time
                              dateTime={agent.reviewed_at}
                              style={{ display: "block", marginTop: "2px" }}
                            >
                              {agent.reviewed_at.split("T")[0]}
                            </time>
                          </td>
                          <td>
                            <Link
                              href={`/agents/${agent.slug}`}
                              className="agent-detail-btn"
                              aria-label={`${agent.title} 상세 보기`}
                            >
                              상세 보기 →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" role="status" aria-live="polite" style={{ marginTop: "24px" }}>
                <p>
                  <strong>선택한 조건에 일치하는 에이전트가 없습니다.</strong>
                </p>
                <p style={{ marginTop: "6px" }}>
                  필터 조건을 변경하거나 초기화하여 전체 에이전트를 확인하세요.
                </p>
                <div style={{ marginTop: "16px" }}>
                  <Link href="/agents" className="filter-reset-link" style={{ display: "inline-flex" }}>
                    필터 초기화
                  </Link>
                </div>
              </div>
            )}
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
            <a href="#comparison-list">에이전트 목록형 비교</a>
          </nav>
        </aside>
      </div>
    </>
  );
}
