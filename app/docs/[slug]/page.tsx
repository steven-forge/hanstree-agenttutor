import { notFound } from "next/navigation";
import Link from "next/link";
import rawDocs from "../../../data/docs.json";
import pkg from "../../../package.json";
import SiteHeader from "../../SiteHeader";

type ManagedCommand = { command: string; category: string; status: "new" | "unconfirmed"; statusText: string; date: string };
type Document = { slug: string; title: string; description: string; sources: { name: string; url: string }[]; updated: string; updatedIso: string; sections: string[]; bodyHtml: string; autoManaged: ManagedCommand[] };
const docs = rawDocs as unknown as { documents: Document[] };

export function generateStaticParams() { return docs.documents.map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = docs.documents.find((item) => item.slug === slug);
  return doc ? { title: `${doc.title} · AgentTutor`, description: doc.description } : {};
}

export default async function DocumentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = docs.documents.find((item) => item.slug === slug);
  if (!doc) notFound();

  let headingIndex = 0;
  const bodyHtml = doc.bodyHtml.replace(/<h([23])>/g, (_, level) => `<h${level} id="section-${headingIndex++}">`);
  if (headingIndex !== doc.sections.length) throw new Error(`${doc.slug} 문서 목차와 본문 제목 수가 다릅니다.`);
  const documentIndex = docs.documents.findIndex((item) => item.slug === doc.slug);
  const previous = docs.documents[documentIndex - 1];
  const next = docs.documents[documentIndex + 1];

  return <><SiteHeader activeSlug={doc.slug} /><div className="docs-shell">
    <aside className="docs-sidebar"><p>명령어 문서</p><nav aria-label="문서 목록">{docs.documents.map((item) => <Link aria-current={item.slug === doc.slug ? "page" : undefined} className={item.slug === doc.slug ? "selected" : ""} href={`/docs/${item.slug}`} key={item.slug}>{item.title}</Link>)}</nav><footer><span>공식 출처를 매일 확인합니다.</span><span>v{pkg.version}</span></footer></aside>
    <div className="doc-main" role="main"><header className="doc-meta"><Link href="/">Documentation</Link><div><span>출처 · {doc.sources.map((source, index) => <span key={source.url}>{index > 0 && " · "}<a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}</a></span>)}</span><time dateTime={doc.updatedIso}>갱신 · {doc.updated}</time></div></header><article className="legacy-content" dangerouslySetInnerHTML={{ __html: bodyHtml }} />{doc.autoManaged.length > 0 && <section className="auto-managed"><h2>자동 갱신 명령 관리</h2><p>공식 문서에서 새로 감지되거나 현재 확인되지 않는 명령입니다.</p><div className="table-wrap"><table><thead><tr><th>명령어</th><th>구분</th><th>상태</th><th>확인 날짜</th></tr></thead><tbody>{doc.autoManaged.map((item) => <tr key={item.command}><td><code>{item.command}</code></td><td>{item.category}</td><td><span className={item.status === "unconfirmed" ? "status-unconfirmed" : "status-new"}>{item.statusText}</span></td><td>{item.date}</td></tr>)}</tbody></table></div></section>}<nav className="doc-pagination" aria-label="이전 및 다음 문서">{previous ? <Link href={`/docs/${previous.slug}`}><small>이전</small>{previous.title}</Link> : <span />}{next && <Link href={`/docs/${next.slug}`}><small>다음</small>{next.title}</Link>}</nav></div>
    <aside className="page-outline"><p>이 페이지에서</p><nav aria-label="페이지 목차">{doc.sections.map((section, index) => <a href={`#section-${index}`} key={`${section}-${index}`}>{section}</a>)}</nav></aside>
  </div></>;
}
