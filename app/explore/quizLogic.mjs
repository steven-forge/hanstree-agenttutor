// 퀴즈 채점/검증 전용 순수 함수. 정답(answer)·해설(explanation)은 서버에서만 다룬다.
// 이 파일은 app/api/explore/[slug]/quiz/route.ts와 [slug]/page.tsx(서버)에서만 import한다.
// 클라이언트 컴포넌트에서 직접 import하면 answer/explanation이 번들에 포함되므로 금지.

/**
 * @param {{ text: string, options: string[], answer: number, explanation: string }[]} questions
 * @returns {{ text: string, options: string[] }[]}
 */
export function toPublicQuestions(questions) {
  return questions.map(({ text, options }) => ({ text, options }));
}

/**
 * @param {unknown} answers
 * @param {number} length
 * @returns {answers is number[]}
 */
export function isValidAnswerShape(answers, length) {
  return (
    Array.isArray(answers) &&
    answers.length === length &&
    answers.every((value) => Number.isInteger(value) && value >= 0 && value <= 3)
  );
}

/**
 * @param {{ answer: number }[]} questions
 * @param {number[]} answers
 * @returns {{ correct: number, total: number, score: number }}
 */
export function gradeQuiz(questions, answers) {
  const total = questions.length;
  let correct = 0;
  for (let i = 0; i < total; i += 1) {
    if (answers[i] === questions[i].answer) correct += 1;
  }
  const score = Math.round((correct / total) * 100);
  return { correct, total, score };
}

/**
 * @param {{ answer: number, explanation: string }[]} questions
 * @param {number[]} answers
 * @returns {{ selected: number, correct: number, isCorrect: boolean, explanation: string }[]}
 */
export function buildReview(questions, answers) {
  return questions.map((q, i) => ({
    selected: answers[i],
    correct: q.answer,
    isCorrect: answers[i] === q.answer,
    explanation: q.explanation
  }));
}

/**
 * @param {unknown} value
 * @param {number} length
 * @returns {value is number}
 */
export function isValidQuestionIndex(value, length) {
  return Number.isInteger(value) && value >= 0 && value < length;
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
export function isValidSingleAnswer(value) {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

/**
 * Grades one question without ever disclosing the correct option/explanation on a wrong answer.
 * @param {{ answer: number, explanation: string }} question
 * @param {number} answer
 * @returns {{ isCorrect: boolean, explanation?: string }}
 */
export function gradeSingle(question, answer) {
  const isCorrect = answer === question.answer;
  return isCorrect ? { isCorrect, explanation: question.explanation } : { isCorrect };
}
