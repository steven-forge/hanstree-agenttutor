import Link from "next/link";
import docs from "../data/docs.json";

export default function SiteHeader({ activeSlug }: { activeSlug?: string }) {
  return <header className="site-header">
    <Link className="site-brand" href="/"><span aria-hidden="true">A</span>AgentTutor</Link>
    <nav className="header-links" aria-label="상단 메뉴">
      <Link href="/docs/hanstree">Documentation</Link>
      <a href="https://github.com/steven-forge/hanstree-agenttutor" target="_blank" rel="noopener noreferrer">GitHub</a>
    </nav>
    <details className="mobile-nav">
      <summary aria-label="문서 메뉴 열기">메뉴</summary>
      <nav aria-label="모바일 문서 목록">{docs.documents.map((doc) => <Link aria-current={doc.slug === activeSlug ? "page" : undefined} href={`/docs/${doc.slug}`} key={doc.slug}>{doc.title}</Link>)}</nav>
    </details>
  </header>;
}
