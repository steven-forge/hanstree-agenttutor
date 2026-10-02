"use client";

import { useRef, useState } from "react";

type PublicQuestion = { text: string; options: string[] };

type SummaryResult = { correct: number; total: number; score: number; timestampKst: string };

type QuestionFeedback =
  | { status: "idle" }
  | { status: "grading" }
  | { status: "correct"; explanation: string }
  | { status: "wrong" }
  | { status: "error"; message: string; stale?: boolean };

export default function QuizClient({ slug, version, questions }: { slug: string; version: number; questions: PublicQuestion[] }) {
  const total = questions.length;
  const [choices, setChoices] = useState<(number | null)[]>(Array(total).fill(null));
  const [firstAnswers, setFirstAnswers] = useState<(number | null)[]>(Array(total).fill(null));
  const [feedback, setFeedback] = useState<QuestionFeedback[]>(Array(total).fill({ status: "idle" }));
  const [staleVersion, setStaleVersion] = useState(false);
  const [summaryResult, setSummaryResult] = useState<SummaryResult | null>(null);
  const [summarySubmitting, setSummarySubmitting] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const firstQuestionRef = useRef<HTMLInputElement | null>(null);
  const questionInFlight = useRef<boolean[]>(Array(total).fill(false));
  const summaryInFlight = useRef(false);

  const answeredCount = firstAnswers.filter((a) => a !== null).length;
  const currentCorrectCount = feedback.filter((f) => f.status === "correct").length;
  const allFirstAnswered = answeredCount === total;

  async function gradeQuestion(qIdx: number, oIdx: number) {
    if (questionInFlight.current[qIdx] || staleVersion) return;
    questionInFlight.current[qIdx] = true;
    setFeedback((prev) => prev.map((f, i) => (i === qIdx ? { status: "grading" } : f)));
    try {
      const res = await fetch(`/api/explore/${slug}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, questionIndex: qIdx, answer: oIdx }),
        signal: AbortSignal.timeout(15000)
      });
      if (res.status === 409) {
        setStaleVersion(true);
        setFeedback((prev) =>
          prev.map((f, i) => (i === qIdx ? { status: "error", message: "퀴즈 내용이 업데이트되었습니다. 페이지를 새로고침해 주세요.", stale: true } : f))
        );
        return;
      }
      if (!res.ok) {
        setFeedback((prev) =>
          prev.map((f, i) => (i === qIdx ? { status: "error", message: "채점 요청이 실패했습니다. 다시 시도할 수 있습니다." } : f))
        );
        return;
      }
      const data: { isCorrect: boolean; explanation?: string } = await res.json();
      setFirstAnswers((prev) => (prev[qIdx] !== null ? prev : prev.map((a, i) => (i === qIdx ? oIdx : a))));
      setFeedback((prev) =>
        prev.map((f, i) =>
          i === qIdx
            ? data.isCorrect
              ? { status: "correct", explanation: data.explanation ?? "" }
              : { status: "wrong" }
            : f
        )
      );
    } catch {
      setFeedback((prev) =>
        prev.map((f, i) => (i === qIdx ? { status: "error", message: "네트워크 오류로 채점하지 못했습니다. 다시 시도할 수 있습니다." } : f))
      );
    } finally {
      questionInFlight.current[qIdx] = false;
    }
  }

  function selectOption(qIdx: number, oIdx: number) {
    if (questionInFlight.current[qIdx] || staleVersion) return;
    setChoices((prev) => prev.map((c, i) => (i === qIdx ? oIdx : c)));
    gradeQuestion(qIdx, oIdx);
  }

  async function submitSummary() {
    if (summaryInFlight.current || summarySubmitting || !allFirstAnswered || staleVersion) return;
    summaryInFlight.current = true;
    setSummarySubmitting(true);
    setSummaryError(null);
    try {
      const res = await fetch(`/api/explore/${slug}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, answers: firstAnswers }),
        signal: AbortSignal.timeout(15000)
      });
      if (res.status === 409) {
        setStaleVersion(true);
        setSummaryError("퀴즈 내용이 업데이트되었습니다. 페이지를 새로고침한 뒤 다시 응시해 주세요.");
        return;
      }
      if (!res.ok) {
        setSummaryError("채점 요청이 실패했습니다. 다시 시도할 수 있습니다.");
        return;
      }
      const data = await res.json();
      setSummaryResult({ correct: data.correct, total: data.total, score: data.score, timestampKst: data.timestampKst });
    } catch {
      setSummaryError("네트워크 오류로 채점 결과를 확인하지 못했습니다. 다시 시도할 수 있습니다.");
    } finally {
      summaryInFlight.current = false;
      setSummarySubmitting(false);
    }
  }

  function retake() {
    if (questionInFlight.current.some(Boolean) || summaryInFlight.current) return;
    setChoices(Array(total).fill(null));
    setFirstAnswers(Array(total).fill(null));
    setFeedback(Array(total).fill({ status: "idle" }));
    setStaleVersion(false);
    setSummaryResult(null);
    setSummaryError(null);
    questionInFlight.current = Array(total).fill(false);
    requestAnimationFrame(() => firstQuestionRef.current?.focus());
  }

  return (
    <div>
      <p className="quiz-progress" aria-live="polite">
        답변 완료 {answeredCount}/{total} · 현재 맞힌 문항 {currentCorrectCount}/{total}
      </p>
      <p className="quiz-note">점수는 각 문항에서 처음 채점된 답으로 계산합니다. 오답을 다시 골라도 첫 선택 기준 점수는 바뀌지 않습니다.</p>
      <p className="quiz-note">응시 기록은 저장하지 않습니다. 결과는 현재 화면에서만 확인할 수 있습니다. (채점을 위해 답안은 서버로 일시적으로 전송됩니다)</p>

      {staleVersion && (
        <div className="quiz-error" role="alert" aria-live="assertive">
          <p>퀴즈 내용이 업데이트되었습니다. 페이지를 새로고침한 뒤 다시 응시해 주세요.</p>
          <button type="button" onClick={() => window.location.reload()}>페이지 새로고침</button>
        </div>
      )}

      <div className="quiz-questions">
        {questions.map((q, qIdx) => {
          const fb = feedback[qIdx];
          return (
            <fieldset key={qIdx} className="quiz-question" aria-busy={fb.status === "grading"}>
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
                      checked={choices[qIdx] === oIdx}
                      disabled={staleVersion || fb.status === "grading"}
                      onChange={() => selectOption(qIdx, oIdx)}
                    />
                    {option}
                  </label>
                ))}
              </div>

              <div className="quiz-question-feedback" aria-live="polite">
                {fb.status === "grading" && <p className="quiz-feedback-grading">채점 중...</p>}
                {fb.status === "wrong" && <p className="quiz-feedback-wrong">오답입니다. 다른 보기를 다시 선택해 보세요.</p>}
                {fb.status === "correct" && (
                  <p className="quiz-feedback-correct">
                    정답입니다. {fb.explanation}
                  </p>
                )}
                {fb.status === "error" && (
                  <div className="quiz-error" role="alert" aria-live="assertive">
                    <p>{fb.message}</p>
                    {fb.stale ? (
                      <button type="button" onClick={() => window.location.reload()}>페이지 새로고침</button>
                    ) : (
                      choices[qIdx] !== null && (
                        <button type="button" onClick={() => gradeQuestion(qIdx, choices[qIdx] as number)}>다시 시도</button>
                      )
                    )}
                  </div>
                )}
              </div>
            </fieldset>
          );
        })}
      </div>

      {allFirstAnswered && !summaryResult && (
        <button
          type="button"
          className="quiz-submit"
          onClick={submitSummary}
          disabled={summarySubmitting || staleVersion}
        >
          {summarySubmitting ? "채점 중..." : "결과 보기"}
        </button>
      )}

      {summaryError && (
        <div className="quiz-error" role="alert" aria-live="assertive">
          <p>{summaryError}</p>
          {staleVersion ? (
            <button type="button" onClick={() => window.location.reload()}>페이지 새로고침</button>
          ) : (
            <button type="button" onClick={submitSummary} disabled={summarySubmitting}>다시 시도</button>
          )}
        </div>
      )}

      <div className="quiz-result" aria-live="polite">
        {summaryResult && (
          <div className="quiz-score-card">
            <strong>{summaryResult.score}점</strong>
            <span>({summaryResult.correct}/{summaryResult.total} 정답 · 첫 선택 기준 점수)</span>
            <span className="quiz-timestamp">제출 시각 · {summaryResult.timestampKst} (KST)</span>
          </div>
        )}
      </div>

      <button
        type="button"
        className="quiz-retake"
        onClick={retake}
        disabled={questionInFlight.current.some(Boolean) || summarySubmitting}
      >
        새로 응시하기
      </button>
    </div>
  );
}
