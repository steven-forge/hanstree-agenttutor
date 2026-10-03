import { NextResponse } from "next/server";
import { AdminError, getEdition, login, logout, putEdition, readBody, requireAdmin, requireSameOrigin, snapshot, validDate } from "../../../lib/card-news/server";
import { collectEdition, canonicalUrl } from "../../../lib/card-news/collect";
import { editionIssues, kstDate, MAX_CANDIDATES, type Edition, type NewsCandidate, type NewsCard } from "../../../lib/card-news/types";
import { renderBundle, renderCard } from "../../../lib/card-news/render";
import { instagramAccount, publishEdition, reconcileEdition } from "../../../lib/card-news/instagram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };
function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers }); }
function failure(error: unknown) { return json({ error: error instanceof AdminError ? error.message : "처리를 완료하지 못했습니다. 저장 상태를 확인한 뒤 다시 시도해 주세요." }, error instanceof AdminError ? error.status : 500); }
function str(value: unknown, max: number, label: string) { if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new AdminError(`${label} 입력을 확인해 주세요.`); return value.trim(); }
function parseCandidates(input: unknown): NewsCandidate[] {
  if (!Array.isArray(input) || input.length > MAX_CANDIDATES) throw new AdminError("후보 목록은 1,000개까지 저장할 수 있습니다.");
  return input.map(c => {
    if (!c || typeof c !== "object") throw new AdminError("후보 형식을 확인하세요.");
    const url = canonicalUrl(c.sourceUrl); if (!url) throw new AdminError("원문 주소는 https 주소를 입력하세요.");
    return { id: str(c.id, 100, "후보 번호"), title: str(c.title, 200, "후보 제목"), summary: str(c.summary, 600, "요약"), sourceName: str(c.sourceName, 100, "출처"), sourceUrl: url, publishedAt: str(c.publishedAt, 40, "발행일"), datePrecision: c.datePrecision === "time" ? "time" : "day", origin: "manual" };
  });
}
function editedEdition(old: Edition, body: Record<string, unknown>): Edition {
  if (!["draft", "approved"].includes(old.status)) throw new AdminError("발행이 시작된 원고는 수정할 수 없습니다.", 409);
  if (!Array.isArray(body.cards) || body.cards.length > 10) throw new AdminError("카드는 최대 10장입니다.");
  const inputCandidates = body.candidates === undefined ? old.candidates : parseCandidates(body.candidates);
  const candidates = inputCandidates.map(c => old.candidates.find(existing => existing.id === c.id) || c);
  if (new Set(candidates.map(c => c.id)).size !== candidates.length) throw new AdminError("후보 번호가 중복됐습니다.");
  const cards: NewsCard[] = body.cards.map(c => {
    if (!c || typeof c !== "object") throw new AdminError("카드 형식을 확인하세요.");
    const card: NewsCard = { candidateId: str(c.candidateId, 100, "후보 번호"), title: str(c.title, 180, "제목"), body: str(c.body, 600, "본문"), sourceUrl: canonicalUrl(c.sourceUrl), sourceName: str(c.sourceName, 100, "출처"), publishedAt: str(c.publishedAt, 40, "발행시각"), verified: c.verified === true };
    if (!candidates.some(n => n.id === card.candidateId)) throw new AdminError("선택한 뉴스의 후보 기록이 없습니다.");
    if (!card.sourceUrl) throw new AdminError("https 원문 주소를 입력하세요.");
    return card;
  });
  return { ...old, candidates, cards, caption: str(body.caption, 5000, "캡션"), status: "draft", approvedAt: undefined, publication: undefined };
}
function ready(edition: Edition) {
  const issues = editionIssues(edition); if (issues.length) throw new AdminError(issues[0]);
  const titles = edition.cards.map(c => c.title.replace(/\s+/g, "").toLowerCase());
  if (new Set(titles).size !== titles.length) throw new AdminError("같은 제목의 뉴스가 중복됐습니다.");
  for (const card of edition.cards) {
    const stamp = Date.parse(card.publishedAt);
    if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(card.publishedAt) || !Number.isFinite(stamp) || stamp < Date.parse(edition.windowStart) || stamp > Math.min(Date.parse(edition.windowEnd), Date.now())) throw new AdminError("모든 뉴스의 정확한 발행시각을 이번 수집 기간 안에서 확인해 주세요.");
  }
}
export async function GET(request: Request) {
  try {
    await requireAdmin();
    if (new URL(request.url).searchParams.get("session") === "1") return json({ authenticated: true });
    const params = new URL(request.url).searchParams, date = validDate(params.get("date") || kstDate());
    if (params.has("image") || params.get("download") === "zip") {
      const edition = await getEdition(date); if (!edition) throw new AdminError("저장된 원고가 없습니다.", 404);
      if (params.has("revision") && Number(params.get("revision")) !== edition.revision) throw new AdminError("원고가 변경됐습니다. 새로고침해 주세요.", 409);
      if (params.get("download") === "zip") {
        ready(edition);
        if (edition.status === "draft") throw new AdminError("검토를 완료한 뒤 전체 카드를 내려받으세요.", 409);
        return new Response(new Uint8Array(await renderBundle(edition)), { headers: { ...headers, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="AgentTutor_AI_News10_${date}.zip"` } });
      }
      const index = Number(params.get("image"));
      if (!Number.isInteger(index) || index < 0 || index >= edition.cards.length) throw new AdminError("카드 번호를 확인하세요.", 404);
      return new Response(new Uint8Array(await renderCard(edition.cards[index])), { headers: { ...headers, "Content-Type": "image/jpeg" } });
    }
    return json(await snapshot(date));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readBody(request);
    if (!body || typeof body !== "object") throw new AdminError("요청 형식을 확인하세요.");
    if (body.action === "login") { await login(body.password); return json({ ok: true }); }
    if (body.action === "logout") { await logout(); return json({ ok: true }); }
    await requireAdmin();
    if (body.action === "check_connection") return json(await instagramAccount());
    const date = validDate(body.date);
    const old = await getEdition(date);
    if (!Number.isInteger(body.revision) || body.revision !== (old?.revision || 0)) throw new AdminError("원고가 변경됐습니다. 새로고침해 주세요.", 409);
    if (body.action === "collect") await putEdition(await collectEdition(date, old), body.revision);
    else {
      if (!old) throw new AdminError("먼저 뉴스 후보를 수집해 주세요.", 404);
      switch (body.action) {
        case "save": await putEdition(editedEdition(old, body), old.revision); break;
        case "approve": {
          if (old.status !== "draft") throw new AdminError("검토할 초안이 없습니다.", 409);
          ready(old);
          // Generate every actual JPG before accepting the review, so broken fonts/content never reach publishing.
          for (const card of old.cards) await renderCard(card);
          await putEdition({ ...old, status: "approved", approvedAt: new Date().toISOString() }, old.revision); break;
        }
        case "publish": if (body.confirm !== true) throw new AdminError("최종 발행 확인이 필요합니다."); ready(old); await publishEdition(old, body.accountId); break;
        case "reconcile": await reconcileEdition(old); break;
        default: throw new AdminError("지원하지 않는 작업입니다.");
      }
    }
    return json(await snapshot(date));
  } catch (error) { return failure(error); }
}
