import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "../../SiteHeader";
import DocsSidebar from "../../DocsSidebar";
import { todayData, glossaryTerms, newsEditorial } from "../../content";
import { RELEASE_SOURCE_IDS, resolveGlossaryLinks, formatKstTime } from "../newsHelpers";

function findArticle(id: string) {
  return todayData.articles.find((item) => item.id === id && !RELEASE_SOURCE_IDS.has(item.source_id));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const article = findArticle(id);
  const editorial = article ? newsEditorial.articles?.[article.id] : undefined;
  return article ? {
    title: `${article.title_ko || article.title} · 뉴스레터 · AgentTutor`,
    description: editorial?.reading?.summary_ko || article.summary || article.source_summary_ko || article.source_summary,
  } : {};
}

export default async function TodayArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = findArticle(id);
  if (!article) notFound();

  const editorial = newsEditorial.articles?.[article.id];
  const glossaryLinks = resolveGlossaryLinks(editorial?.related_glossary_ids, glossaryTerms);
  const whyProvenanceLabel =
    article.why_it_matters_provenance === "editorial"
      ? "편집 해설"
      : article.why_it_matters_provenance === "automatic"
      ? "자동 생성 해설"
      : "작성 방식 기록 없음";

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
              <span className="date">발행 · {article.date_precision !== "day" && article.published_at ? formatKstTime(article.published_at) : article.published_on ? `${article.published_on} · 날짜만 확인` : "날짜 미확인"}</span>
            </header>

            <section className="section" id="summary">
              <h2>{editorial?.reading ? "핵심 요약" : "요약"}</h2>
              <p className="section-note">{editorial?.reading ? "원문 대조 요약" : article.summary ? "별도 작성 요약" : article.source_summary_provenance === "article_full_text_3line" ? "원문 3줄 요약 (자동 추출)" : "출처 제공 설명"}</p>
              <p style={{ whiteSpace: "pre-line" }}>{editorial?.reading?.summary_ko || article.summary || article.source_summary_ko || article.source_summary}</p>
              <p className="section-note">
                {editorial
                  ? `${editorial.reading ? "기존 편집 메모" : "편집 기록"} · ${editorial.reviewed_by} · ${formatKstTime(editorial.reviewed_at)} · 범위: ${editorial.review_scope}`
                  : article.reviewed_at
                  ? `편집 기록 · ${formatKstTime(article.reviewed_at)} (제목·요약·해설 중 일부 필드 편집, 원문 전체 대조는 아닐 수 있음)`
                  : "기사 단위 편집 기록 없음"}
              </p>
            </section>

            {editorial?.reading && (
              <section className="section" id="reading">
                <h2>한국어로 자세히 읽기</h2>
                <p className="section-note">원문을 바탕으로 재구성한 요약입니다. 원문 전체 번역이 아닙니다.</p>
                {editorial.reading.sections.map((sec) => (
                  <div key={sec.heading}>
                    <h3>{sec.heading}</h3>
                    <p style={{ whiteSpace: "pre-line" }}>{sec.body}</p>
                  </div>
                ))}
              </section>
            )}

            {editorial?.reading?.excerpt ? (
              <section className="section" id="reading-excerpt">
                <h2>짧은 원문과 번역</h2>
                <blockquote lang="en">{editorial.reading.excerpt.original}</blockquote>
                <p><strong>번역:</strong> {editorial.reading.excerpt.ko}</p>
              </section>
            ) : article.source_excerpt ? (
              <section className="section" id="reading-excerpt">
                <h2>짧은 원문과 번역</h2>
                <p className="section-note">자동 추출·자동 번역 (사람의 편집 검토 아님)</p>
                <blockquote lang="en">{article.source_excerpt.original}</blockquote>
                <p><strong>번역:</strong> {article.source_excerpt.ko}</p>
              </section>
            ) : article.source_excerpt_error ? (
              <section className="section" id="reading-excerpt">
                <h2>짧은 원문과 번역</h2>
                <p>{article.source_excerpt_error}</p>
                <a href={article.source_url} target="_blank" rel="noopener noreferrer">원문에서 직접 확인하기 ↗</a>
              </section>
            ) : null}

            <section className="section" id="why-it-matters">
              <h2>왜 중요한가요? ({whyProvenanceLabel})</h2>
              <p style={{ whiteSpace: "pre-line" }}>{article.why_it_matters}</p>
            </section>

            {glossaryLinks.length > 0 && (
              <section className="section" id="related-glossary">
                <h2>관련 용어</h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {glossaryLinks.map((g) => (
                    <a key={g.id} href={`/glossary#${g.id}`} className="tag-link">{g.term}</a>
                  ))}
                </div>
              </section>
            )}

            {editorial?.check_now && (
              <section className="section" id="check-now">
                <h2>지금 확인할 것</h2>
                <p>{editorial.check_now.text}</p>
                <p>대상: {editorial.check_now.audience}</p>
                <p>주의: {editorial.check_now.caveat}</p>
                <a href={editorial.check_now.source_url} target="_blank" rel="noopener noreferrer">근거 원문 ↗</a>
              </section>
            )}

            {article.keywords_ko && article.keywords_ko.length > 0 && (
              <section className="section" id="keywords">
                <h2>핵심 키워드</h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {article.keywords_ko.map((keyword) => <span className="tag-link" key={keyword}>{keyword}</span>)}
                </div>
              </section>
            )}

            {!editorial?.reading && article.key_points_ko && (
              <section className="section" id="source-explainer">
                <h2>원문 주요 내용 한국어 해설</h2>
                <p>원문의 주요 내용을 한국어로 정리한 별도 해설입니다. 기사별 편집 기록의 검토 범위를 함께 확인하세요.</p>
                <ul>{article.key_points_ko.map((point) => <li key={point}>{point}</li>)}</ul>
              </section>
            )}

            <section className="section" id="source">
              <h2>원문</h2>
              <p>글 전체는 원저작자의 사이트에서 확인할 수 있습니다.</p>
              <a href={article.source_url} target="_blank" rel="noopener noreferrer">{article.source_name} 원문 읽기 ↗</a>
              {editorial?.reading && (
                <p className="section-note">
                  작성·원문 대조: {editorial.reading.reviewed_by || editorial.reviewed_by} · {formatKstTime(editorial.reading.checked_at)}
                  <br />확인 범위: 위의 핵심 요약·상세 설명·짧은 번역
                </p>
              )}
            </section>
          </article>
          <Link href="/today" className="tag-link">← 뉴스레터로 돌아가기</Link>
        </main>
        <aside className="page-outline">
          <p>이 페이지에서</p>
          <nav aria-label="페이지 목차">
            <a href="#summary">{editorial?.reading ? "핵심 요약" : "요약"}</a>
            {editorial?.reading && <a href="#reading">한국어로 자세히 읽기</a>}
            {(editorial?.reading?.excerpt || article.source_excerpt || article.source_excerpt_error) && (
              <a href="#reading-excerpt">짧은 원문과 번역</a>
            )}
            <a href="#why-it-matters">왜 중요한가요?</a>
            {glossaryLinks.length > 0 && <a href="#related-glossary">관련 용어</a>}
            {editorial?.check_now && <a href="#check-now">지금 확인할 것</a>}
            {article.keywords_ko && article.keywords_ko.length > 0 && <a href="#keywords">핵심 키워드</a>}
            {!editorial?.reading && article.key_points_ko && <a href="#source-explainer">원문 주요 내용 한국어 해설</a>}
            <a href="#source">원문</a>
          </nav>
        </aside>
      </div>
    </>
  );
}
