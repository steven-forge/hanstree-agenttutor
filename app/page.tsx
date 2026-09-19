import Link from "next/link";
import docs from "../data/docs.json";
import SiteHeader from "./SiteHeader";

export default function Home() {
  const latest = docs.documents.reduce((date, doc) => doc.updatedIso > date ? doc.updatedIso : date, "");
  return <><SiteHeader /><main className="home">
    <header className="home-hero"><p className="brand-kicker">AGENTTUTOR DOCUMENTATION</p><h1>AI 도구 명령어를<br />한곳에서 찾아보세요.</h1><p>Codex, Claude, Gemini, Antigravity, Grok과 한스트리 작업실의 명령어를 읽기 쉬운 문서로 정리했습니다.</p></header>
    <section className="doc-grid" aria-label="명령어 문서">{docs.documents.map((doc) => <Link className="doc-card" href={`/docs/${doc.slug}`} key={doc.slug}><span>{doc.title}</span><p>{doc.description}</p><b>문서 열기 <span aria-hidden="true">→</span></b></Link>)}</section>
    <footer className="home-foot"><span>공식 출처를 매일 확인해 변경된 명령을 표시합니다.</span><time dateTime={latest}>최근 갱신 {latest}</time></footer>
  </main></>;
}
