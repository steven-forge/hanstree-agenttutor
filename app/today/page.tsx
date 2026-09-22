import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../SiteHeader";
import DocsSidebar from "../DocsSidebar";
import { todayData, contentHealth } from "../content";
import latestCollection from "../../data/today-candidates.json";

export const metadata: Metadata = {
  title: "AI 뉴스레터 · AgentTutor",
  description: "최근 60일간 수집한 AI 및 Agent 관련 공식 뉴스를 최신순으로 모아 보는 뉴스레터"
};

const PAGE_SIZE = 10;
const RELEASE_SOURCE_IDS = new Set(["codex-releases", "gemini-releases", "claude-releases", "grok-releases"]);

function formatKstTime(isoString: string | null | undefined): string {
  if (!isoString) return "미정";
  try {
    const ms = Date.parse(isoString);
    if (isNaN(ms)) return isoString;
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(new Date(ms)) + " KST";
  } catch {
    return String(isoString);
  }
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const { page } = await searchParams;
  const { edition_date, window_start, window_end, collected_at, reviewed_at, articles } = todayData;
  const { news: newsHealth } = contentHealth;

  const filteredArticles = (articles || []).filter((a) => !RELEASE_SOURCE_IDS.has(a.source_id));
  const filteredHealthSources = (newsHealth.sources || []).filter((s) => !RELEASE_SOURCE_IDS.has(s.id || ""));
  const newsCandidateCount = filteredHealthSources.reduce((acc, s) => acc + (s.count ?? 0), 0);
  const newsFailedCount = filteredHealthSources.filter((s) => s.status === "failed").length;
  const newsHasHeld = filteredHealthSources.some((s) => (s.held_count ?? 0) > 0);
  const newsStatus =
    filteredHealthSources.length === 0
      ? "not_collected"
      : newsFailedCount === filteredHealthSources.length
      ? "failed"
      : newsFailedCount > 0 || newsHasHeld
      ? "partial"
      : "ok";

  const count = filteredArticles.length;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  // 생략=1, 양의 정수 문자열만 유효, 그 외(배열·0·음수·소수·문자)는 0으로 무효 처리
  const pageNum = page === undefined ? 1 : typeof page === "string" && /^[1-9]\d*$/.test(page) ? Number(page) : 0;
  const pageOutOfRange = pageNum < 1 || pageNum > totalPages;
  const pageHref = (n: number) => (n === 1 ? "/today" : `/today?page=${n}`);
  const pageStart = (pageNum - 1) * PAGE_SIZE;
  const hasArticles = count > 0;
  const isReviewed = Boolean(reviewed_at);
  const isReviewedEmpty = isReviewed && count === 0;
  const hasNoCandidates = !isReviewed && newsStatus !== "failed" && Boolean(newsHealth.checked_at) && newsCandidateCount === 0;

  const publishedCountText = `총 ${count}건`;

  return (
    <>
      <SiteHeader currentPath="/today" />
      <div className="docs-shell">
        <DocsSidebar currentPath="/today" />
        <div className="doc-main" role="main">
          <header className="doc-meta" style={{ marginBottom: "24px" }}>
            <div>
              <span>
                수집 상태 ·{" "}
                {newsStatus === "not_collected"
                  ? "수집 대기 중"
                  : newsStatus === "ok"
                  ? "정상 수집"
                  : newsStatus === "partial"
                  ? "부분 수집 (일부 출처 지연·확인 보류)"
                  : "수집 오류 (이전 판본 유지)"}
              </span>
              <time dateTime={reviewed_at || undefined}>
                기존 검토 시각 · {reviewed_at ? formatKstTime(reviewed_at) : "검토 대기"} (이후 자동 수집 기사는 개별 검토 전일 수 있음)
              </time>
            </div>
          </header>

          <div className="legacy-content" style={{ padding: 0 }}>
            <header className="hero" id="overview">
              <p className="eyebrow">AI NEWSLETTER</p>
              <h1>AI 뉴스레터</h1>
              <p className="lead">
                최근 60일간 공식 출처에서 수집한 AI·Agent 관련 소식과, 외부 매체 매시간 수집에서 서로 독립된 출처 2곳 이상이 확인된 뉴스를 최신순으로 모아 보여줍니다.
              </p>
              <div style={{ marginTop: "16px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <span className="date">
                  기준일 · {edition_date || "아직 발행되지 않음"}
                </span>
                <span className="date">
                  기사 수 · {publishedCountText}
                </span>
                <span className="date">
                  60일 수집 기간 · {formatKstTime(window_start || latestCollection.window_start)} ~ {formatKstTime(window_end || latestCollection.window_end)}
                </span>
              </div>
            </header>

            {newsStatus === "not_collected" && (
              <div className="health-notice" style={{ marginTop: "24px" }}>
                <strong>안내:</strong> 뉴스 자동 수집 및 검토가 아직 실행되지 않아 초기 대기 상태입니다.
                일일 수집기 실행 후 편집자의 사실 확인 검토를 거쳐 실제 발행된 기사만 공개됩니다.
              </div>
            )}

            {newsStatus === "partial" && (
              <div className="health-notice" style={{ marginTop: "24px" }}>
                <strong>주의:</strong> 일부 출처에 수집 오류 또는 발행 시각이 불명확한 항목이 있습니다. 확인이 끝나지 않은 기사는 공개하지 않으며, 아래에 보류 건수를 표시합니다.
              </div>
            )}

            {newsStatus === "failed" && (
              <div className="health-notice" style={{ marginTop: "24px", borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b" }}>
                <strong>오류:</strong> 금일 뉴스 수집에 오류가 발생하여 이전 정상 검토본을 유지하거나 대기 중입니다.
              </div>
            )}

            {!hasArticles ? (
              <div className="empty-state" style={{ marginTop: "32px" }}>
                <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)" }}>
                  {isReviewedEmpty ? "조건에 맞는 주요 뉴스가 없습니다." : hasNoCandidates ? "현재 발행 가능한 뉴스 후보는 0건입니다." : "아직 검토되지 않았습니다."}
                </p>
                <p>
                  {isReviewedEmpty
                    ? "금일 수집된 후보 중 발행 기준(중요도 및 기술적 연관성)을 충족하는 주요 뉴스가 없습니다."
                    : hasNoCandidates ? "최근 수집 결과 중 발행 시각과 표시된 수집 기간 조건이 확인된 후보가 없습니다. 시각이 불명확한 항목과 수집 오류는 아래에 따로 표시하며, 개수를 맞추기 위해 기사를 만들지 않습니다."
                    : "뉴스 수집기 실행 대기 중이거나 편집자의 사실 확인 검토가 진행 중입니다. 검토 완료 후 실제 기사가 공개됩니다."}
                </p>
                <div style={{ marginTop: "16px" }}>
                  <Link href="/learn" className="tag-link" style={{ padding: "6px 14px", fontSize: "0.85rem" }}>
                    기초 개념 학습하러 가기 →
                  </Link>
                </div>
              </div>
            ) : pageOutOfRange ? (
              <div id="articles" className="empty-state" style={{ marginTop: "32px" }}>
                <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)" }}>해당 페이지에 뉴스가 없습니다.</p>
                <div style={{ marginTop: "16px" }}>
                  <Link href="/today" className="tag-link" style={{ padding: "6px 14px", fontSize: "0.85rem" }}>
                    1페이지로 이동 →
                  </Link>
                </div>
              </div>
            ) : (
              <div id="articles" style={{ display: "grid", gap: "20px", marginTop: "32px" }}>
                <p className="section-note" style={{ margin: 0 }}>{pageNum} / {totalPages} 페이지</p>
                {filteredArticles.slice(pageStart, pageStart + PAGE_SIZE).map((article, index) => (
                  <article key={article.id} className="card" style={{ padding: "24px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", marginBottom: "8px" }}>
                      <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--blue)" }}>
                        #{pageStart + index + 1}
                      </span>
                      <time dateTime={article.published_at || article.published_on} style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                        발행 · {article.published_at ? formatKstTime(article.published_at) : article.published_on ? `${article.published_on} · 날짜만 확인` : "미정"}
                      </time>
                    </div>

                    <h2 style={{ fontSize: "1.25rem", margin: "0 0 10px", lineHeight: "1.4" }}>
                      {article.title_ko || article.title}
                    </h2>

                    {article.summary ? (
                      <p style={{ fontSize: "0.95rem", color: "var(--ink)", lineHeight: "1.6", marginBottom: "14px" }}>
                        {article.summary}
                      </p>
                    ) : article.source_summary ? (
                      <p style={{ fontSize: "0.95rem", color: "var(--ink)", lineHeight: "1.6", marginBottom: "14px" }}>
                        <strong style={{ fontSize: "0.8rem", color: "var(--muted)" }}>출처 제공 설명</strong>
                        <br />
                        {article.source_summary_ko || article.source_summary}
                      </p>
                    ) : null}

                    <details style={{ margin: "14px 0", background: "var(--wash)", padding: "12px 14px", borderRadius: "8px" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--blue)", fontSize: "0.88rem" }}>
                        왜 중요한가요? (초보자 해설)
                      </summary>
                      <p style={{ marginTop: "8px", fontSize: "0.9rem", color: "#374151", lineHeight: "1.6" }}>
                        {article.why_it_matters}
                      </p>
                    </details>

                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--line)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                          출처: <strong>{article.source_name}</strong>
                          {article.importance && (
                            <span
                              className={article.importance === "high" ? "status-confirmed" : "status-conditional"}
                              style={{ marginLeft: "8px", fontSize: "0.72rem" }}
                              title="서로 독립된 매체 2곳 이상에서 확인되면 보통, 3곳 이상이면 높음"
                            >
                              중요도 {article.importance === "high" ? "높음" : "보통"} · 독립 출처 {article.independent_source_count ?? 0}곳
                            </span>
                          )}
                        </span>
                        <a
                          href={article.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: "0.85rem", color: "var(--blue)", fontWeight: 700, textDecoration: "none" }}
                        >
                          원문 기사 읽기 (새 탭) ↗
                        </a>
                      </div>
                      {article.sources && article.sources.length > 1 && (
                        <ul aria-label="확인된 출처" style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: "0.8rem" }}>
                          {article.sources.map((s) => (
                            <li key={`${s.source_id}:${s.url}`}>
                              <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", textDecoration: "none" }}>
                                {s.name} ↗
                              </a>
                              {!s.independent && <span style={{ color: "var(--muted)" }}> (커뮤니티·재인용)</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </article>
                ))}
                {totalPages > 1 && (
                  <nav aria-label="뉴스 페이지 이동" style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                    {pageNum > 1 && <Link href={pageHref(pageNum - 1)} className="tag-link" rel="prev">← 이전</Link>}
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                      <Link key={n} href={pageHref(n)} className="tag-link" aria-current={n === pageNum ? "page" : undefined} style={n === pageNum ? { fontWeight: 800 } : undefined}>
                        {n}
                      </Link>
                    ))}
                    {pageNum < totalPages && <Link href={pageHref(pageNum + 1)} className="tag-link" rel="next">다음 →</Link>}
                  </nav>
                )}
              </div>
            )}

            {/* 수집 및 점검 상태 */}
            <section id="updates" style={{ marginTop: "44px", paddingTop: "32px", borderTop: "1px solid var(--line)" }}>
              <div className="section-head">
                <div>
                  <h2 style={{ fontSize: "1.25rem", margin: "0 0 4px" }}>수집 및 점검 상태</h2>
                  <p className="section-note" style={{ margin: 0 }}>
                    공식 뉴스 피드 점검 현황과 출처별 수집·보류 상태입니다.
                  </p>
                </div>
                <span className="badge">수집 정보</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginTop: "16px" }}>
                <div className="card" style={{ padding: "14px 18px" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)", display: "block" }}>점검 시각</span>
                  <strong style={{ fontSize: "0.95rem" }}>{formatKstTime(newsHealth.checked_at)}</strong>
                </div>
                <div className="card" style={{ padding: "14px 18px" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)", display: "block" }}>수집 후보</span>
                  <strong style={{ fontSize: "0.95rem" }}>{newsCandidateCount}건</strong>
                </div>
                <div className="card" style={{ padding: "14px 18px" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)", display: "block" }}>수집 전체 상태</span>
                  <span
                    className={
                      newsStatus === "ok"
                        ? "status-confirmed"
                        : newsStatus === "partial"
                        ? "status-conditional"
                        : "status-unconfirmed"
                    }
                    style={{ fontSize: "0.75rem", marginTop: "4px" }}
                  >
                    {newsStatus === "ok"
                      ? "정상 (ok)"
                      : newsStatus === "partial"
                      ? "부분 수집 (partial)"
                      : newsStatus === "not_collected"
                      ? "수집 대기 (not_collected)"
                      : "오류 (failed)"}
                  </span>
                </div>
              </div>

              {filteredHealthSources && filteredHealthSources.length > 0 && (
                <div className="table-wrap" tabIndex={0} role="region" aria-label="출처별 점검 상태 표" style={{ marginTop: "20px" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>출처</th>
                        <th>상태</th>
                        <th>새 기사</th>
                        <th>보류 건수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHealthSources.map((s) => (
                        <tr key={s.id || s.url}>
                          <td>
                            <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink)", fontWeight: 600, textDecoration: "none" }}>
                              {s.name || s.id} ↗
                            </a>
                          </td>
                          <td>
                            <span
                              className={s.status === "ok" ? "status-confirmed" : s.status === "not_configured" ? "status-conditional" : "status-unconfirmed"}
                              style={{ fontSize: "0.74rem" }}
                              {...(s.status === "failed" && {
                                title: s.error || "실패 사유가 기록되지 않았습니다.",
                                "aria-label": `수집 실패: ${s.error || "실패 사유가 기록되지 않았습니다."}`,
                              })}
                              {...(s.status === "not_configured" && { title: s.error || "공식 API 환경변수가 설정되지 않아 호출하지 않았습니다." })}
                            >
                              {s.status === "ok" ? "정상" : s.status === "partial" ? "일부 보류" : s.status === "not_configured" ? "미설정" : "수집 실패"}
                            </span>
                          </td>
                          <td>{s.count ?? 0}건</td>
                          <td>
                            {s.held_count !== undefined && s.held_count > 0 ? (
                              <span style={{ color: "#854d0e", fontWeight: 700, fontSize: "0.85rem" }}>
                                {s.held_count}건 보류
                              </span>
                            ) : (
                              <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>0건</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <footer className="home-foot" style={{ marginTop: "48px" }}>
            <span>공개본 수집 시각: {collected_at ? formatKstTime(collected_at) : "아직 공개본 없음"}</span>
            <span>검토 시각: {reviewed_at ? formatKstTime(reviewed_at) : "대기 중"}</span>
            <span>한국 표준시(KST) 기준 최근 60일 누적 뉴스레터</span>
          </footer>
        </div>

        <aside className="page-outline">
          <p>이 페이지에서</p>
          <nav aria-label="페이지 목차">
            <a href="#overview">개요</a>
            {hasArticles && <a href="#articles">뉴스 목록</a>}
            <a href="#updates">수집 및 점검 상태</a>
          </nav>
        </aside>
      </div>
    </>
  );
}
