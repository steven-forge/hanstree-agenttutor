import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SiteHeader from "../../SiteHeader";
import DocsSidebar from "../../DocsSidebar";
import DecisionsExample from "../DecisionsExample";
import rawExplore from "../../../data/explore.json";

type Source = { name: string; url: string };

type DiagramImage = { src: string; alt: string; caption: string; width: number; height: number };

type ComparisonRow = { label: string; decisions: string; jev: string };

type JevOutcome = { name: string; explanation: string };

type Comparison = {
  intro: string;
  table: { caption: string; rows: ComparisonRow[] };
  jev_outcomes: JevOutcome[];
  interpretation: string;
  comparison_image: DiagramImage;
  sources: Source[];
};

type ExploreDoc = {
  slug: string;
  title: string;
  summary: string;
  topic: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  reviewed_at: string;
  question: string;
  core_answer: string;
  easy_explanation: string;
  api_explanation: string;
  details: string;
  comparison_note: string;
  diagram_image?: DiagramImage;
  comparison?: Comparison;
  pitfalls: string[];
  sources: Source[];
  dev_reference_links: Source[];
};

const exploreDocs = (rawExplore as unknown as { docs: ExploreDoc[] }).docs;

export function generateStaticParams() {
  return exploreDocs.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = exploreDocs.find((item) => item.slug === slug);
  return doc ? { title: `${doc.title} · Explore · AgentTutor`, description: doc.summary } : {};
}

export default async function ExploreDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = exploreDocs.find((item) => item.slug === slug);
  if (!doc) notFound();

  const currentPath = `/explore/${doc.slug}`;

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
              <time dateTime={doc.reviewed_at}>확인일 · {doc.reviewed_at}</time>
            </div>
          </header>

          <article className="legacy-content">
            <header className="hero">
              <p className="eyebrow">EXPLORE · {doc.topic}</p>
              <h1>{doc.title}</h1>
              <p className="lead">{doc.summary}</p>
              <span className="date">확인일 · {doc.reviewed_at} KST</span>
            </header>

            <details className="mobile-outline">
              <summary>이 문서의 목차 보기</summary>
              <nav aria-label="문서 목차 (모바일)">
                <a href="#answer">핵심 답변</a>
                <a href="#easy">쉬운 설명</a>
                <a href="#diagram">그림으로 이해하기</a>
                <a href="#example">직접 조작해 보기</a>
                <a href="#details">자세한 설명</a>
                {doc.comparison && <a href="#comparison">Jev와 비교하기</a>}
                <a href="#pitfalls">헷갈리기 쉬운 점</a>
                <a href="#sources">출처</a>
              </nav>
            </details>

            <section className="section" id="answer">
              <div className="section-head">
                <div>
                  <h2>1. 질문과 핵심 답변</h2>
                  <p className="section-note">{doc.question}</p>
                </div>
                <span className="badge">핵심 답변</span>
              </div>
              <p style={{ fontSize: "1rem", lineHeight: "1.75", color: "var(--ink)" }}>{doc.core_answer}</p>
            </section>

            <section className="section" id="easy">
              <div className="section-head">
                <div>
                  <h2>2. 쉬운 설명</h2>
                  <p className="section-note">일상적인 비유로 먼저 이해합니다.</p>
                </div>
                <span className="badge">일상 비유</span>
              </div>
              <div className="card" style={{ padding: "20px 24px", background: "var(--wash)" }}>
                <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: "1.7", color: "#374151" }}>{doc.easy_explanation}</p>
              </div>
              <div className="card" style={{ padding: "20px 24px", marginTop: "12px" }}>
                <strong style={{ display: "block", marginBottom: "6px", color: "var(--blue)" }}>API란?</strong>
                <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: "1.7", color: "#374151" }}>{doc.api_explanation}</p>
              </div>
            </section>

            <section className="section" id="diagram">
              <div className="section-head">
                <div>
                  <h2>3. 그림으로 이해하기</h2>
                  <p className="section-note">맥락과 질문이 들어가 선택지 하나가 정해지고, 앱이 실제로 처리하는 흐름입니다.</p>
                </div>
                <span className="badge">흐름도</span>
              </div>
              {doc.diagram_image && (
                <figure className="explore-figure">
                  <img
                    src={doc.diagram_image.src}
                    alt={doc.diagram_image.alt}
                    width={doc.diagram_image.width}
                    height={doc.diagram_image.height}
                    loading="lazy"
                    className="explore-figure-img"
                  />
                  <figcaption>
                    {doc.diagram_image.caption} ·{" "}
                    <a href={doc.diagram_image.src} target="_blank" rel="noopener noreferrer">
                      크게 보기
                    </a>
                  </figcaption>
                </figure>
              )}
            </section>

            <section className="section" id="example">
              <div className="section-head">
                <div>
                  <h2>4. 직접 조작해 보기</h2>
                  <p className="section-note">문의 내용과 조건을 바꿔보며 결과가 어떻게 달라지는지 확인합니다.</p>
                </div>
                <span className="badge">조작 예제</span>
              </div>
              <DecisionsExample />
            </section>

            <section className="section" id="details">
              <div className="section-head">
                <div>
                  <h2>5. 자세한 설명</h2>
                  <p className="section-note">발표에서 확인된 내용과 아직 확인되지 않은 부분을 구분합니다.</p>
                </div>
                <span className="badge">자세히 보기</span>
              </div>
              <p style={{ fontSize: "0.95rem", lineHeight: "1.75", color: "var(--ink)" }}>{doc.details}</p>
              <div className="callout" style={{ marginTop: "16px" }}>
                <strong>비교:</strong> {doc.comparison_note}
              </div>
            </section>

            {doc.comparison && (
              <section className="section" id="comparison">
                <div className="section-head">
                  <div>
                    <h2>6. Jev와 비교하기</h2>
                    <p className="section-note">같은 목적을 가진 다른 제품과 어떤 점이 다른지 정리합니다.</p>
                  </div>
                  <span className="badge">비교</span>
                </div>
                <p style={{ fontSize: "0.95rem", lineHeight: "1.75", color: "var(--ink)" }}>{doc.comparison.intro}</p>

                <div className="table-wrap" style={{ marginTop: "14px" }}>
                  <table>
                    <caption style={{ textAlign: "left", fontSize: "0.85rem", color: "var(--muted)", marginBottom: "8px" }}>
                      {doc.comparison.table.caption}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">비교 항목</th>
                        <th scope="col">Decisions API</th>
                        <th scope="col">Jev</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doc.comparison.table.rows.map((row) => (
                        <tr key={row.label}>
                          <th scope="row">{row.label}</th>
                          <td>{row.decisions}</td>
                          <td>{row.jev}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="card" style={{ padding: "20px 24px", marginTop: "16px" }}>
                  <strong style={{ display: "block", marginBottom: "10px", color: "var(--ink)" }}>
                    Jev의 결과 형태 3가지(문서 작성자의 예시)
                  </strong>
                  <div style={{ display: "grid", gap: "10px" }}>
                    {doc.comparison.jev_outcomes.map((item) => (
                      <p key={item.name} style={{ margin: 0, fontSize: "0.92rem", color: "#374151", lineHeight: "1.65" }}>
                        <strong>{item.name}</strong> — {item.explanation}
                      </p>
                    ))}
                  </div>
                </div>

                <p style={{ fontSize: "0.92rem", lineHeight: "1.75", color: "var(--ink)", marginTop: "14px" }}>
                  {doc.comparison.interpretation}
                </p>

                <figure className="explore-figure" style={{ marginTop: "18px" }}>
                  <img
                    src={doc.comparison.comparison_image.src}
                    alt={doc.comparison.comparison_image.alt}
                    width={doc.comparison.comparison_image.width || undefined}
                    height={doc.comparison.comparison_image.height || undefined}
                    loading="lazy"
                    className="explore-figure-img"
                  />
                  <figcaption>
                    {doc.comparison.comparison_image.caption} ·{" "}
                    <a href={doc.comparison.comparison_image.src} target="_blank" rel="noopener noreferrer">
                      크게 보기
                    </a>
                  </figcaption>
                </figure>

                <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "10px" }}>
                  참고한 자료:{" "}
                  {doc.comparison.sources.map((source, idx) => (
                    <span key={source.url}>
                      {idx > 0 && ", "}
                      <a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}</a>
                    </span>
                  ))}
                </p>
              </section>
            )}

            <section className="section" id="pitfalls">
              <div className="section-head">
                <div>
                  <h2>{doc.comparison ? "7" : "6"}. 헷갈리기 쉬운 점</h2>
                </div>
                <span className="badge">주의사항</span>
              </div>
              <div style={{ display: "grid", gap: "12px" }}>
                {doc.pitfalls.map((pitfall, idx) => (
                  <div key={idx} className="card" style={{ padding: "16px 18px" }}>
                    <span className="status-unconfirmed" style={{ marginBottom: "8px", display: "inline-block" }}>
                      확인 필요
                    </span>
                    <p style={{ margin: 0, fontSize: "0.92rem", color: "#374151", lineHeight: "1.6" }}>{pitfall}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="section" id="sources">
              <div className="section-head">
                <div>
                  <h2>{doc.comparison ? "8" : "7"}. 출처와 확인일</h2>
                </div>
                <span className="badge">출처</span>
              </div>
              <p style={{ fontSize: "0.9rem", color: "var(--ink)" }}>
                공식 발표 출처:{" "}
                {doc.sources.map((source, idx) => (
                  <span key={source.url}>
                    {idx > 0 && ", "}
                    <a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}</a>
                  </span>
                ))}
              </p>
              {doc.dev_reference_links.length > 0 && (
                <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                  개발자 확인 경로(세부 규격의 근거 아님):{" "}
                  {doc.dev_reference_links.map((link, idx) => (
                    <span key={link.url}>
                      {idx > 0 && ", "}
                      <a href={link.url} target="_blank" rel="noopener noreferrer">{link.name}</a>
                    </span>
                  ))}
                </p>
              )}
              <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>확인일 · {doc.reviewed_at} KST</p>
            </section>
          </article>
        </div>

        <aside className="page-outline">
          <p>이 페이지에서</p>
          <nav aria-label="페이지 목차">
            <a href="#answer">1. 핵심 답변</a>
            <a href="#easy">2. 쉬운 설명</a>
            <a href="#diagram">3. 그림으로 이해하기</a>
            <a href="#example">4. 직접 조작해 보기</a>
            <a href="#details">5. 자세한 설명</a>
            {doc.comparison && <a href="#comparison">6. Jev와 비교하기</a>}
            <a href="#pitfalls">{doc.comparison ? "7" : "6"}. 헷갈리기 쉬운 점</a>
            <a href="#sources">{doc.comparison ? "8" : "7"}. 출처</a>
          </nav>
        </aside>
      </div>
    </>
  );
}
