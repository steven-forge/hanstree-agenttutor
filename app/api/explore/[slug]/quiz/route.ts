import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac } from "node:crypto";
import rawExplore from "../../../../../data/explore.json";
import rawQuizzes from "../../../../../data/explore-quizzes.json";
import { gradeQuiz, isValidAnswerShape, answerFingerprint, buildReview } from "../../../../explore/quizLogic.mjs";
import { redisEval, isRedisConfigured, getRedisConfig } from "./upstash.mjs";

export const dynamic = "force-dynamic";

type QuizQuestion = { text: string; options: string[]; answer: number; explanation: string };
type QuizzesFile = { quizzes: Record<string, { version: number; questions: QuizQuestion[] }> };

const quizzesFile = rawQuizzes as unknown as QuizzesFile;
const exploreSlugs = new Set((rawExplore as unknown as { docs: { slug: string }[] }).docs.map((d) => d.slug));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4096;
const PAGE_LIMIT = 20;

function keys(slug: string, version: number) {
  const base = `agenttutor:explore:quiz:${slug}:v${version}`;
  return { attempt: (uuid: string) => `${base}:attempt:${uuid}`, history: `${base}:history`, stats: `${base}:stats` };
}

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

async function checkRateLimit(req: NextRequest): Promise<boolean> {
  const config = getRedisConfig();
  if (!config) return true; // no storage, nothing to rate-limit against
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const digest = createHmac("sha256", config.token).update(ip).digest("hex");
  const key = `agenttutor:explore:quiz:ratelimit:${digest}`;
  try {
    const count = await redisEval(
      "local c = redis.call('INCR', KEYS[1]) if c == 1 then redis.call('EXPIRE', KEYS[1], 60) end return c",
      [key],
      []
    );
    return Number(count) <= 10;
  } catch {
    return true; // ponytail: best-effort limit; add platform-level protection if abuse grows.
  }
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

const HISTORY_READ_SCRIPT = `
  local statsHash = redis.call('HGETALL', KEYS[1])
  local rows
  if ARGV[1] == '' then
    rows = redis.call('ZREVRANGEBYSCORE', KEYS[2], '+inf', '-inf', 'LIMIT', 0, ARGV[2])
  else
    rows = redis.call('ZREVRANGEBYSCORE', KEYS[2], '(' .. ARGV[1], '-inf', 'LIMIT', 0, ARGV[2])
  end
  return {statsHash, rows}
`;

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const quiz = quizzesFile.quizzes[slug];
  if (!exploreSlugs.has(slug) || !quiz) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const searchParams = req.nextUrl.searchParams;
  const versionParam = searchParams.get("version");
  const cursorParam = searchParams.get("cursor");
  const version = versionParam ? Number(versionParam) : quiz.version;

  if (versionParam !== null && versionParam !== String(quiz.version)) {
    return NextResponse.json({ error: "invalid_version" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  let cursor = "";
  if (cursorParam !== null) {
    const cursorNum = Number(cursorParam);
    if (!/^[1-9]\d*$/.test(cursorParam) || !Number.isSafeInteger(cursorNum)) {
      return NextResponse.json({ error: "invalid_cursor" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    cursor = String(cursorNum);
  }

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const { history, stats } = keys(slug, version);

  try {
    // Native Redis arrays preserve empty lists; Lua cjson would turn them into {}.
    const [statsHash, rows] = await redisEval(
      HISTORY_READ_SCRIPT, [stats, history], [cursor, String(PAGE_LIMIT + 1)]
    ) as [string[], string[]];

    const statsMap: Record<string, string> = {};
    for (let i = 0; i < statsHash.length; i += 2) statsMap[statsHash[i]] = statsHash[i + 1];
    const attempts = Number(statsMap.attempts || 0);
    const sumScore = Number(statsMap.sumScore || 0);
    const best = Number(statsMap.best || 0);
    const average = attempts > 0 ? Math.round(sumScore / attempts) : 0;

    const parsedRows = rows.map((entry) => JSON.parse(entry));
    const pageRows = parsedRows.slice(0, PAGE_LIMIT);
    const nextCursor = parsedRows.length > PAGE_LIMIT ? pageRows[pageRows.length - 1].seq : null;

    const parsedHistory = pageRows.map((item) => ({
      publicId: item.publicId,
      correct: item.correct,
      total: item.total,
      score: item.score,
      timestamp: item.timestamp,
      timestampKst: formatKst(item.timestamp)
    }));

    return NextResponse.json(
      {
        version,
        attempts,
        average,
        best,
        nextCursor,
        history: parsedHistory
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
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
  const { uuid, version, answers } = parsedBody;

  if (typeof uuid !== "string" || !UUID_RE.test(uuid)) {
    return NextResponse.json({ error: "invalid_uuid" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (!Number.isInteger(version) || version !== quiz.version) {
    return NextResponse.json({ error: "stale_version" }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  if (!isValidAnswerShape(answers, questions.length)) {
    return NextResponse.json({ error: "invalid_answers" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const withinLimit = await checkRateLimit(req);
  if (!withinLimit) {
    return NextResponse.json(
      { error: "rate_limited", message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  // score/date supplied by any client are never trusted; grading is always recomputed server-side.
  const grade = gradeQuiz(questions, answers as number[]);
  const review = buildReview(questions, answers as number[]);
  const fingerprint = createHash("sha256").update(answerFingerprint(uuid, version as number, answers as number[])).digest("hex");
  const candidateTimestamp = Date.now();
  const candidatePublicId = createHash("sha256").update(uuid.toLowerCase()).digest("hex").slice(0, 16);

  if (!isRedisConfigured()) {
    return NextResponse.json({
      saved: false,
      submissionId: uuid,
      publicId: candidatePublicId,
      correct: grade.correct,
      total: grade.total,
      score: grade.score,
      timestamp: candidateTimestamp,
      timestampKst: formatKst(candidateTimestamp),
      review,
      message: "공유 기록 저장이 아직 준비되지 않았습니다."
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const { attempt, history, stats } = keys(slug, version as number);
  const script = `
    local existing = redis.call('GET', KEYS[1])
    if existing then
      local decoded = cjson.decode(existing)
      if decoded.fingerprint == ARGV[1] then
        return existing
      else
        return cjson.encode({conflict=true})
      end
    end
    local seq = redis.call('HINCRBY', KEYS[3], 'attempts', 1)
    local record = cjson.encode({fingerprint=ARGV[1], correct=tonumber(ARGV[2]), total=tonumber(ARGV[3]), score=tonumber(ARGV[4]), timestamp=tonumber(ARGV[5]), publicId=ARGV[6], seq=seq})
    redis.call('SET', KEYS[1], record)
    local historyEntry = cjson.encode({publicId=ARGV[6], correct=tonumber(ARGV[2]), total=tonumber(ARGV[3]), score=tonumber(ARGV[4]), timestamp=tonumber(ARGV[5]), seq=seq})
    redis.call('ZADD', KEYS[2], seq, historyEntry)
    redis.call('HINCRBY', KEYS[3], 'sumScore', tonumber(ARGV[4]))
    local best = redis.call('HGET', KEYS[3], 'best')
    if not best or tonumber(ARGV[4]) > tonumber(best) then
      redis.call('HSET', KEYS[3], 'best', ARGV[4])
    end
    return record
  `;

  try {
    const result = await redisEval(
      script,
      [attempt(uuid), history, stats],
      [fingerprint, String(grade.correct), String(grade.total), String(grade.score), String(candidateTimestamp), candidatePublicId]
    );
    const parsed = JSON.parse(result as string);

    if (parsed.conflict) {
      return NextResponse.json(
        { error: "submission_conflict", message: "이미 다른 답안으로 제출된 번호입니다. 새로고침 후 다시 응시해 주세요." },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json({
      saved: true,
      submissionId: uuid,
      publicId: parsed.publicId,
      correct: parsed.correct,
      total: parsed.total,
      score: parsed.score,
      timestamp: parsed.timestamp,
      timestampKst: formatKst(parsed.timestamp),
      review
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      saved: "unknown",
      submissionId: uuid,
      publicId: candidatePublicId,
      correct: grade.correct,
      total: grade.total,
      score: grade.score,
      timestamp: candidateTimestamp,
      timestampKst: formatKst(candidateTimestamp),
      review,
      message: "저장 확인에 실패했습니다. 같은 제출 번호로 다시 시도할 수 있습니다."
    }, { headers: { "Cache-Control": "no-store" } });
  }
}
