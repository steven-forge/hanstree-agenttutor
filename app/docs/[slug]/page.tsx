import { notFound } from "next/navigation";
import Link from "next/link";
import rawDocs from "../../../data/docs.json";

type ManagedCommand = { command: string; category: string; status: "new" | "unconfirmed"; statusText: string; date: string };
type Document = { slug: string; title: string; description: string; sources: { name: string; url: string }[]; updated: string; updatedIso: string; bodyHtml: string; autoManaged: ManagedCommand[] };
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
  return <><header className="site-header"><Link href="/">AgentTutor</Link><span>명령어 문서 모아보기</span></header><div className="doc-layout"><aside><Link href="/">← 전체 문서</Link><nav aria-label="문서 목록">{docs.documents.map((item) => <Link aria-current={item.slug === doc.slug ? "page" : undefined} className={item.slug === doc.slug ? "selected" : ""} href={`/docs/${item.slug}`} key={item.slug}>{item.title}</Link>)}</nav></aside><main className="doc-main"><header className="doc-meta"><p>{doc.description}</p><div><span>출처 · {doc.sources.map((source, index) => <span key={source.url}>{index > 0 && " · "}<a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}</a></span>)}</span><time dateTime={doc.updatedIso}>갱신 · {doc.updated}</time></div></header><article className="legacy-content" dangerouslySetInnerHTML={{ __html: doc.bodyHtml }} />{doc.autoManaged.length > 0 && <section className="auto-managed"><h2>자동 갱신 명령 관리</h2><p>공식 문서에서 새로 감지되거나 현재 확인되지 않는 명령입니다.</p><div className="table-wrap"><table><thead><tr><th>명령어</th><th>구분</th><th>상태</th><th>확인 날짜</th></tr></thead><tbody>{doc.autoManaged.map((item) => <tr key={item.command}><td><code>{item.command}</code></td><td>{item.category}</td><td><span className={item.status === "unconfirmed" ? "status-unconfirmed" : "status-new"}>{item.statusText}</span></td><td>{item.date}</td></tr>)}</tbody></table></div></section>}</main></div></>;
}
