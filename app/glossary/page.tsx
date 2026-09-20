import type { Metadata } from "next";
import SiteHeader from "../SiteHeader";
import DocsSidebar from "../DocsSidebar";
import GlossaryClient from "./GlossaryClient";
import { glossaryTerms } from "../content";

import rawGlossary from "../../data/glossary.json";

export const metadata: Metadata = {
  title: "핵심 용어사전 · AgentTutor",
  description: "Agent, LLM, Prompt, Context, Memory, MCP 등 핵심 AI·Agent 20대 용어 출처를 바탕으로 정리한 풀이"
};

export default function GlossaryPage() {
  const reviewedDate = (rawGlossary as unknown as { reviewed_at?: string }).reviewed_at?.split("T")[0] || "2026-09-20";

  return (
    <>
      <SiteHeader currentPath="/glossary" />
      <div className="docs-shell">
        <DocsSidebar currentPath="/glossary" />
        <div className="doc-main" role="main">
          <header className="home-hero" id="overview">
            <p className="brand-kicker">GLOSSARY · TERMINOLOGY</p>
            <h1>핵심 용어사전</h1>
            <p>
              AgentTutor의 학습 문서와 엔지니어링 가이드에서 사용하는 핵심 AI·Agent 용어를 명확하고 일관되게 풀이합니다.
              원어와 한국어 표기, 쉬운 예시, 그리고 관련 학습 문서로 바로 이동할 수 있습니다.
            </p>
          </header>

          <details className="health-notice" id="comparisons" style={{ marginTop: "32px" }}>
            <summary>헷갈리는 용어 비교</summary>
            <dl>
              <dt><a href="#prompt">Prompt</a> · <a href="#context">Context</a> · <a href="#memory">Memory</a></dt>
              <dd>Prompt는 작업을 요청하는 입력, Context는 지금 판단에 참고하는 전체 정보, Memory는 나중에 다시 불러올 저장 정보입니다.</dd>
              <dt><a href="#tool">Tool</a> · <a href="#skill">Skill</a> · <a href="#mcp">MCP</a> · <a href="#plugin">Plugin</a></dt>
              <dd>Tool은 실행 기능, Skill은 작업 지침, MCP는 연결 규약, Plugin은 제품별 확장 요소를 묶는 배포 단위입니다.</dd>
              <dt><a href="#hook">Hook</a> · <a href="#command">Command</a></dt>
              <dd>Hook은 정해진 이벤트에 반응하고, Command는 사용자가 명시적으로 호출합니다.</dd>
              <dt><a href="#model">Model</a> · <a href="#agent">Agent</a></dt>
              <dd>Model은 입력에서 출력을 만드는 추론 구성 요소이고, Agent는 모델과 도구·상태·실행 제어를 조합한 작업 시스템입니다.</dd>
            </dl>
          </details>

          <section style={{ marginTop: "32px" }}>
            <GlossaryClient />
          </section>

          <footer className="home-foot" style={{ marginTop: "48px" }}>
            <span>기준일: {reviewedDate} KST</span>
            <span>용어 정의 및 표준 사양 기반 출처를 바탕으로 정리한 풀이</span>
          </footer>
        </div>

        <aside className="page-outline">
          <p>이 페이지에서</p>
          <nav aria-label="페이지 목차">
            <a href="#overview">개요</a>
            <a href="#comparisons">헷갈리는 용어 비교</a>
            <p style={{ margin: "12px 10px 4px", fontSize: "11px", fontWeight: 700, color: "#9ca3af" }}>
              주요 용어 바로가기
            </p>
            {glossaryTerms.slice(0, 10).map((term) => (
              <a key={term.id} href={`#${term.id}`}>
                {term.term}
              </a>
            ))}
          </nav>
        </aside>
      </div>
    </>
  );
}
