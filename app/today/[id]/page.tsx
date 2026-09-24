import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "../../SiteHeader";
import DocsSidebar from "../../DocsSidebar";
import { todayData } from "../../content";

function findArticle(id: string) {
  return todayData.articles.find((item) => item.id === id && item.source_id === "claude-dev-blog");
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const article = findArticle(id);
  return article ? {
    title: `${article.title_ko || article.title} · 뉴스레터 · AgentTutor`,
    description: article.summary || article.source_summary_ko || article.source_summary,
  } : {};
}

export default async function TodayArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = findArticle(id);
  if (!article) notFound();

  return (
    <>
      <SiteHeader currentPath="/today" />
      <div className="docs-shell">
        <DocsSidebar currentPath="/today" />
        <main className="doc-main">
          <article className="legacy-content">
            <header className="hero">
              <p className="eyebrow">NEWSLETTER · {article.source_name}</p>
              <h1>{article.title_ko || article.title}</h1>
              <p className="lead">{article.title}</p>
              <span className="date">발행 · {article.published_on || article.published_at?.slice(0, 10) || "날짜 미확인"}</span>
            </header>

            <section className="section" id="summary">
              <h2>요약</h2>
              <p style={{ whiteSpace: "pre-line" }}>{article.summary || article.source_summary_ko || article.source_summary}</p>
            </section>

            <section className="section" id="keywords">
              <h2>핵심 키워드</h2>
              {article.keywords_ko?.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {article.keywords_ko.map((keyword) => <span className="tag-link" key={keyword}>{keyword}</span>)}
                </div>
              ) : <p>핵심 키워드는 편집 후 추가됩니다.</p>}
            </section>

            <section className="section" id="source">
              <h2>원문</h2>
              <p>글 전체는 원저작자의 사이트에서 확인할 수 있습니다.</p>
              <a href={article.source_url} target="_blank" rel="noopener noreferrer">{article.source_name} 원문 읽기 ↗</a>
            </section>

            {article.key_points_ko && (
              <section className="section" id="source-explainer">
                <h2>원문 주요 내용 한국어 해설</h2>
                <p>원문 전체를 번역한 것이 아니라, 확인된 내용을 바탕으로 편집진이 독자적으로 정리한 해설입니다.</p>
                <ul>{article.key_points_ko.map((point) => <li key={point}>{point}</li>)}</ul>
              </section>
            )}
          </article>
          <Link href="/today" className="tag-link">← 뉴스레터로 돌아가기</Link>
        </main>
        <aside className="page-outline">
          <p>이 페이지에서</p>
          <nav aria-label="페이지 목차">
            <a href="#summary">요약</a>
            <a href="#keywords">핵심 키워드</a>
            <a href="#source">원문</a>
            {article.key_points_ko && <a href="#source-explainer">원문 주요 내용 한국어 해설</a>}
          </nav>
        </aside>
      </div>
    </>
  );
}
