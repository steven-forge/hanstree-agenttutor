import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../SiteHeader";
import DocsSidebar from "../DocsSidebar";
import { todayData, contentHealth, glossaryTerms, newsEditorial, NEWS_TOPIC_LABELS, type ContentHealthSource, type NewsTopic, type OfficialRunTelemetry, type HourlyRunTelemetry } from "../content";
import { RELEASE_SOURCE_IDS, OFFICIAL_NEWS_SOURCE_IDS, isValidDateParam, articleDateKey, resolveGlossaryLinks, formatKstTime } from "./newsHelpers";
import latestCollection from "../../data/today-candidates.json";
import { bundledNewsPolicy as policy } from "../lib/news-policy";

export const metadata: Metadata = {
  title: "뉴스레터 · AgentTutor",
  description: "설정한 수집·게시 기준으로 모은 AI 및 Agent 관련 뉴스레터",
  alternates: { types: { "application/rss+xml": "/feed.xml" } }
};

const PAGE_SIZE = policy.display.page_size;
const TOPIC_OPTIONS: (NewsTopic | "unclassified")[] = ["model", "tools", "safety", "unclassified"];

function checkedAtLabel(iso?: string | null): string {
  return iso ? formatKstTime(iso) : "기록 없음";
}

function countLabel(s: ContentHealthSource): string {
  if (s.status === "not_configured") return "미점검";
  const base = `${s.count ?? 0}건`;
  if (s.coverage_limited) return `${base} (이력 제한)`;
  if (s.status === "ok" && (s.count ?? 0) === 0 && s.checked_at) return `${base} (이번 점검 정상)`;
  return base;
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ page?: string | string[]; source?: string | string[]; topic?: string | string[]; date?: string | string[] }> }) {
  const params = await searchParams;
  const { page } = params;
  const { edition_date, window_start, window_end, collected_at, articles } = todayData;
  const { news: newsHealth } = contentHealth;

  const newsArticles = (articles || []).filter((a) => !RELEASE_SOURCE_IDS.has(a.source_id));
  const newsSourceOptions = Array.from(new Map(newsArticles.map((a) => [a.source_id, a.source_name])).entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const selectedSource =
    typeof params.source === "string" && newsSourceOptions.some((s) => s.id === params.source) ? params.source : "all";
  const selectedTopic =
    typeof params.topic === "string" && (TOPIC_OPTIONS as string[]).includes(params.topic) ? (params.topic as NewsTopic | "unclassified") : "all";
  const selectedDate = typeof params.date === "string" && isValidDateParam(params.date) ? params.date : "";

  const articleEditorial = newsEditorial.articles || {};
  const bySource = newsArticles.filter((a) => selectedSource === "all" || a.source_id === selectedSource);
  const byTopic = bySource.filter((a) => {
    if (selectedTopic === "all") return true;
    const topics = articleEditorial[a.id]?.topics;
    if (selectedTopic === "unclassified") return !topics || topics.length === 0;
    return Boolean(topics?.includes(selectedTopic));
  });
  const filteredArticles = byTopic.filter((a) => selectedDate === "" || articleDateKey(a) === selectedDate);
  if (policy.display.sort === "importance") filteredArticles.sort((a, b) => Number(b.importance === "high") - Number(a.importance === "high"));
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
  const buildHref = (overrides: { page?: number; source?: string; topic?: string; date?: string }) => {
    const query = new URLSearchParams();
    const page = overrides.page ?? pageNum;
    const source = overrides.source ?? selectedSource;
    const topic = overrides.topic ?? selectedTopic;
    const date = overrides.date ?? selectedDate;
    if (page > 1) query.set("page", String(page));
    if (source !== "all") query.set("source", source);
    if (topic !== "all") query.set("topic", topic);
    if (date) query.set("date", date);
    const search = query.toString();
    return search ? `/today?${search}` : "/today";
  };
  const pageHref = (n: number) => buildHref({ page: n });
  const pageStart = (pageNum - 1) * PAGE_SIZE;
  const hasArticles = count > 0;
  const hasNoCandidates = newsStatus !== "failed" && Boolean(newsHealth.checked_at) && newsCandidateCount === 0;

  const selectedSourceName = newsSourceOptions.find((s) => s.id === selectedSource)?.name;
  const publishedCountText = selectedSourceName ? `${selectedSourceName} · ${count}건` : `전체 · ${count}건`;
  const hasActiveFilters = selectedSource !== "all" || selectedTopic !== "all" || Boolean(selectedDate);
  const officialRun = (latestCollection as { official_run?: OfficialRunTelemetry }).official_run;
  const hourlyRun = (latestCollection as { hourly_run?: HourlyRunTelemetry }).hourly_run;

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
              <time dateTime={collected_at || undefined}>
                최근 공개 기사 갱신 · {collected_at ? formatKstTime(collected_at) : "기록 없음"} (기사별 편집 기록은 각 기사 하단에 표시)
              </time>
            </div>
          </header>

          <div className="legacy-content" style={{ padding: 0 }}>
            <header className="hero" id="overview">
              <p className="eyebrow">NEWSLETTER</p>
              <h1>뉴스레터</h1>
              <p className="lead">
                공식 출처 최근 {policy.official_window_days}일, 외부 출처 최근 {policy.window_hours}시간을 살펴 게시 기준을 통과한 AI·Agent 소식을 누적합니다. 목록은 {policy.display.sort === "importance" ? "중요도 높은 기사 우선, 같은 중요도는 최신순" : "최신순"}입니다.
              </p>
              <div style={{ marginTop: "16px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <span className="date">
                  기준일 · {edition_date || "아직 발행되지 않음"}
                </span>
                <span className="date">
                  기사 수 · {publishedCountText}
                </span>
                <span className="date">
                  최근 공식 수집 기간 · {formatKstTime(officialRun?.window_start || latestCollection.window_start || window_start)} ~ {formatKstTime(officialRun?.window_end || latestCollection.window_end || window_end)}
                </span>
              </div>
              <nav aria-label="뉴스 모아 보기" style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", gap: "12px" }}>
                {newsEditorial.weekly && <a href="#weekly">주간 회고</a>}
                {newsEditorial.story && <a href="#story">이슈 연표</a>}
                <a href="/feed.xml">RSS 구독</a>
                <a href="#how-we-collect">어떻게 모았나</a>
              </nav>
            </header>

            {newsStatus === "not_collected" && (
              <div className="health-notice" style={{ marginTop: "24px" }}>
                <strong>안내:</strong> 뉴스 자동 수집이 아직 실행되지 않아 초기 대기 상태입니다.
                {policy.publish.auto_publish ? "수집 실행 후 게시 기준을 통과한 기사만 자동 공개됩니다." : "자동 게시는 일시정지되어 있으며 수집한 뉴스는 후보로 보관합니다."}
              </div>
            )}

            {newsStatus === "partial" && (
              <div className="health-notice" style={{ marginTop: "24px" }}>
                <strong>주의:</strong> 일부 출처에 수집 오류 또는 발행 시각이 불명확한 항목이 있습니다. 확인이 끝나지 않은 기사는 공개하지 않으며, 아래에 보류 건수를 표시합니다.
              </div>
            )}

            {newsStatus === "failed" && (
              <div className="health-notice" style={{ marginTop: "24px", borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b" }}>
                <strong>오류:</strong> 최근 뉴스 수집에 오류가 발생하여 이전에 정상 수집된 기사를 유지합니다.
              </div>
            )}

            {newsSourceOptions.length > 0 && (
              <nav className="releases-tabs" aria-label="뉴스 출처 필터">
                <Link
                  href={buildHref({ source: "all", page: 1 })}
                  className={`releases-tab${selectedSource === "all" ? " active" : ""}`}
                  aria-current={selectedSource === "all" ? "page" : undefined}
                >
                  전체
                </Link>
                {newsSourceOptions.map((s) => (
                  <Link
                    key={s.id}
                    href={buildHref({ source: s.id, page: 1 })}
                    className={`releases-tab${selectedSource === s.id ? " active" : ""}`}
                    aria-current={selectedSource === s.id ? "page" : undefined}
                  >
                    {s.name}
                  </Link>
                ))}
              </nav>
            )}

            <nav className="releases-tabs" aria-label="뉴스 주제 필터" style={{ marginTop: "8px" }}>
              <Link
                href={buildHref({ topic: "all", page: 1 })}
                className={`releases-tab${selectedTopic === "all" ? " active" : ""}`}
                aria-current={selectedTopic === "all" ? "page" : undefined}
              >
                전체 주제
              </Link>
              {TOPIC_OPTIONS.map((t) => (
                <Link
                  key={t}
                  href={buildHref({ topic: t, page: 1 })}
                  className={`releases-tab${selectedTopic === t ? " active" : ""}`}
                  aria-current={selectedTopic === t ? "page" : undefined}
                >
                  {t === "unclassified" ? "미분류" : NEWS_TOPIC_LABELS[t]}
                </Link>
              ))}
            </nav>
            <p className="section-note" style={{ margin: "6px 0 0" }}>
              주제는 편집 검토 기록이 있는 기사에만 수동으로 붙습니다(한 기사에 여러 주제 가능). 미분류는 신뢰도가 낮다는 뜻이 아니라 아직 분류 기록이 없다는 뜻입니다.
              모델은 출시·성능·비용, 도구는 앱·개발 도구의 기능·사용법, 안전은 보호 장치·위험 관리·관련 정책을 다룹니다.
            </p>

            <form action="/today" method="get" style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
              {selectedSource !== "all" && <input type="hidden" name="source" value={selectedSource} />}
              {selectedTopic !== "all" && <input type="hidden" name="topic" value={selectedTopic} />}
              <label htmlFor="date-filter" style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                날짜별 보기
              </label>
              <input id="date-filter" type="date" name="date" defaultValue={selectedDate} />
              <button type="submit" className="tag-link" style={{ padding: "6px 14px", fontSize: "0.85rem" }}>
                적용
              </button>
              {(selectedSource !== "all" || selectedTopic !== "all" || selectedDate) && (
                <Link href="/today" className="tag-link" style={{ padding: "6px 14px", fontSize: "0.85rem" }}>
                  필터 초기화
                </Link>
              )}
            </form>

            {!hasArticles ? (
              <div className="empty-state" style={{ marginTop: "32px" }}>
                <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)" }}>
                  {hasActiveFilters
                    ? "선택한 조건에 해당하는 기사가 없습니다."
                    : hasNoCandidates ? "현재 발행 가능한 뉴스 후보는 0건입니다." : "아직 수집된 기사가 없습니다."}
                </p>
                <p>
                  {hasActiveFilters
                    ? "다른 출처·주제·날짜를 선택하거나 필터를 초기화하세요."
                    : hasNoCandidates ? "최근 수집 결과 중 발행 시각과 표시된 수집 기간 조건이 확인된 후보가 없습니다. 시각이 불명확한 항목과 수집 오류는 아래에 따로 표시하며, 개수를 맞추기 위해 기사를 만들지 않습니다."
                    : "뉴스 자동 수집기 실행 대기 중입니다. 실행 후 발행 기준을 통과한 기사가 자동으로 공개됩니다."}
                </p>
                <div style={{ marginTop: "16px" }}>
                  <Link href={hasActiveFilters ? "/today" : "/learn"} className="tag-link" style={{ padding: "6px 14px", fontSize: "0.85rem" }}>
                    {hasActiveFilters ? "전체 보기로 돌아가기 →" : "기초 개념 학습하러 가기 →"}
                  </Link>
                </div>
              </div>
            ) : pageOutOfRange ? (
              <div id="articles" className="empty-state" style={{ marginTop: "32px" }}>
                <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)" }}>해당 페이지에 뉴스가 없습니다.</p>
                <div style={{ marginTop: "16px" }}>
                  <Link href={buildHref({ page: 1 })} className="tag-link" style={{ padding: "6px 14px", fontSize: "0.85rem" }}>
                    1페이지로 이동 →
                  </Link>
                </div>
              </div>
            ) : (
              <div id="articles" style={{ display: "grid", gap: "20px", marginTop: "32px" }}>
                <p className="section-note" style={{ margin: 0 }}>{pageNum} / {totalPages} 페이지 · {policy.display.sort === "importance" ? "중요도 높은 기사 우선 · 같은 중요도는 최신순" : "최신순 정렬 (순위 아님)"}</p>
                {filteredArticles.slice(pageStart, pageStart + PAGE_SIZE).map((article, idx, pageArticles) => {
                  const dateKey = articleDateKey(article);
                  const prevDateKey = idx > 0 ? articleDateKey(pageArticles[idx - 1]) : null;
                  const showDateHeading = dateKey !== null && dateKey !== prevDateKey;
                  const editorial = articleEditorial[article.id];
                  const glossaryLinks = resolveGlossaryLinks(editorial?.related_glossary_ids, glossaryTerms);
                  const whyProvenanceLabel =
                    article.why_it_matters_provenance === "editorial"
                      ? "편집 해설"
                      : article.why_it_matters_provenance === "automatic"
                      ? "자동 생성 해설"
                      : "작성 방식 기록 없음";
                  return (
                  <div key={article.id}>
                    {showDateHeading && (
                      <h3 style={{ fontSize: "0.95rem", color: "var(--muted)", margin: "8px 0 4px" }}>
                        {dateKey}{article.date_precision === "day" ? " · 날짜만 확인" : ""}
                      </h3>
                    )}
                    <article id={`article-${article.id}`} className="card" style={{ padding: "24px" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: "12px", marginBottom: "8px" }}>
                      <time dateTime={article.published_at || article.published_on} style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                        발행 · {article.published_at ? formatKstTime(article.published_at) : article.published_on ? `${article.published_on} · 날짜만 확인` : "미정"}
                      </time>
                    </div>

                    <h2 style={{ fontSize: "1.25rem", margin: "0 0 10px", lineHeight: "1.4" }}>
                      <Link href={`/today/${article.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                        {article.title_ko || article.title} →
                      </Link>
                    </h2>

                    {article.summary ? (
                      <p style={{ fontSize: "0.95rem", color: "var(--ink)", lineHeight: "1.6", marginBottom: "14px", whiteSpace: "pre-line" }}>
                        <strong style={{ fontSize: "0.8rem", color: "var(--muted)" }}>별도 작성 요약</strong><br />
                        {article.summary}
                      </p>
                    ) : article.source_summary ? (
                      <p style={{ fontSize: "0.95rem", color: "var(--ink)", lineHeight: "1.6", marginBottom: "14px" }}>
                        <strong style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                          {article.source_summary_provenance === "article_full_text_3line" ? "원문 3줄 요약 (자동 추출)" : "출처 제공 설명"}
                        </strong>
                        <br />
                        <span style={{ whiteSpace: "pre-line" }}>{article.source_summary_ko || article.source_summary}</span>
                      </p>
                    ) : null}

                    <details style={{ margin: "14px 0", background: "var(--wash)", padding: "12px 14px", borderRadius: "8px" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--blue)", fontSize: "0.88rem" }}>
                        왜 중요한가요? (초보자 해설) · {whyProvenanceLabel}
                      </summary>
                      <p style={{ marginTop: "8px", fontSize: "0.9rem", color: "#374151", lineHeight: "1.6" }}>
                        {article.why_it_matters}
                      </p>
                    </details>

                    <p className="section-note" style={{ margin: "0 0 10px" }}>
                      {editorial
                        ? `편집 기록 · ${editorial.reviewed_by} · ${formatKstTime(editorial.reviewed_at)} · 범위: ${editorial.review_scope}`
                        : article.reviewed_at
                        ? `편집 기록 · ${formatKstTime(article.reviewed_at)} (제목·요약·해설 중 일부 필드 편집, 원문 전체 대조는 아닐 수 있음)`
                        : "기사 단위 편집 기록 없음"}
                    </p>

                    {editorial?.topics && editorial.topics.length > 0 && (
                      <p style={{ margin: "0 0 10px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {editorial.topics.map((t) => (
                          <span key={t} className="tag-link" style={{ fontSize: "0.75rem", padding: "2px 8px" }}>{NEWS_TOPIC_LABELS[t]}</span>
                        ))}
                      </p>
                    )}

                    {glossaryLinks.length > 0 && (
                      <p style={{ margin: "0 0 10px", fontSize: "0.85rem" }}>
                        관련 용어:{" "}
                        {glossaryLinks.map((g, i) => (
                          <span key={g.id}>
                            {i > 0 && ", "}
                            <a href={`/glossary#${g.id}`} style={{ color: "var(--blue)" }}>{g.term}</a>
                          </span>
                        ))}
                      </p>
                    )}

                    {editorial?.check_now && (
                      <div style={{ margin: "0 0 10px", padding: "10px 14px", background: "var(--wash)", borderRadius: "8px", fontSize: "0.85rem" }}>
                        <strong>지금 확인할 것:</strong> {editorial.check_now.text}
                        <br />
                        <span style={{ color: "var(--muted)" }}>대상: {editorial.check_now.audience}</span>
                        <br />
                        <span style={{ color: "var(--muted)" }}>주의: {editorial.check_now.caveat}</span>
                        {" "}
                        <a href={editorial.check_now.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>근거 원문 ↗</a>
                      </div>
                    )}

                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--line)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                          출처: <strong>{article.source_name}</strong>
                          {article.importance && (
                            <span
                              className={article.importance === "high" ? "status-confirmed" : "status-conditional"}
                              style={{ marginLeft: "8px", fontSize: "0.72rem" }}
                              title={
                                OFFICIAL_NEWS_SOURCE_IDS.has(article.source_id) && article.importance === "high"
                                  ? "게시 당시 공식 모델 발표 또는 출처 수 기준으로 지정한 중요도"
                                  : "게시 당시 설정된 매체 수 기준으로 지정한 중요도. 설정 변경 시 과거 기사는 일괄 재평가하지 않습니다."
                              }
                            >
                              중요도 {article.importance === "high" ? "높음" : "보통"} ·{" "}
                              {article.independent_source_count == null ? "공식 발표" : `독립 출처 ${article.independent_source_count}곳`}
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
                  </div>
                  );
                })}
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
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)", display: "block" }}>전체 출처 중 최근 점검</span>
                  <strong style={{ fontSize: "0.95rem" }}>{formatKstTime(newsHealth.checked_at)}</strong>
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

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginTop: "16px" }}>
                <div className="card" style={{ padding: "14px 18px" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)", display: "block" }}>공식 뉴스 실행별 집계</span>
                  {officialRun ? (
                    <span style={{ fontSize: "0.82rem" }}>
                      실행 시각 {formatKstTime(officialRun.collected_at)}<br />
                      발행 창 {formatKstTime(officialRun.window_start)} ~ {formatKstTime(officialRun.window_end)}<br />
                      반환된 신규 후보 항목 {officialRun.candidate_count}건 → 중복 제외 후 신규 게시 {officialRun.published_count}건 (보류 항목 {officialRun.held_item_count}건, 별도 집계)<br />
                      {officialRun.waiting_count !== undefined && <>현재 정책으로 게시 대기 {officialRun.waiting_count}건 (이월 포함)<br /></>}
                      점검 출처 {officialRun.checked_source_count}곳 중 실패 {officialRun.failed_source_count}곳
                    </span>
                  ) : (
                    <strong style={{ fontSize: "0.95rem" }}>실행별 집계 기록 없음</strong>
                  )}
                </div>
                <div className="card" style={{ padding: "14px 18px" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)", display: "block" }}>외부 매체 실행별 집계 (단일 실행)</span>
                  {hourlyRun ? (
                    <span style={{ fontSize: "0.82rem" }}>
                      실행 시각 {formatKstTime(hourlyRun.collected_at)}<br />
                      발행 창 {formatKstTime(hourlyRun.window_start)} ~ {formatKstTime(hourlyRun.window_end)}<br />
                      검토 대상 사건(이월 후보 포함, 기존 기사에 병합된 것 제외) {hourlyRun.candidate_count}건 → 독립 출처 {hourlyRun.min_independent}곳 이상 {hourlyRun.eligible_count}건 → 게시 {hourlyRun.published_count}건<br />
                      대기 {hourlyRun.waiting_count}건 · 게시 보류 {hourlyRun.held_count}건 · 중복 처리 {hourlyRun.duplicate_count}건 (항목 단위 보류 {hourlyRun.held_item_count}건, 별도 집계)<br />
                      점검 출처 {hourlyRun.checked_source_count}곳 중 실패 {hourlyRun.failed_source_count}곳, 미설정 {hourlyRun.not_configured_source_count}곳
                    </span>
                  ) : (
                    <strong style={{ fontSize: "0.95rem" }}>실행별 집계 기록 없음</strong>
                  )}
                </div>
              </div>
              <p className="section-note" style={{ margin: "8px 0 0" }}>
                위 집계는 서로 다른 기간과 최근 실행의 결과이므로 하루·월간 합계로 더할 수 없습니다. 공식 후보는 원래 피드 전체 건수가 아닙니다.
                외부 사건의 게시 보류는 후보에 포함되며, 사건 생성 전 보류 항목과 실패 출처 수는 별도 단위입니다.
                실패·미설정 출처의 발견 건수는 포함하지 않으며, 날짜 미확인 보류 항목은 기간 안에 있는지도 알 수 없습니다. 기록이 없으면 0 대신 &quot;기록 없음&quot;으로 표시합니다.
              </p>

              <details id="how-we-collect" style={{ margin: "24px 0 0", background: "var(--wash)", padding: "14px 16px", borderRadius: "8px" }}>
                <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--blue)", fontSize: "0.95rem" }}>어떻게 모았나</summary>
                <p style={{ marginTop: "10px", fontSize: "0.9rem", color: "#374151", lineHeight: "1.7" }}>
                  현재 설정은 {policy.collection_interval_hours}시간마다 수집이며, 예약 실행은 지연될 수 있습니다. {policy.publish.auto_publish ? "게시 조건을 통과한 기사는 자동 공개합니다." : "자동 게시는 일시정지되어 있으며 후보만 보관합니다."}
                  {policy.publish.official_single_source ? "공식 뉴스는 단독 발표도 게시할 수 있습니다." : "공식 발표도 외부 매체의 게시 근거가 필요합니다."}
                  외부 뉴스는 같은 사건을 게시 근거로 지정된 서로 다른 도메인 {policy.publish.min_independent}곳 이상이 전해야 하며, {policy.publish.high_importance_at}곳 이상이면 중요도 높음으로 분류합니다.
                  {policy.publish.official_model_high && "주요 공식 출처의 새 모델 발표도 중요도 높음으로 분류합니다."} 매체 수는 사실 검증 완료를 뜻하지 않습니다.
                  날짜·필수 설명·번역이 불명확한 항목은 보류하고, 요청 실패는 출처 수집 실패로 기록합니다.
                  본문 추출 요약을 만들지 못하면 출처 제공 설명을 쓸 수 있습니다.
                  자동 해설·원문 추출과 별도로 남긴 편집 메모는 기사별 기록으로 구분해 표시합니다.
                  검토 기록에는 담당자(AI 포함)·시각·범위를 밝히며, 모든 기사를 사람이 검토한 것은 아닙니다.
                </p>
              </details>

              {filteredHealthSources && filteredHealthSources.length > 0 && (
                <div className="table-wrap" tabIndex={0} role="region" aria-label="출처별 점검 상태 표" style={{ marginTop: "20px" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>출처</th>
                        <th>상태</th>
                        <th>수집 건수</th>
                        <th>마지막 확인</th>
                        <th>마지막 성공</th>
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
                              {s.status === "ok" ? "정상" : s.status === "partial" ? "일부 보류" : s.status === "not_configured" ? "API 미설정" : "수집 실패"}
                            </span>
                          </td>
                          <td>{countLabel(s)}</td>
                          <td style={{ fontSize: "0.82rem" }}>{checkedAtLabel(s.checked_at)}</td>
                          <td style={{ fontSize: "0.82rem" }}>{checkedAtLabel(s.last_success_at)}</td>
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

            {newsEditorial.weekly && (
              <section id="weekly" style={{ marginTop: "44px", paddingTop: "32px", borderTop: "1px solid var(--line)" }}>
                <div className="section-head">
                  <div>
                    <h2 style={{ fontSize: "1.25rem", margin: "0 0 4px" }}>주간 회고 (시범, 선택 주제)</h2>
                    <p className="section-note" style={{ margin: 0 }}>
                      선택한 주제의 원문을 대조해 작성한 시범 회고입니다. 담당자와 검토 시각을 아래에 표시합니다.
                    </p>
                  </div>
                  <span className="badge">{newsEditorial.weekly.start_date} ~ {newsEditorial.weekly.end_date}</span>
                </div>
                <h3 style={{ margin: "14px 0 6px" }}>{newsEditorial.weekly.title}</h3>
                <p style={{ fontSize: "0.92rem", lineHeight: "1.7", color: "#374151" }}>{newsEditorial.weekly.summary}</p>
                <p className="section-note">검토: {newsEditorial.weekly.reviewed_by} · {formatKstTime(newsEditorial.weekly.reviewed_at)}</p>
                <ul style={{ margin: "10px 0 0", paddingLeft: "20px" }}>
                  {newsEditorial.weekly.article_ids
                    .filter((id) => todayData.articles.some((a) => a.id === id))
                    .map((id) => {
                      const a = todayData.articles.find((art) => art.id === id)!;
                      return (
                        <li key={id}>
                          <Link href={`/today/${id}`}>{a.title_ko || a.title}</Link>
                          {" · "}<a href={a.source_url} target="_blank" rel="noopener noreferrer">원문 ↗</a>
                        </li>
                      );
                    })}
                </ul>
              </section>
            )}

            {newsEditorial.story && (
              <section id="story" style={{ marginTop: "44px", paddingTop: "32px", borderTop: "1px solid var(--line)" }}>
                <div className="section-head">
                  <div>
                    <h2 style={{ fontSize: "1.25rem", margin: "0 0 4px" }}>장기 이슈 타임라인 (수동 시범)</h2>
                    <p className="section-note" style={{ margin: 0 }}>
                      여러 날짜에 걸친 공식 발표를 원문과 대조해 시간순으로 정리했습니다. 사실 기록과 작성자의 해석을 구분합니다.
                    </p>
                  </div>
                </div>
                <h3 style={{ margin: "14px 0 6px" }}>{newsEditorial.story.title}</h3>
                <p style={{ fontSize: "0.92rem", lineHeight: "1.7", color: "#374151" }}>{newsEditorial.story.introduction}</p>
                <ol style={{ margin: "14px 0", paddingLeft: "20px", display: "grid", gap: "10px" }}>
                  {newsEditorial.story.entries.map((entry) => {
                    const a = todayData.articles.find((art) => art.id === entry.article_id);
                    return (
                      <li key={`${entry.date}-${entry.article_id}`}>
                        <strong>{entry.date}</strong> — {entry.fact}
                        {a && <> (<Link href={`/today/${entry.article_id}`}>기사 메모</Link>{" · "}<a href={a.source_url} target="_blank" rel="noopener noreferrer">원문 ↗</a>)</>}
                      </li>
                    );
                  })}
                </ol>
                <h3 style={{ margin: "14px 0 6px" }}>해석</h3>
                <p style={{ fontSize: "0.92rem", lineHeight: "1.7", color: "#374151" }}>{newsEditorial.story.interpretation}</p>
                <p className="section-note">검토: {newsEditorial.story.reviewed_by} · {formatKstTime(newsEditorial.story.reviewed_at)}</p>
              </section>
            )}
          </div>

          <footer className="home-foot" style={{ marginTop: "48px" }}>
            <span>공개본 수집 시각: {collected_at ? formatKstTime(collected_at) : "아직 공개본 없음"}</span>
            <span>시각은 KST 기준 · 날짜만 확인된 기사는 출처 날짜 유지 · 이전 수집 기사 보관</span>
          </footer>
        </div>

        <aside className="page-outline">
          <p>이 페이지에서</p>
          <nav aria-label="페이지 목차">
            <a href="#overview">개요</a>
            {hasArticles && <a href="#articles">뉴스 목록</a>}
            <a href="#updates">수집 및 점검 상태</a>
            {newsEditorial.weekly && <a href="#weekly">주간 회고 (시범)</a>}
            {newsEditorial.story && <a href="#story">장기 이슈 타임라인</a>}
            <a href="/feed.xml">RSS 구독</a>
          </nav>
        </aside>
      </div>
    </>
  );
}
