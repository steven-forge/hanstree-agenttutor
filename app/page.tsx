import Link from "next/link";
import docs from "../data/docs.json";
import SiteHeader from "./SiteHeader";
import DocsSidebar from "./DocsSidebar";

export default function Home() {
  const latest = docs.documents.reduce((date, doc) => doc.updatedIso > date ? doc.updatedIso : date, "2026-09-20");

  const portalMenus = [
    {
      title: "Today",
      href: "/today",
      category: "일일 브리핑",
      description: "매일 확인하는 주요 AI·Agent 공식 발표 및 핵심 릴리스 10대 뉴스 요약."
    },
    {
      title: "Learn",
      href: "/learn",
      category: "기초 개념 로드맵",
      description: "Agent 기본부터 LLM, Prompt, Context, Memory, Pattern까지 6단계 체계적 학습."
    },
    {
      title: "Agent Engineering",
      href: "/agent-engineering",
      category: "실무 엔지니어링",
      description: "Skills, Hooks, Tools, MCP, Plugins, Sub Agents 등 9대 핵심 확장 기술."
    },
    {
      title: "Agents",
      href: "/agents",
      category: "제품별 객관적 비교",
      description: "Claude, Codex, Gemini, Grok의 사용 형태(App/CLI/API)와 특장점 비교."
    },
    {
      title: "명령어 가이드",
      href: "/docs/hanstree",
      category: "CLI & 작업실 매뉴얼",
      description: "한스트리 작업실 및 5대 도구 CLI의 검증된 명령어 모음."
    },
    {
      title: "Glossary",
      href: "/glossary",
      category: "용어사전",
      description: "Agent, MCP, Token, RAG 등 20대 핵심 AI·Agent 필수 용어 해설."
    }
  ];

  return (
    <>
      <SiteHeader currentPath="/" />
      <div className="docs-shell">
        <DocsSidebar currentPath="/" />
        <div className="doc-main" role="main">
          <header className="home-hero" id="overview">
            <p className="brand-kicker">AGENTTUTOR KNOWLEDGE BASE</p>
            <h1>AI Agent 학습과 실무를<br />한곳에서 체계적으로.</h1>
            <p>
              기초 개념부터 엔지니어링 실무, 주요 제품 비교, 최신 뉴스, 그리고 핵심 명령어와 용어사전까지 체계적인 한국어 가이드를 제공합니다.
            </p>
          </header>

          <section className="doc-grid" id="main-menus" aria-label="주요 메뉴 바로가기">
            {portalMenus.map((menu) => (
              <Link className="doc-card" href={menu.href} key={menu.href}>
                <span style={{ display: "block", fontSize: "0.8rem", color: "var(--blue)", marginBottom: "4px" }}>
                  {menu.category}
                </span>
                <span>{menu.title}</span>
                <p>{menu.description}</p>
                <b>메뉴 바로가기 <span aria-hidden="true">→</span></b>
              </Link>
            ))}
          </section>

          <section className="legacy-content" id="command-docs" style={{ marginTop: "48px" }}>
            <div className="section-head">
              <div>
                <h2>명령어 문서 (기존 가이드)</h2>
                <p className="section-note">주요 AI 도구 및 CLI 환경에서 실제로 사용하는 검증된 명령어입니다.</p>
              </div>
            </div>
            <div className="doc-grid" style={{ marginTop: "16px" }}>
              {docs.documents.map((doc) => (
                <Link className="doc-card" href={`/docs/${doc.slug}`} key={doc.slug}>
                  <span>{doc.title}</span>
                  <p>{doc.description}</p>
                  <b>명령어 열기 <span aria-hidden="true">→</span></b>
                </Link>
              ))}
            </div>
          </section>

          <footer className="home-foot" id="updates">
            <span>공식 출처를 확인해 변경된 지침과 명령어를 점검합니다.</span>
            <time dateTime={latest}>최근 갱신 {latest}</time>
          </footer>
        </div>

        <aside className="page-outline">
          <p>이 페이지에서</p>
          <nav aria-label="페이지 목차">
            <a href="#overview">개요</a>
            <a href="#main-menus">주요 메뉴</a>
            <a href="#command-docs">명령어 가이드</a>
            <a href="#updates">갱신 정보</a>
          </nav>
        </aside>
      </div>
    </>
  );
}
