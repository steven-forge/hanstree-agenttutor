"use client";

import { useEffect, useRef, useState } from "react";

type PublicQuestion = { text: string; options: string[] };

type ReviewItem = { selected: number; correct: number; isCorrect: boolean; explanation: string };

type GradeResult = {
  correct: number;
  total: number;
  score: number;
  timestampKst: string;
  review: ReviewItem[];
};

export default function QuizClient({ slug, version, questions }: { slug: string; version: number; questions: PublicQuestion[] }) {
  const total = questions.length;
  const [answers, setAnswers] = useState<(number | null)[]>(Array(total).fill(null));
  const [result, setResult] = useState<GradeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [staleVersion, setStaleVersion] = useState(false);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const firstQuestionRef = useRef<HTMLInputElement | null>(null);
  const inFlightRef = useRef(false);

  const answeredCount = answers.filter((a) => a !== null).length;
  const allAnswered = answeredCount === total;

  useEffect(() => {
    if (result && resultRef.current) resultRef.current.focus();
  }, [result]);

  async function submit() {
    if (inFlightRef.current || submitting || !allAnswered) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setErrorMessage(null);
    setStaleVersion(false);
    try {
      const res = await fetch(`/api/explore/${slug}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, answers }),
        signal: AbortSignal.timeout(15000)
      });
      if (res.status === 409) {
        setStaleVersion(true);
        setErrorMessage("퀴즈 내용이 업데이트되었습니다. 페이지를 새로고침한 뒤 다시 응시해 주세요.");
        return;
      }
      if (!res.ok) {
        setErrorMessage("채점 요청이 실패했습니다. 다시 시도할 수 있습니다.");
        return;
      }
      const data: GradeResult = await res.json();
      setResult(data);
    } catch {
      setErrorMessage("네트워크 오류로 채점 결과를 확인하지 못했습니다. 다시 시도할 수 있습니다.");
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  }

  function retake() {
    if (inFlightRef.current) return;
    setAnswers(Array(total).fill(null));
    setResult(null);
    setErrorMessage(null);
    setStaleVersion(false);
    requestAnimationFrame(() => firstQuestionRef.current?.focus());
  }

  return (
    <div>
      {!result && (
        <>
          <p className="quiz-progress" aria-live="polite">
            답변 완료 {answeredCount}/{total}
          </p>
          <p className="quiz-note">응시 기록은 저장하지 않습니다. 결과는 현재 화면에서만 확인할 수 있습니다. (채점을 위해 답안은 서버로 일시적으로 전송됩니다)</p>
          <div className="quiz-questions">
            {questions.map((q, qIdx) => (
              <fieldset key={qIdx} className="quiz-question" disabled={submitting}>
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

          <button type="button" className="quiz-submit" onClick={submit} disabled={!allAnswered || submitting}>
            {submitting ? "채점 중..." : "제출하고 결과 보기"}
          </button>

          {errorMessage && (
            <div className="quiz-error" role="alert" aria-live="assertive">
              <p>{errorMessage}</p>
              {staleVersion ? (
                <button type="button" onClick={() => window.location.reload()}>페이지 새로고침</button>
              ) : (
                <button type="button" onClick={submit} disabled={submitting}>다시 시도</button>
              )}
            </div>
          )}
        </>
      )}

      {result && (
        <div className="quiz-result" tabIndex={-1} ref={resultRef} aria-live="polite">
          <div className="quiz-score-card">
            <strong>{result.score}점</strong>
            <span>({result.correct}/{result.total} 정답)</span>
            <span className="quiz-timestamp">제출 시각 · {result.timestampKst} (KST)</span>
          </div>

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

          <button type="button" className="quiz-retake" onClick={retake}>
            새로 응시하기
          </button>
        </div>
      )}
    </div>
  );
}
