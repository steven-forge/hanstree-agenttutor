import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SiteHeader from "../../SiteHeader";
import DocsSidebar from "../../DocsSidebar";
import DecisionsExample from "../DecisionsExample";
import rawExplore from "../../../data/explore.json";

type Source = { name: string; url: string };

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

            <section className="section" id="pitfalls">
              <div className="section-head">
                <div>
                  <h2>6. 헷갈리기 쉬운 점</h2>
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
                  <h2>7. 출처와 확인일</h2>
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
            <a href="#pitfalls">6. 헷갈리기 쉬운 점</a>
            <a href="#sources">7. 출처</a>
          </nav>
        </aside>
      </div>
    </>
  );
}
