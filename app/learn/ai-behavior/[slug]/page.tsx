import { notFound } from "next/navigation";
import Link from "next/link";
import SiteHeader from "../../../SiteHeader";
import DocsSidebar from "../../../DocsSidebar";
import { aiBehaviorDocs } from "../../../content";

export function generateStaticParams() {
  return aiBehaviorDocs.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = aiBehaviorDocs.find((item) => item.slug === slug);
  return doc
    ? {
        title: `${doc.title} · AI의 작동 방식 이해하기 · AgentTutor`,
        description: doc.summary
      }
    : {};
}

export default async function AIBehaviorDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = aiBehaviorDocs.find((item) => item.slug === slug);
  if (!doc) notFound();

  const sortedDocs = [...aiBehaviorDocs].sort((a, b) => a.order - b.order);
  const currentIndex = sortedDocs.findIndex((item) => item.slug === doc.slug);
  const previous = sortedDocs[currentIndex - 1];
  const next = sortedDocs[currentIndex + 1];

  const currentPath = `/learn/ai-behavior/${doc.slug}`;

  return (
    <>
      <SiteHeader currentPath={currentPath} />
      <div className="docs-shell">
        <DocsSidebar currentPath={currentPath} />
        <div className="doc-main" role="main">
          <header className="doc-meta">
            <div>
              <span>
                출처 ·{" "}
                <a href={doc.source.url} target="_blank" rel="noopener noreferrer">
                  {doc.source.name} ↗
                </a>
              </span>
              <span>주제 {doc.order} / 12</span>
            </div>
          </header>

          <article className="legacy-content">
            <header className="hero">
              <p className="eyebrow">AI의 작동 방식 이해하기 · TOPIC {doc.order} OF 12</p>
              <h1>{doc.title}</h1>
              <p className="lead" style={{ marginTop: "6px", color: "var(--muted)", fontSize: "1.05rem" }}>
                {doc.original_title}
              </p>
              <span className="date">Claude Academy 공식 튜토리얼 기반</span>
            </header>

            {/* Section 1: 쉬운 설명 */}
            <section className="section" id="summary">
              <div className="section-head">
                <div>
                  <h2>1. 쉬운 설명</h2>
                  <p className="section-note">초보자 눈높이에서 개념의 핵심을 알기 쉽게 풀어 설명합니다.</p>
                </div>
                <span className="badge">개념 이해</span>
              </div>
              <p style={{ fontSize: "1.02rem", lineHeight: "1.8", color: "var(--ink)" }}>
                {doc.summary}
              </p>
            </section>

            {/* Section 2: 핵심 내용 3가지 */}
            <section className="section" id="key-points">
              <div className="section-head">
                <div>
                  <h2>2. 핵심 내용 3가지</h2>
                  <p className="section-note">원문에서 꼭 짚고 넘어가야 할 세 가지 핵심 사실입니다.</p>
                </div>
                <span className="badge">핵심 요약</span>
              </div>
              <div style={{ display: "grid", gap: "12px" }}>
                {doc.key_points.map((point, index) => (
                  <div
                    key={index}
                    className="card"
                    style={{ display: "flex", gap: "16px", alignItems: "flex-start", padding: "16px 20px" }}
                  >
                    <span
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        background: "var(--blue)",
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: "0.82rem",
                        flexShrink: 0,
                        marginTop: "2px"
                      }}
                    >
                      {index + 1}
                    </span>
                    <div style={{ fontSize: "0.95rem", lineHeight: "1.7", color: "#374151" }}>
                      {point}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 3: 바로 해볼 행동 */}
            <section className="section" id="practice">
              <div className="section-head">
                <div>
                  <h2>3. 바로 해볼 행동</h2>
                  <p className="section-note">배운 내용을 실제 AI 프롬프트나 작업 루틴에 즉시 적용해 보세요.</p>
                </div>
                <span className="badge">실천 팁</span>
              </div>
              <div className="callout" style={{ margin: 0, padding: "18px 22px" }}>
                <strong style={{ display: "block", fontSize: "1rem", marginBottom: "6px" }}>
                  실천 가이드:
                </strong>
                <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: "1.7" }}>
                  {doc.practice_tip}
                </p>
              </div>
            </section>

            {/* Section 4: 공식 영상 (9번 항목에만 포함) */}
            {doc.video && (
              <section className="section" id="video">
                <div className="section-head">
                  <div>
                    <h2>4. 공식 영상으로 더 알아보기</h2>
                    <p className="section-note">Claude Academy 공식 튜토리얼에 수록된 해설 영상입니다.</p>
                  </div>
                  <span className="badge">동영상 강의</span>
                </div>
                <div className="video-responsive">
                  <iframe
                    src={doc.video.embed_url}
                    title={doc.video.title}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
                <div className="card" style={{ marginTop: "16px", padding: "18px 20px", background: "var(--wash)" }}>
                  <strong style={{ display: "block", fontSize: "1rem", marginBottom: "6px", color: "var(--ink)" }}>
                    한국어 영상 요약: {doc.video.title}
                  </strong>
                  <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: "1.7", color: "#374151" }}>
                    {doc.video.summary}
                  </p>
                </div>
              </section>
            )}

            {/* Section 5: 공식 원문 안내 */}
            <section className="section" id="source">
              <div className="section-head">
                <div>
                  <h2>{doc.video ? "5. 공식 원문 안내" : "4. 공식 원문 안내"}</h2>
                  <p className="section-note">더 자세한 원문 설명과 추가 예시는 Claude Academy 공식 페이지에서 확인할 수 있습니다.</p>
                </div>
                <span className="badge">원문 출처</span>
              </div>
              <div className="card" style={{ padding: "16px 20px" }}>
                <a
                  href={doc.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--blue)", fontWeight: 700, textDecoration: "none", fontSize: "0.95rem" }}
                >
                  {doc.source.name} 공식 튜토리얼 방문하기 ↗
                </a>
              </div>
            </section>
          </article>

          <nav className="doc-pagination" aria-label="이전 및 다음 주제">
            {previous ? (
              <Link href={`/learn/ai-behavior/${previous.slug}`}>
                <small>이전 주제 ({previous.order} / 12)</small>
                {previous.title}
              </Link>
            ) : (
              <Link href="/learn#ai-behavior">
                <small>목록으로</small>
                AI의 작동 방식 목록
              </Link>
            )}
            {next ? (
              <Link href={`/learn/ai-behavior/${next.slug}`}>
                <small>다음 주제 ({next.order} / 12)</small>
                {next.title}
              </Link>
            ) : (
              <Link href="/learn">
                <small>과정 완료</small>
                Learn 로드맵 홈으로 →
              </Link>
            )}
          </nav>
        </div>

        <aside className="page-outline">
          <p>이 페이지에서</p>
          <nav aria-label="페이지 목차">
            <a href="#summary">1. 쉬운 설명</a>
            <a href="#key-points">2. 핵심 내용 3가지</a>
            <a href="#practice">3. 바로 해볼 행동</a>
            {doc.video && <a href="#video">4. 공식 영상 요약</a>}
            <a href="#source">{doc.video ? "5. 공식 원문" : "4. 공식 원문"}</a>
          </nav>
        </aside>
      </div>
    </>
  );
}
