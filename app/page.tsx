import Link from "next/link";
import docs from "../data/docs.json";
import SiteHeader from "./SiteHeader";
import DocsSidebar from "./DocsSidebar";

export default function Home() {
  const latest = docs.documents.reduce((date, doc) => doc.updatedIso > date ? doc.updatedIso : date, "");
  return <><SiteHeader /><div className="docs-shell">
    <DocsSidebar />
    <div className="doc-main" role="main">
      <header className="home-hero" id="overview"><p className="brand-kicker">AGENTTUTOR DOCUMENTATION</p><h1>AI 도구 명령어를<br />한곳에서 찾아보세요.</h1><p>Codex, Claude, Gemini, Antigravity, Grok과 한스트리 작업실의 명령어를 읽기 쉬운 문서로 정리했습니다.</p></header>
      <section className="doc-grid" id="documents" aria-label="명령어 문서">{docs.documents.map((doc) => <Link className="doc-card" href={`/docs/${doc.slug}`} key={doc.slug}><span>{doc.title}</span><p>{doc.description}</p><b>문서 열기 <span aria-hidden="true">→</span></b></Link>)}</section>
      <footer className="home-foot" id="updates"><span>공식 출처를 매일 확인해 변경된 명령을 표시합니다.</span><time dateTime={latest}>최근 갱신 {latest}</time></footer>
    </div>
    <aside className="page-outline"><p>이 페이지에서</p><nav aria-label="페이지 목차"><a href="#overview">개요</a><a href="#documents">명령어 문서</a><a href="#updates">갱신 정보</a></nav></aside>
  </div></>;
}
