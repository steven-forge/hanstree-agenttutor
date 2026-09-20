import { notFound } from "next/navigation";
import Link from "next/link";
import SiteHeader from "../../SiteHeader";
import DocsSidebar from "../../DocsSidebar";
import { agentDocs, isDocFreshnessWarning } from "../../content";

export function generateStaticParams() {
  return agentDocs.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = agentDocs.find((item) => item.slug === slug);
  return doc ? { title: `${doc.title} · Agents · AgentTutor`, description: doc.tagline } : {};
}

export default async function AgentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = agentDocs.find((item) => item.slug === slug);
  if (!doc) notFound();

  const currentIndex = agentDocs.findIndex((item) => item.slug === doc.slug);
  const previous = agentDocs[currentIndex - 1];
  const next = agentDocs[currentIndex + 1];

  const currentPath = `/agents/${doc.slug}`;

  // Content Health Check for sources using shared helper
  const needsVerification = isDocFreshnessWarning(doc);

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
              <p className="eyebrow">AGENT PROFILE</p>
              <h1>{doc.title}</h1>
              <p className="lead">{doc.tagline}</p>
              <span className="date">검토일 · {doc.reviewed_at.split("T")[0]} KST</span>
              <span className="date">내용 갱신일 · {doc.updated_at.split("T")[0]} KST</span>
            </header>

            {needsVerification && (
              <div className="health-notice" style={{ marginTop: "20px" }}>
                <strong>확인 필요:</strong> 이 도구의 공식 출처 문서에 최근 변경이 감지되었거나 점검이 진행 중입니다.
                현재 내용은 {doc.reviewed_at.split("T")[0]} 검토 기준입니다.
              </div>
            )}

            {/* Section 1: 지원 형태 및 상태 */}
            <section className="section" id="form-factors">
              <div className="section-head">
                <div>
                  <h2>1. 사용 형태 및 공식 지원 상태</h2>
                  <p className="section-note">App, CLI, API별 실제 제공 현황과 확인 상태입니다.</p>
                </div>
                <span className="badge">지원 현황</span>
              </div>
              <div className="table-wrap" tabIndex={0} role="region" aria-label={`${doc.title} 지원 형태 및 공식 지원 상태`}>
                <table>
                  <thead>
                    <tr>
                      <th>사용 형태</th>
                      <th>공식 지원 상태</th>
                      <th>세부 사항 및 주의</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.form_factors.map((factor) => (
                      <tr key={factor.type}>
                        <td>
                          <strong>{factor.type}</strong>
                        </td>
                        <td>
                          <span
                            className={
                              factor.status === "공식지원확인"
                                ? "status-confirmed"
                                : factor.status.startsWith("조건부")
                                ? "status-conditional"
                                : "status-unconfirmed"
                            }
                          >
                            {factor.status}
                          </span>
                        </td>
                        <td style={{ color: "#374151" }}>{factor.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ marginTop: "8px", fontSize: "0.82rem", color: "var(--muted)" }}>
                * '미확인' 상태는 미지원을 의미하지 않으며, 독립 공식 패키지 명세가 공식 확인 대기 중임을 뜻합니다.
              </p>
            </section>

            {/* Section 2: 적합한 상황과 사용자 */}
            <section className="section" id="suitable">
              <div className="section-head">
                <div>
                  <h2>2. 적합한 상황 및 사용자</h2>
                  <p className="section-note">공식 기능을 바탕으로 편집자가 정리한 활용 예시이며 성능 순위가 아닙니다.</p>
                </div>
                <span className="badge">추천 상황</span>
              </div>
              <ul style={{ paddingLeft: "20px", fontSize: "0.95rem", lineHeight: "1.8", color: "var(--ink)" }}>
                {doc.suitable_for.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </section>

            {/* Section 3: 작업 방식과 강점 */}
            <section className="section" id="strengths">
              <div className="section-head">
                <div>
                  <h2>3. 작업 방식과 강점</h2>
                  <p className="section-note">실제 워크플로우 상에서 발휘되는 도구의 핵심 역량입니다.</p>
                </div>
                <span className="badge">핵심 강점</span>
              </div>
              <div style={{ display: "grid", gap: "12px" }}>
                {doc.workflow_and_strengths.map((point, idx) => (
                  <div key={idx} className="card" style={{ padding: "16px 20px" }}>
                    <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: "1.7", color: "#374151" }}>
                      {point}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 4: 주의점 */}
            <section className="section" id="cautions">
              <div className="section-head">
                <div>
                  <h2>4. 주의할 점</h2>
                  <p className="section-note">운영 및 활용 시 반드시 유념해야 할 제약과 주의사항입니다.</p>
                </div>
                <span className="badge warning">주의사항</span>
              </div>
              <div style={{ display: "grid", gap: "10px" }}>
                {doc.cautions.map((caution, idx) => (
                  <div key={idx} className="callout warning" style={{ margin: 0 }}>
                    <strong>주의 {idx + 1}:</strong> {caution}
                  </div>
                ))}
              </div>
            </section>

            {/* Section 5: 다른 Agent와의 차이 */}
            <section className="section" id="differences">
              <div className="section-head">
                <div>
                  <h2>5. 다른 Agent와의 차이</h2>
                  <p className="section-note">비교 관점에서 파악한 독자적인 포지셔닝입니다.</p>
                </div>
                <span className="badge">차별점</span>
              </div>
              <div className="card" style={{ padding: "20px 24px", background: "var(--wash)" }}>
                <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: "1.75", color: "var(--ink)" }}>
                  {doc.differences}
                </p>
              </div>
            </section>

            {/* Section 6: 공식 출처 */}
            <section className="section" id="sources">
              <div className="section-head">
                <div>
                  <h2>6. 공식 출처 및 참고 문서</h2>
                  <p className="section-note">근거가 된 공식 도메인의 문서 목록입니다.</p>
                </div>
                <span className="badge">공식 링크</span>
              </div>
              <ul style={{ paddingLeft: "20px", fontSize: "0.92rem", lineHeight: "1.8" }}>
                {doc.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}
                    >
                      {source.name} ↗
                    </a>
                    <span style={{ color: "var(--muted)", marginLeft: "8px", fontSize: "0.82rem" }}>
                      ({source.url})
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </article>

          <nav className="doc-pagination" aria-label="이전 및 다음 에이전트">
            {previous ? (
              <Link href={`/agents/${previous.slug}`}>
                <small>이전 에이전트</small>
                {previous.title}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={`/agents/${next.slug}`}>
                <small>다음 에이전트</small>
                {next.title}
              </Link>
            )}
          </nav>
        </div>

        <aside className="page-outline">
          <p>이 페이지에서</p>
          <nav aria-label="페이지 목차">
            <a href="#form-factors">1. 사용 형태 및 상태</a>
            <a href="#suitable">2. 적합한 상황</a>
            <a href="#strengths">3. 작업 방식과 강점</a>
            <a href="#cautions">4. 주의할 점</a>
            <a href="#differences">5. 타 에이전트와의 차이</a>
            <a href="#sources">6. 공식 출처</a>
          </nav>
        </aside>
      </div>
    </>
  );
}
