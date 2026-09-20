import { notFound } from "next/navigation";
import Link from "next/link";
import SiteHeader from "../../SiteHeader";
import DocsSidebar from "../../DocsSidebar";
import { learnDocs } from "../../content";

export function generateStaticParams() {
  return learnDocs.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = learnDocs.find((item) => item.slug === slug);
  return doc ? { title: `${doc.title} · Learn · AgentTutor`, description: doc.description } : {};
}

export default async function LearnDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = learnDocs.find((item) => item.slug === slug);
  if (!doc) notFound();

  const sortedDocs = [...learnDocs].sort((a, b) => a.order - b.order);
  const currentIndex = sortedDocs.findIndex((item) => item.slug === doc.slug);
  const previous = sortedDocs[currentIndex - 1];
  const next = sortedDocs[currentIndex + 1];

  const currentPath = `/learn/${doc.slug}`;

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
                {doc.sources.map((source, index) => (
                  <span key={source.url}>
                    {index > 0 && " · "}
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.name}
                    </a>
                  </span>
                ))}
              </span>
              <time dateTime={doc.reviewed_at}>
                검토일 · {doc.reviewed_at.split("T")[0]}
              </time>
            </div>
          </header>

          <article className="legacy-content">
            <header className="hero">
              <p className="eyebrow">LEARN STEP {doc.order} OF 6</p>
              <h1>{doc.title}</h1>
              <p className="lead">{doc.description}</p>
              <span className="date">작성 기준일 · {doc.reviewed_at.split("T")[0]} KST</span>
            </header>

            {/* Section 1: 정의 */}
            <section className="section" id="definition">
              <div className="section-head">
                <div>
                  <h2>1. 정의</h2>
                  <p className="section-note">핵심 개념을 명확하고 정확하게 정의합니다.</p>
                </div>
                <span className="badge">개념 정의</span>
              </div>
              <p style={{ fontSize: "1rem", lineHeight: "1.75", color: "var(--ink)" }}>
                {doc.definition}
              </p>
            </section>

            {/* Section 2: 쉬운 예시 */}
            <section className="section" id="example">
              <div className="section-head">
                <div>
                  <h2>2. 쉬운 예시</h2>
                  <p className="section-note">일상적인 비유를 통해 개념의 본질을 직관적으로 이해합니다.</p>
                </div>
                <span className="badge">일상 비유</span>
              </div>
              <div className="card" style={{ padding: "20px 24px", background: "var(--wash)" }}>
                {doc.easy_example.title && (
                  <strong style={{ display: "block", fontSize: "1.05rem", marginBottom: "8px", color: "var(--blue)" }}>
                    {doc.easy_example.title}
                  </strong>
                )}
                <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: "1.7", color: "#374151" }}>
                  {doc.easy_example.content}
                </p>
              </div>
            </section>

            {/* Section 3: 동작 흐름 */}
            <section className="section" id="flow">
              <div className="section-head">
                <div>
                  <h2>3. 동작 흐름</h2>
                  <p className="section-note">시스템 내부에서 일어나는 실행 절차를 단계별로 추적합니다.</p>
                </div>
                <span className="badge">실행 절차</span>
              </div>
              <div style={{ display: "grid", gap: "12px" }}>
                {doc.flow_steps.map((step, index) => (
                  <div
                    key={step.title}
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
                    <div>
                      <strong style={{ display: "block", fontSize: "0.98rem", marginBottom: "4px" }}>
                        {step.title}
                      </strong>
                      <span style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: "1.6" }}>
                        {step.description}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 4: 흔한 실수 */}
            <section className="section" id="mistakes">
              <div className="section-head">
                <div>
                  <h2>4. 흔한 실수와 해결법</h2>
                  <p className="section-note">설계 및 실무 적용 시 자주 범하는 오류와 올바른 대안입니다.</p>
                </div>
                <span className="badge">주의사항</span>
              </div>
              <div style={{ display: "grid", gap: "14px" }}>
                {doc.common_mistakes.map((item, idx) => (
                  <div key={idx} className="card" style={{ padding: "18px 20px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "6px" }}>
                      <span className="status-unconfirmed">흔한 실수</span>
                      <strong style={{ fontSize: "0.95rem", color: "#991b1b" }}>{item.mistake}</strong>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "10px" }}>
                      <span className="status-new">권장 해결법</span>
                      <p style={{ margin: 0, fontSize: "0.92rem", color: "#166534", lineHeight: "1.6" }}>
                        {item.solution}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 5: 다음 학습 및 관련 용어 */}
            <section className="section" id="next-steps">
              <div className="section-head">
                <div>
                  <h2>5. 다음 학습 & 관련 용어</h2>
                  <p className="section-note">연계 학습 주제와 용어사전 링크입니다.</p>
                </div>
                <span className="badge">연계 학습</span>
              </div>
              <div className="callout" style={{ margin: 0, padding: "16px 20px" }}>
                <strong>다음 학습 안내:</strong> {doc.next_steps}
                <p>
                  <Link href={doc.slug === "memory" ? "/agent-engineering/memory" : doc.slug === "context" ? "/agent-engineering/context-management" : "/agent-engineering"}>
                    관련 엔지니어링 문서에서 구현 방법 보기 →
                  </Link>
                </p>
              </div>

              <div style={{ marginTop: "20px" }}>
                <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--muted)", marginBottom: "8px" }}>
                  관련 용어사전 (클릭하여 용어 정의 보기):
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {doc.related_glossary_ids.map((termId) => (
                    <Link
                      key={termId}
                      href={`/glossary#${termId}`}
                      className="tag-link"
                      style={{ padding: "4px 10px", fontSize: "0.82rem" }}
                    >
                      #{termId} 정의 보기
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          </article>

          <nav className="doc-pagination" aria-label="이전 및 다음 학습">
            {previous ? (
              <Link href={`/learn/${previous.slug}`}>
                <small>이전 학습 (Step {previous.order})</small>
                {previous.title}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={`/learn/${next.slug}`}>
                <small>다음 학습 (Step {next.order})</small>
                {next.title}
              </Link>
            )}
          </nav>
        </div>

        <aside className="page-outline">
          <p>이 페이지에서</p>
          <nav aria-label="페이지 목차">
            <a href="#definition">1. 정의</a>
            <a href="#example">2. 쉬운 예시</a>
            <a href="#flow">3. 동작 흐름</a>
            <a href="#mistakes">4. 흔한 실수</a>
            <a href="#next-steps">5. 다음 학습</a>
          </nav>
        </aside>
      </div>
    </>
  );
}
