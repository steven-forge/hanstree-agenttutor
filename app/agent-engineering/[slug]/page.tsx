import { notFound } from "next/navigation";
import Link from "next/link";
import SiteHeader from "../../SiteHeader";
import DocsSidebar from "../../DocsSidebar";
import { engineeringDocs } from "../../content";

export function generateStaticParams() {
  return engineeringDocs.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = engineeringDocs.find((item) => item.slug === slug);
  return doc ? { title: `${doc.title} · Agent Engineering · AgentTutor`, description: doc.description } : {};
}

export default async function AgentEngineeringDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = engineeringDocs.find((item) => item.slug === slug);
  if (!doc) notFound();

  const sortedDocs = [...engineeringDocs].sort((a, b) => a.order - b.order);
  const currentIndex = sortedDocs.findIndex((item) => item.slug === doc.slug);
  const previous = sortedDocs[currentIndex - 1];
  const next = sortedDocs[currentIndex + 1];

  const currentPath = `/agent-engineering/${doc.slug}`;

  const learnLink =
    doc.slug === "memory"
      ? { href: "/learn/memory", label: "Learn: Memory 기초" }
      : doc.slug === "context-management"
      ? { href: "/learn/context", label: "Learn: Context 기초" }
      : { href: "/learn/agent-basics", label: "Learn: Agent 기본" };

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
              <span>
                연계 기초 · <Link href={learnLink.href}>{learnLink.label}</Link>
              </span>
              <time dateTime={doc.reviewed_at}>
                검토일 · {doc.reviewed_at.split("T")[0]}
              </time>
            </div>
          </header>

          <article className="legacy-content">
            <header className="hero">
              <p className="eyebrow">AGENT ENGINEERING #{doc.order}</p>
              <h1>{doc.title}</h1>
              <p className="lead">{doc.description}</p>
              <span className="date">검토일 · {doc.reviewed_at.split("T")[0]} KST</span>
            </header>

            {/* Section 1: 무엇인가 */}
            <section className="section" id="what">
              <div className="section-head">
                <div>
                  <h2>1. 무엇인가</h2>
                  <p className="section-note">기술의 본질과 시스템 내 위치를 이해합니다.</p>
                </div>
                <span className="badge">개념 정의</span>
              </div>
              <p style={{ fontSize: "1rem", lineHeight: "1.75", color: "var(--ink)" }}>
                {doc.what}
              </p>
            </section>

            {/* Section 2: 언제 쓰는가 */}
            <section className="section" id="when">
              <div className="section-head">
                <div>
                  <h2>2. 언제 쓰는가</h2>
                  <p className="section-note">해당 기술이 필요한 구체적인 문제 상황입니다.</p>
                </div>
                <span className="badge">적용 시점</span>
              </div>
              <p style={{ fontSize: "0.98rem", lineHeight: "1.7", color: "#374151" }}>
                {doc.when_to_use}
              </p>
            </section>

            {/* Section 3: 주요 구성 요소 */}
            <section className="section" id="components">
              <div className="section-head">
                <div>
                  <h2>3. 주요 구성 요소</h2>
                  <p className="section-note">기술을 구성하는 핵심 단위들입니다.</p>
                </div>
                <span className="badge">구조 분석</span>
              </div>
              <div style={{ display: "grid", gap: "12px" }}>
                {doc.key_components.map((comp) => (
                  <div key={comp.name} className="card" style={{ padding: "16px 20px" }}>
                    <strong style={{ display: "block", fontSize: "1rem", color: "var(--ink)", marginBottom: "4px" }}>
                      {comp.name}
                    </strong>
                    <span style={{ fontSize: "0.9rem", color: "var(--muted)", lineHeight: "1.6" }}>
                      {comp.description}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 4: 최소 예시 */}
            <section className="section" id="example">
              <div className="section-head">
                <div>
                  <h2>4. 최소 예시</h2>
                  <p className="section-note">검증되지 않은 명령을 지양하고 본질에 집중한 최소 코드입니다.</p>
                </div>
                <span className={doc.minimal_example.is_product_example ? "badge-product" : "badge-concept"}>
                  {doc.minimal_example.is_product_example ? "특정 제품 예시" : "표준 개념 예시"}
                </span>
              </div>

              <div style={{ marginBottom: "12px" }}>
                <strong style={{ fontSize: "0.95rem", color: "var(--ink)" }}>
                  {doc.minimal_example.title}
                </strong>
                {doc.minimal_example.note && (
                  <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                    {doc.minimal_example.note}
                  </p>
                )}
              </div>

              <pre style={{ margin: 0 }}>
                <code>{doc.minimal_example.code}</code>
              </pre>
            </section>

            {/* Optional Comparison Table */}
            {doc.comparison_table && (
              <section className="section" id="comparison">
                <div className="section-head">
                  <div>
                    <h2>책임 및 비교 분석</h2>
                    <p className="section-note">{doc.comparison_table.caption}</p>
                  </div>
                  <span className="badge">비교 분석</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {doc.comparison_table.headers.map((h, i) => (
                          <th key={i}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {doc.comparison_table.rows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {row.map((cell, cIdx) => (
                            <td key={cIdx}>
                              {cIdx === 0 ? <strong>{cell}</strong> : cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Optional Special Section */}
            {doc.special_section && (
              <section className="section" id="special">
                <div className="section-head">
                  <div>
                    <h2>{doc.special_section.title}</h2>
                    <p className="section-note">{doc.special_section.content}</p>
                  </div>
                  <span className="badge">핵심 가이드</span>
                </div>
                {doc.special_section.items && (
                  <div style={{ display: "grid", gap: "12px" }}>
                    {doc.special_section.items.map((item, idx) => (
                      <div key={idx} className="card" style={{ padding: "16px 20px" }}>
                        <strong style={{ display: "block", fontSize: "0.98rem", color: "var(--blue)", marginBottom: "4px" }}>
                          {item.label}
                        </strong>
                        <p style={{ margin: 0, fontSize: "0.9rem", color: "#374151", lineHeight: "1.6" }}>
                          {item.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Section 5: 실패 및 권한 주의사항 */}
            <section className="section" id="cautions">
              <div className="section-head">
                <div>
                  <h2>5. 실패 및 권한 주의사항</h2>
                  <p className="section-note">실무 운영 시 마주치는 보안 위험과 실패 시나리오입니다.</p>
                </div>
                <span className="badge warning">보안·운영</span>
              </div>
              <div style={{ display: "grid", gap: "10px" }}>
                {doc.failure_and_permissions.map((caution, idx) => (
                  <div key={idx} className="callout warning" style={{ margin: 0 }}>
                    <strong>주의 {idx + 1}:</strong> {caution}
                  </div>
                ))}
              </div>
            </section>

            {/* Section 6: 선택 기준 및 관련 용어 */}
            <section className="section" id="selection">
              <div className="section-head">
                <div>
                  <h2>6. 선택 기준 & 관련 용어</h2>
                  <p className="section-note">유사한 다른 기능과의 구별 기준 및 용어 링크입니다.</p>
                </div>
                <span className="badge">선택 기준</span>
              </div>
              <ul style={{ paddingLeft: "20px", fontSize: "0.95rem", lineHeight: "1.8", color: "var(--ink)" }}>
                {doc.selection_criteria.map((criteria, idx) => (
                  <li key={idx}>{criteria}</li>
                ))}
              </ul>

              <div style={{ marginTop: "24px" }}>
                <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--muted)", marginBottom: "8px" }}>
                  관련 용어사전:
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

              <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
                <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--muted)", marginBottom: "8px" }}>
                  연계 기초 개념:
                </p>
                <Link
                  href={learnLink.href}
                  className="tag-link"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    fontSize: "0.88rem",
                    fontWeight: 600,
                    color: "var(--blue)"
                  }}
                >
                  📖 {learnLink.label} 바로가기 &rarr;
                </Link>
              </div>
            </section>
          </article>

          <nav className="doc-pagination" aria-label="이전 및 다음 주제">
            {previous ? (
              <Link href={`/agent-engineering/${previous.slug}`}>
                <small>이전 엔지니어링 주제</small>
                {previous.title}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={`/agent-engineering/${next.slug}`}>
                <small>다음 엔지니어링 주제</small>
                {next.title}
              </Link>
            )}
          </nav>
        </div>

        <aside className="page-outline">
          <p>이 페이지에서</p>
          <nav aria-label="페이지 목차">
            <a href="#what">1. 무엇인가</a>
            <a href="#when">2. 언제 쓰는가</a>
            <a href="#components">3. 구성 요소</a>
            <a href="#example">4. 최소 예시</a>
            {doc.comparison_table && <a href="#comparison">비교 분석</a>}
            {doc.special_section && <a href="#special">{doc.special_section.title}</a>}
            <a href="#cautions">5. 실패 및 권한</a>
            <a href="#selection">6. 선택 기준</a>
          </nav>
        </aside>
      </div>
    </>
  );
}
