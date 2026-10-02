import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import {
  toPublicQuestions,
  isValidAnswerShape,
  gradeQuiz,
  buildReview,
  isValidQuestionIndex,
  isValidSingleAnswer,
  gradeSingle
} from "../app/explore/quizLogic.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const explore = JSON.parse(readFileSync(join(here, "../data/explore.json"), "utf8"));
const quizFile = JSON.parse(readFileSync(join(here, "../data/explore-quizzes.json"), "utf8"));

const exploreSlugs = new Set(explore.docs.map((d) => d.slug));

for (const slug of exploreSlugs) {
  const quiz = quizFile.quizzes[slug];
  assert.ok(quiz && typeof quiz === "object", `${slug} 문서에 퀴즈가 필요합니다`);
  assert.ok(Number.isInteger(quiz.version) && quiz.version >= 1, `${slug} 퀴즈에 version(정수)이 필요합니다`);

  const questions = quiz.questions;
  assert.ok(Array.isArray(questions), `${slug} 문서에 퀴즈 문항 배열이 필요합니다`);
  assert.ok(questions.length >= 3 && questions.length <= 5, `${slug} 퀴즈는 3~5문항이어야 합니다`);

  const seenAnswerPositions = new Set();
  for (const q of questions) {
    assert.ok(q.text && q.text.trim() !== "", `${slug} 문항에 text가 필요합니다`);
    assert.ok(Array.isArray(q.options) && q.options.length === 4, `${slug} 문항은 선택지 4개가 필요합니다`);
    const trimmed = q.options.map((o) => String(o).trim());
    assert.ok(trimmed.every((o) => o !== ""), `${slug} 문항의 선택지는 비어 있을 수 없습니다`);
    assert.equal(new Set(trimmed).size, 4, `${slug} 문항의 선택지는 서로 달라야 합니다`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3, `${slug} 문항의 answer는 0~3 정수여야 합니다`);
    assert.ok(q.explanation && q.explanation.trim() !== "", `${slug} 문항에 explanation이 필요합니다`);
    seenAnswerPositions.add(q.answer);
  }
  assert.ok(seenAnswerPositions.size >= 3, `${slug} 퀴즈는 정답 위치가 다양해야 합니다(0~3 중 최소 3곳)`);
}

// toPublicQuestions strips answer/explanation
const sampleQuiz = quizFile.quizzes[[...exploreSlugs][0]];
const publicQuestions = toPublicQuestions(sampleQuiz.questions);
for (const q of publicQuestions) {
  assert.ok(!("answer" in q), "공개 문항에는 answer가 없어야 합니다");
  assert.ok(!("explanation" in q), "공개 문항에는 explanation이 없어야 합니다");
}

// answer shape validation
assert.equal(isValidAnswerShape([0, 1, 2, 3, 0], 5), true);
assert.equal(isValidAnswerShape([0, 1, 2], 5), false, "길이가 다르면 거부");
assert.equal(isValidAnswerShape([0, 1, 4, 3, 0], 5), false, "범위를 벗어나면 거부");
assert.equal(isValidAnswerShape(["0", 1, 2, 3, 0], 5), false, "정수가 아니면 거부");
assert.equal(isValidAnswerShape(0.5, 5), false, "분수/숫자가 아닌 값은 거부");
assert.equal(isValidAnswerShape(null, 5), false, "null은 거부");
assert.equal(isValidAnswerShape("0,1,2,3,0", 5), false, "문자열은 거부");

// grading: perfect, zero, and mixed scores for every quiz
for (const slug of exploreSlugs) {
  const questions = quizFile.quizzes[slug].questions;
  const perfectAnswers = questions.map((q) => q.answer);
  const allWrong = questions.map((q) => (q.answer + 1) % 4);
  const mixedAnswers = questions.map((q, i) => (i % 2 === 0 ? q.answer : (q.answer + 1) % 4));

  assert.deepEqual(gradeQuiz(questions, perfectAnswers), { correct: questions.length, total: questions.length, score: 100 });
  assert.equal(gradeQuiz(questions, allWrong).correct, 0);
  const mixedGrade = gradeQuiz(questions, mixedAnswers);
  assert.ok(mixedGrade.correct > 0 && mixedGrade.correct < questions.length, `${slug} 혼합 채점은 일부만 맞아야 합니다`);

  const review = buildReview(questions, perfectAnswers);
  assert.ok(review.every((r) => r.isCorrect), `${slug} 정답으로 채점하면 모두 맞아야 합니다`);
}

// individual question grading: non-disclosure on wrong, retry wrong -> correct, index/answer validation
for (const slug of exploreSlugs) {
  const questions = quizFile.quizzes[slug].questions;
  const q = questions[0];
  const wrongAnswer = (q.answer + 1) % 4;

  const wrongResult = gradeSingle(q, wrongAnswer);
  assert.equal(wrongResult.isCorrect, false);
  assert.ok(!("explanation" in wrongResult), `${slug} 오답에는 해설이 포함되면 안 됩니다`);

  const correctResult = gradeSingle(q, q.answer);
  assert.equal(correctResult.isCorrect, true);
  assert.equal(correctResult.explanation, q.explanation, `${slug} 정답에는 해설이 포함돼야 합니다`);

  // retry: wrong then correct on the same question, independently graded
  assert.equal(gradeSingle(q, wrongAnswer).isCorrect, false);
  assert.equal(gradeSingle(q, q.answer).isCorrect, true);

  assert.equal(isValidQuestionIndex(0, questions.length), true);
  assert.equal(isValidQuestionIndex(questions.length, questions.length), false, "범위를 벗어난 인덱스는 거부");
  assert.equal(isValidQuestionIndex(-1, questions.length), false, "음수 인덱스는 거부");
  assert.equal(isValidQuestionIndex(1.5, questions.length), false, "정수가 아니면 거부");
  assert.equal(isValidQuestionIndex("0", questions.length), false, "문자열 인덱스는 거부");

  assert.equal(isValidSingleAnswer(0), true);
  assert.equal(isValidSingleAnswer(3), true);
  assert.equal(isValidSingleAnswer(4), false, "범위를 벗어난 답은 거부");
  assert.equal(isValidSingleAnswer(-1), false, "음수 답은 거부");
  assert.equal(isValidSingleAnswer(1.5), false, "정수가 아니면 거부");
}

console.log("check-explore-quiz: OK");

// Optional HTTP check against a local server. Never submit check records anywhere persistent;
// the API is stateless so there is nothing to disable before running this.
if (process.argv[2]) {
  const base = new URL(process.argv[2]);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "HTTP 점검은 로컬 서버에서만 실행합니다");
  const endpoint = new URL("/api/explore/decisions-api/quiz", base);
  assert.equal((await fetch(endpoint)).status, 405, "GET은 더 이상 지원하지 않습니다");
  for (const [slug, quiz] of Object.entries(quizFile.quizzes)) {
    for (const kind of ["perfect", "wrong", "mixed"]) {
      const answers = quiz.questions.map((q, i) => kind === "perfect" || (kind === "mixed" && i % 2 === 0) ? q.answer : (q.answer + 1) % 4);
      const response = await fetch(new URL(`/api/explore/${slug}/quiz`, base), {
        method: "POST", headers: { "Content-Type": "application/json", Origin: base.origin },
        body: JSON.stringify({ version: quiz.version, answers, score: 999, timestamp: 0 })
      });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.ok(!("uuid" in result), "응답에 uuid가 없어야 합니다");
      assert.ok(!("saved" in result), "응답에 saved가 없어야 합니다");
      assert.ok(!("publicId" in result), "응답에 publicId가 없어야 합니다");
      assert.ok(!("fingerprint" in result), "응답에 fingerprint가 없어야 합니다");
      assert.equal(result.score, gradeQuiz(quiz.questions, answers).score);
      assert.equal(result.correct, gradeQuiz(quiz.questions, answers).correct);
      assert.equal(result.review.length, quiz.questions.length);
      assert.ok(result.timestamp > Date.now() - 60000 && result.timestamp <= Date.now());
      assert.ok(result.timestampKst && result.timestampKst.trim() !== "");
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  }
  // Individual-question grading mode: retry wrong -> correct, non-disclosure, invalid shapes, mixed mode, stale version.
  const decisionsQuiz = quizFile.quizzes["decisions-api"];
  const decisionsEndpoint = new URL("/api/explore/decisions-api/quiz", base);
  const q0 = decisionsQuiz.questions[0];
  const wrongAnswer = (q0.answer + 1) % 4;

  const postIndividual = (body) =>
    fetch(decisionsEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base.origin },
      body: JSON.stringify(body)
    });

  const wrongRes = await postIndividual({ version: decisionsQuiz.version, questionIndex: 0, answer: wrongAnswer });
  assert.equal(wrongRes.status, 200);
  const wrongBody = await wrongRes.json();
  assert.equal(wrongBody.isCorrect, false);
  assert.ok(!("explanation" in wrongBody), "오답 응답에는 해설이 없어야 합니다");

  // Retry immediately with the correct answer after a wrong selection.
  const correctRes = await postIndividual({ version: decisionsQuiz.version, questionIndex: 0, answer: q0.answer });
  assert.equal(correctRes.status, 200);
  const correctBody = await correctRes.json();
  assert.equal(correctBody.isCorrect, true);
  assert.equal(correctBody.explanation, q0.explanation);

  for (const badBody of [
    { version: decisionsQuiz.version, questionIndex: -1, answer: 0 },
    { version: decisionsQuiz.version, questionIndex: decisionsQuiz.questions.length, answer: 0 },
    { version: decisionsQuiz.version, questionIndex: 0, answer: 4 },
    { version: decisionsQuiz.version, questionIndex: 0, answer: -1 },
    { version: decisionsQuiz.version, questionIndex: 0.5, answer: 0 },
    { version: decisionsQuiz.version, questionIndex: 0, answer: 1.5 },
    { version: decisionsQuiz.version, questionIndex: 0 }, // missing answer
    { version: decisionsQuiz.version, answer: 0 } // missing questionIndex
  ]) {
    assert.equal((await postIndividual(badBody)).status, 400, `잘못된 개별 채점 요청은 400이어야 합니다: ${JSON.stringify(badBody)}`);
  }

  // Mixed mode (both full-quiz and individual fields) must be rejected.
  assert.equal(
    (await postIndividual({
      version: decisionsQuiz.version,
      answers: decisionsQuiz.questions.map((q) => q.answer),
      questionIndex: 0,
      answer: 0
    })).status,
    400
  );

  // Stale version applies to individual mode too.
  assert.equal(
    (await postIndividual({ version: decisionsQuiz.version + 1, questionIndex: 0, answer: 0 })).status,
    409
  );

  const valid = { version: quizFile.quizzes["decisions-api"].version, answers: [0, 0, 0, 0, 0] };
  const invalidBodies = ["null", "[]", "42", "{", JSON.stringify({ ...valid, answers: [0] }), JSON.stringify({ ...valid, answers: [0, 1.5, 2, 3, 0] })];
  for (const body of invalidBodies) {
    assert.equal((await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body })).status, 400);
  }
  for (const [headers, body, status] of [
    [{ Origin: "https://example.invalid" }, valid, 403],
    [{ "Sec-Fetch-Site": "cross-site" }, valid, 403],
    [{}, { ...valid, version: valid.version + 1 }, 409],
    [{ "Content-Type": "application/json-fake" }, valid, 400]
  ]) {
    assert.equal((await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) })).status, status);
  }
  const oversizedStream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("가".repeat(2000))); controller.close(); } });
  assert.equal((await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: oversizedStream, duplex: "half" })).status, 413);
  console.log("check-explore-quiz HTTP: OK (stateless)");
}
