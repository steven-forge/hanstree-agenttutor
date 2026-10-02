import { NextRequest, NextResponse } from "next/server";
import rawExplore from "../../../../../data/explore.json";
import rawQuizzes from "../../../../../data/explore-quizzes.json";
import {
  gradeQuiz,
  isValidAnswerShape,
  buildReview,
  isValidQuestionIndex,
  isValidSingleAnswer,
  gradeSingle
} from "../../../../explore/quizLogic.mjs";

export const dynamic = "force-dynamic";

type QuizQuestion = { text: string; options: string[]; answer: number; explanation: string };
type QuizzesFile = { quizzes: Record<string, { version: number; questions: QuizQuestion[] }> };

const quizzesFile = rawQuizzes as unknown as QuizzesFile;
const exploreSlugs = new Set((rawExplore as unknown as { docs: { slug: string }[] }).docs.map((d) => d.slug));
const MAX_BODY_BYTES = 4096;

function isSameOrigin(req: NextRequest): boolean {
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true; // no Origin header: not a cross-site fetch/form context
  // NextURL normalizes loopback addresses; Host preserves the browser's actual target.
  const host = req.headers.get("host") || req.nextUrl.host;
  try {
    return origin === new URL(`${req.nextUrl.protocol}//${host}`).origin;
  } catch {
    return false;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readLimitedBody(
  req: NextRequest
): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "payload_too_large" };
  }
  const reader = req.body?.getReader();
  if (!reader) return { ok: false, status: 400, error: "invalid_json" };
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, status: 413, error: "payload_too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
  return { ok: true, text: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8") };
}

function formatKst(timestampMs: number): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(timestampMs));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const quiz = quizzesFile.quizzes[slug];
  if (!exploreSlugs.has(slug) || !quiz) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "cross_site_blocked" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const contentType = req.headers.get("content-type") || "";
  if (contentType.split(";")[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "invalid_content_type" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const bodyResult = await readLimitedBody(req);
  if (!bodyResult.ok) {
    return NextResponse.json({ error: bodyResult.error }, { status: bodyResult.status, headers: { "Cache-Control": "no-store" } });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(bodyResult.text);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (!isPlainObject(parsedBody)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const questions = quiz.questions;
  const { version, answers, questionIndex, answer } = parsedBody;

  if (!Number.isInteger(version) || version !== quiz.version) {
    return NextResponse.json({ error: "stale_version" }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }

  const hasAnswers = Object.prototype.hasOwnProperty.call(parsedBody, "answers");
  const hasQuestionIndex = Object.prototype.hasOwnProperty.call(parsedBody, "questionIndex");
  const hasAnswer = Object.prototype.hasOwnProperty.call(parsedBody, "answer");

  // Reject bodies that mix full-quiz and single-question fields.
  if (hasAnswers && (hasQuestionIndex || hasAnswer)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  if (hasQuestionIndex || hasAnswer) {
    if (!hasQuestionIndex || !hasAnswer || !isValidQuestionIndex(questionIndex, questions.length) || !isValidSingleAnswer(answer)) {
      return NextResponse.json({ error: "invalid_answers" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    // Correct option/explanation are only included when the selection is correct.
    const singleGrade = gradeSingle(questions[questionIndex as number], answer as number);
    return NextResponse.json(
      { questionIndex, ...singleGrade },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!isValidAnswerShape(answers, questions.length)) {
    return NextResponse.json({ error: "invalid_answers" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  // score/date supplied by any client are never trusted; grading is always recomputed server-side.
  const grade = gradeQuiz(questions, answers as number[]);
  const review = buildReview(questions, answers as number[]);
  const timestamp = Date.now();

  return NextResponse.json(
    {
      correct: grade.correct,
      total: grade.total,
      score: grade.score,
      timestamp,
      timestampKst: formatKst(timestamp),
      review
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
