import { notFound } from "next/navigation";
import Link from "next/link";
import rawDocs from "../../../data/docs.json";
import SiteHeader from "../../SiteHeader";
import DocsSidebar from "../../DocsSidebar";

type ManagedCommand = { command: string; category: string; status: "new" | "unconfirmed"; statusText: string; date: string };
type Document = { slug: string; title: string; description: string; sources: { name: string; url: string }[]; updated: string; updatedIso: string; sections: string[]; bodyHtml: string; autoManaged: ManagedCommand[] };
const docs = rawDocs as unknown as { documents: Document[] };

export function generateStaticParams() {
  return docs.documents.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = docs.documents.find((item) => item.slug === slug);
  return doc ? { title: doc.title + " · AgentTutor", description: doc.description } : {};
}

export default async function DocumentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = docs.documents.find((item) => item.slug === slug);
  if (!doc) notFound();

  let headingIndex = 0;
  const bodyHtml = doc.bodyHtml.replace(/<h([23])>/g, (_, level) => "<h" + level + " id=\"section-" + headingIndex++ + "\">");
  if (headingIndex !== doc.sections.length) throw new Error(doc.slug + " 문서 목차와 본문 제목 수가 다릅니다.");

  const index = docs.documents.findIndex((item) => item.slug === doc.slug);
  const previous = docs.documents[index - 1];
  const next = docs.documents[index + 1];

  return (
    <>
      <SiteHeader activeSlug={doc.slug} />
      <div className="docs-shell">
        <DocsSidebar activeSlug={doc.slug} />
        <div className="doc-main" role="main">
          <header className="doc-meta">
            <div>
              <span>
                출처 ·{" "}
                {doc.sources.map((source, i) => (
                  <span key={source.url}>
                    {i > 0 && " · "}
                    <a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}</a>
                  </span>
                ))}
              </span>
              <time dateTime={doc.updatedIso}>갱신 · {doc.updated}</time>
            </div>
          </header>
          <article className="legacy-content" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          {doc.slug === "hanstree" && (
            <section className="legacy-content">
              <h2 id="hanstree-site-manager">hanstree-site-manager 규칙</h2>
              <p>Hanstree.com 동기화는 사용자가 해당 제품에 대해 직접 &ldquo;릴리즈&rdquo;를 명령하고, 그 제품 릴리즈가 완료된 이후에만 진행합니다.</p>
              <p>화면·기능·문구·아이콘·지원 플랫폼·버전·개인정보 안내·다운로드·TestFlight 상태 등 실제 정보만 반영하고, 기존 사이트 구조를 재사용하며, 검사 후 게시하고 운영 반영을 확인합니다.</p>
            </section>
          )}
          {doc.autoManaged.length > 0 && (
            <section className="auto-managed">
              <h2>자동 갱신 명령 관리</h2>
              <p>공식 문서에서 새로 감지되거나 현재 확인되지 않는 명령입니다.</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>명령어</th><th>구분</th><th>상태</th><th>확인 날짜</th></tr>
                  </thead>
                  <tbody>
                    {doc.autoManaged.map((item) => (
                      <tr key={item.command}>
                        <td><code>{item.command}</code></td>
                        <td>{item.category}</td>
                        <td><span className={"status-" + item.status}>{item.statusText}</span></td>
                        <td>{item.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <nav className="doc-pagination" aria-label="이전 및 다음 문서">
            {previous ? <Link href={"/docs/" + previous.slug}><small>이전</small>{previous.title}</Link> : <span />}
            {next && <Link href={"/docs/" + next.slug}><small>다음</small>{next.title}</Link>}
          </nav>
        </div>
        <aside className="page-outline">
          <p>이 페이지에서</p>
          <nav aria-label="페이지 목차">
            {doc.sections.map((section, i) => <a href={"#section-" + i} key={section + i}>{section}</a>)}
            {doc.slug === "hanstree" && <a href="#hanstree-site-manager">hanstree-site-manager 규칙</a>}
          </nav>
        </aside>
      </div>
    </>
  );
}
