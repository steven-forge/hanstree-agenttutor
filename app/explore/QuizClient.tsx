"use client";

import { useEffect, useRef, useState } from "react";

type PublicQuestion = { text: string; options: string[] };

type ReviewItem = { selected: number; correct: number; isCorrect: boolean; explanation: string };

type GradeResult = {
  saved: boolean | "unknown";
  submissionId: string;
  publicId: string;
  correct: number;
  total: number;
  score: number;
  timestamp: number;
  timestampKst: string;
  review: ReviewItem[];
  message?: string;
};

type HistoryItem = { publicId: string; correct: number; total: number; score: number; timestamp: number; timestampKst: string };

type DashboardState = {
  attempts: number;
  average: number;
  best: number;
  nextCursor: number | null;
  history: HistoryItem[];
};

export default function QuizClient({ slug, version, questions }: { slug: string; version: number; questions: PublicQuestion[] }) {
  const total = questions.length;
  const [answers, setAnswers] = useState<(number | null)[]>(Array(total).fill(null));
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submittedAnswers, setSubmittedAnswers] = useState<number[] | null>(null);
  const [phase, setPhase] = useState<"answering" | "submitting" | "result" | "error">("answering");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<"retry" | "stale" | null>(null);
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const firstQuestionRef = useRef<HTMLInputElement | null>(null);
  const inFlightRef = useRef(false);
  const dashboardRequestRef = useRef(0);

  const answeredCount = answers.filter((a) => a !== null).length;
  const allAnswered = answeredCount === total;

  useEffect(() => {
    if (phase === "result" && resultRef.current) resultRef.current.focus();
  }, [phase]);

  async function loadDashboard(cursor: number | null) {
    const requestId = ++dashboardRequestRef.current;
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const url = cursor === null
        ? `/api/explore/${slug}/quiz?version=${version}`
        : `/api/explore/${slug}/quiz?version=${version}&cursor=${cursor}`;
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (requestId !== dashboardRequestRef.current) return;
      if (res.status === 503) {
        setDashboardError("공유 기록 대시보드를 지금은 불러올 수 없습니다.");
        return;
      }
      if (!res.ok) throw new Error("dashboard_failed");
      const data = await res.json();
      if (requestId !== dashboardRequestRef.current) return;
      setDashboard((prev) => ({
        attempts: data.attempts,
        average: data.average,
        best: data.best,
        nextCursor: data.nextCursor,
        history: cursor === null ? data.history : [...(prev?.history ?? []), ...data.history]
      }));
    } catch {
      if (requestId === dashboardRequestRef.current) {
        setDashboardError("공유 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      if (requestId === dashboardRequestRef.current) setDashboardLoading(false);
    }
  }

  async function submit() {
    if (inFlightRef.current || phase === "submitting") return;
    let uuid = submissionId;
    let snapshot = submittedAnswers;
    if (uuid === null) {
      if (!allAnswered) return;
      uuid = crypto.randomUUID();
      snapshot = [...(answers as number[])];
      setSubmissionId(uuid);
      setSubmittedAnswers(snapshot);
    }
    inFlightRef.current = true;
    setPhase("submitting");
    setErrorMessage(null);
    setErrorKind(null);
    try {
      const res = await fetch(`/api/explore/${slug}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, version, answers: snapshot }),
        signal: AbortSignal.timeout(15000)
      });
      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        setPhase("error");
        if (data?.error === "stale_version") {
          setErrorKind("stale");
          setErrorMessage("퀴즈 내용이 업데이트되었습니다. 페이지를 새로고침한 뒤 다시 응시해 주세요.");
        } else {
          setErrorKind("retry");
          setErrorMessage("이미 다른 답안으로 제출된 번호입니다. '새로 응시하기'로 다시 시작해 주세요.");
        }
        return;
      }
      if (res.status === 429) {
        const data = await res.json().catch(() => null);
        setPhase("error");
        setErrorKind("retry");
        setErrorMessage(data?.message || "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (!res.ok) {
        setPhase("error");
        setErrorKind("retry");
        setErrorMessage("채점 요청이 실패했습니다. 같은 답안으로 다시 시도할 수 있습니다.");
        return;
      }
      const data: GradeResult = await res.json();
      setResult(data);
      setPhase("result");
      loadDashboard(null);
    } catch {
      setPhase("error");
      setErrorKind("retry");
      setErrorMessage("네트워크 오류로 채점 결과를 확인하지 못했습니다. 같은 답안으로 다시 시도할 수 있습니다.");
    } finally {
      inFlightRef.current = false;
    }
  }

  function retry() {
    submit();
  }

  function retake() {
    if (inFlightRef.current) return;
    setAnswers(Array(total).fill(null));
    setSubmissionId(null);
    setSubmittedAnswers(null);
    setPhase("answering");
    setResult(null);
    setErrorMessage(null);
    setErrorKind(null);
    setDashboard(null);
    setDashboardError(null);
    setDashboardLoading(false);
    dashboardRequestRef.current += 1;
    requestAnimationFrame(() => firstQuestionRef.current?.focus());
  }

  const locked = submissionId !== null;
  const hasResult = result !== null;

  return (
    <div>
      {!hasResult && (
        <>
          <p className="quiz-progress" aria-live="polite">
            답변 완료 {answeredCount}/{total}
          </p>
          <p className="quiz-dashboard-note">제출하면 이름 없이 점수와 제출 시각이 다른 방문자에게 공개됩니다.</p>
          <div className="quiz-questions">
            {questions.map((q, qIdx) => (
              <fieldset key={qIdx} className="quiz-question" disabled={phase === "submitting" || locked}>
                <legend>
                  {qIdx + 1}. {q.text}
                </legend>
                <div className="quiz-options">
                  {q.options.map((option, oIdx) => (
                    <label key={oIdx} className="quiz-option">
                      <input
                        ref={qIdx === 0 && oIdx === 0 ? firstQuestionRef : undefined}
                        type="radio"
                        name={`quiz-${slug}-${qIdx}`}
                        value={oIdx}
                        checked={answers[qIdx] === oIdx}
                        onChange={() => {
                          const next = [...answers];
                          next[qIdx] = oIdx;
                          setAnswers(next);
                        }}
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <button type="button" className="quiz-submit" onClick={submit} disabled={!allAnswered || phase === "submitting" || locked}>
            {phase === "submitting" ? "채점 중..." : "제출하고 결과 보기"}
          </button>

          {phase === "error" && errorMessage && (
            <div className="quiz-error" role="alert" aria-live="assertive">
              <p>{errorMessage}</p>
              {errorKind === "stale" ? (
                <button type="button" onClick={() => window.location.reload()}>페이지 새로고침</button>
              ) : (
                <>
                  <button type="button" onClick={retry}>다시 시도</button>
                  <button type="button" onClick={retake}>새로 응시하기</button>
                </>
              )}
            </div>
          )}
        </>
      )}

      {hasResult && result && (
        <div className="quiz-result" tabIndex={-1} ref={resultRef} aria-live="polite">
          <div className="quiz-score-card">
            <strong>{result.score}점</strong>
            <span>({result.correct}/{result.total} 정답)</span>
            <span className="quiz-timestamp">제출 시각 · {result.timestampKst} (KST)</span>
            <span className="quiz-submission-id">익명 제출 번호 · {result.publicId}</span>
          </div>

          {(result.saved === false || result.saved === "unknown") && (
            <div className="quiz-save-note" role="status">
              <p>{result.message}</p>
              {errorKind === "stale" ? (
                <button type="button" onClick={() => window.location.reload()}>페이지 새로고침</button>
              ) : (
                <button type="button" onClick={retry} disabled={phase === "submitting"}>
                  {phase === "submitting" ? "다시 시도 중..." : "저장 다시 시도"}
                </button>
              )}
              {phase === "error" && errorMessage && (
                <p role="alert" aria-live="assertive">{errorMessage}</p>
              )}
            </div>
          )}

          <div className="quiz-review">
            {questions.map((q, qIdx) => {
              const item = result.review[qIdx];
              return (
                <div key={qIdx} className={`quiz-review-item ${item.isCorrect ? "quiz-review-correct" : "quiz-review-wrong"}`}>
                  <p className="quiz-review-question">{qIdx + 1}. {q.text}</p>
                  <p className="quiz-review-status">{item.isCorrect ? "[정답]" : "[오답]"} 선택한 답: {q.options[item.selected]}</p>
                  {!item.isCorrect && <p>정답: {q.options[item.correct]}</p>}
                  <p className="quiz-review-explanation">{item.explanation}</p>
                </div>
              );
            })}
          </div>

          <button type="button" className="quiz-retake" onClick={retake} disabled={phase === "submitting"}>
            새로 응시하기
          </button>

            <div className="quiz-dashboard">
              <h3>공유 기록 대시보드</h3>
              <p className="quiz-dashboard-note">같은 문항의 전체 응시 기록입니다 · 재응시 포함 · 한국 시간(KST) · 이름·로그인 정보 없음</p>
              <button type="button" onClick={() => loadDashboard(null)} disabled={dashboardLoading}>
                {dashboardLoading ? "불러오는 중..." : "기록 새로고침"}
              </button>
              {dashboardLoading && !dashboard && <p aria-live="polite">불러오는 중...</p>}
              {dashboardError && (
                <div role="alert">
                  <p>{dashboardError}</p>
                </div>
              )}
              {dashboard && (
                <>
                  <div className="quiz-dashboard-stats">
                    <span>총 응시 {dashboard.attempts}회</span>
                    <span>평균 {dashboard.average}점</span>
                    <span>최고 {dashboard.best}점</span>
                  </div>
                  {dashboard.history.length === 0 ? (
                    <p>아직 기록이 없습니다.</p>
                  ) : (
                    <ul className="quiz-history-list">
                      {dashboard.history.map((item) => (
                        <li key={item.publicId}>
                          <span>{item.timestampKst}</span>
                          <span>{item.score}점 ({item.correct}/{item.total})</span>
                          <span className="quiz-history-id">#{item.publicId}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {dashboard.nextCursor !== null && (
                    <button type="button" onClick={() => loadDashboard(dashboard.nextCursor)} disabled={dashboardLoading}>
                      {dashboardLoading ? "불러오는 중..." : "이전 기록 더 보기"}
                    </button>
                  )}
                </>
              )}
            </div>
        </div>
      )}
    </div>
  );
}
