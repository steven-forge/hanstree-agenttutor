import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../SiteHeader";
import DocsSidebar from "../DocsSidebar";
import ModelComparison from "./ModelComparison";
import agentModelData from "../../data/agent-models.json";
import { agentDocs, agentsMetadata, isDocFreshnessWarning } from "../content";

export const metadata: Metadata = {
  title: "AI 모델 비교 · AgentTutor",
  description: "Claude, Codex, Gemini, Grok의 모델을 골라 API 비용, 컨텍스트, 최대 출력, 캐시, 입력 유형과 모델 ID를 비교합니다."
};

const ALLOWED_FORMS = ["App", "CLI", "API"] as const;
type AllowedForm = (typeof ALLOWED_FORMS)[number];

const ALLOWED_TOOLS = ["MCP", "IDE", "Terminal"] as const;
type AllowedTool = (typeof ALLOWED_TOOLS)[number];

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

export default async function AgentsIndexPage({
  searchParams
}: {
  searchParams?: Promise<{ form?: string | string[]; tool?: string | string[] }>;
}) {
  const params = searchParams ? await searchParams : {};
  const rawForm = Array.isArray(params.form) ? params.form[0] : params.form;
  const rawTool = Array.isArray(params.tool) ? params.tool[0] : params.tool;

  const selectedForm = normalizeForm(rawForm);
  const selectedTool = normalizeTool(rawTool);

  const hasActiveFilter = Boolean(selectedForm || selectedTool);
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
            <h1>AI 모델 비교</h1>
            <p>
              Claude, Codex, Gemini, Grok의 모델을 최대 5개 골라 API 요금과 주요 사양을 비교하세요.
            </p>
          </header>

          {hasVerificationWarning && (
            <div className="health-notice" style={{ marginTop: "24px" }}>
              <strong>확인 필요:</strong> 일부 공식 문서 출처의 변경이 감지되었거나 접속 점검이 필요합니다.
              마지막 검토일({reviewedDate}) 기준 내용을 유지하고 있습니다.
            </div>
          )}

          <section style={{ marginTop: "36px" }} id="model-comparison">
            <div className="section-head">
              <div>
                <h2>에이전트별 모델 선택</h2>
                <p className="section-note">에이전트별 주력 모델을 최대 5개씩 표시합니다. 모델을 선택하면 아래에 비교표가 바로 나타납니다.</p>
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
              <ModelComparison
                key={`${selectedForm}-${selectedTool}`}
                agents={filteredAgents}
                modelGroups={agentModelData.agents.filter((g) => filteredAgents.some((a) => a.slug === g.agent_slug))}
                unitNote={agentModelData.unit_note}
              />
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
            <span>모델 가격·사양: 2026-09-23 KST 공식 문서 확인</span>
            <span>가격은 사용 조건에 따라 달라질 수 있습니다.</span>
          </footer>
        </div>

        <aside className="page-outline">
          <p>이 페이지에서</p>
          <nav aria-label="페이지 목차">
            <a href="#overview">개요</a>
            <a href="#model-comparison">모델 선택 비교</a>
            <a href="#agent-overview-table">에이전트 목록형 비교</a>
          </nav>
        </aside>
      </div>
    </>
  );
}
