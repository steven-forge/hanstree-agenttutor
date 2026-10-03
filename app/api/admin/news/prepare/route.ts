import { NextResponse } from "next/server";
import { AdminError, equalSecret, getEdition, putEdition } from "../../../../lib/card-news/server";
import { collectEdition } from "../../../../lib/card-news/collect";
import { kstDate, selectableCandidates } from "../../../../lib/card-news/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.CARD_NEWS_CRON_SECRET;
  if (!secret || secret.length < 32 || !equalSecret(request.headers.get("authorization") || "", `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  try {
    const date = kstDate(), old = await getEdition(date);
    if (old && old.status !== "draft") return NextResponse.json({ status: "preserved", message: "검토·발행 중인 원고를 보존했습니다." });
    const edition = await putEdition(await collectEdition(date, old), old?.revision || 0);
    const count = selectableCandidates(edition).length;
    const enough = count >= 10;
    return NextResponse.json({ date, status: enough ? "candidates_ready" : "insufficient", candidates: count, collectedAt: edition.collectedAt, message: enough ? "후보가 준비됐습니다. 관리자 선정과 원고 검토가 필요합니다." : "후보가 10개 미만입니다. 뉴스레터 공개 기사와 수집 상태를 확인해 주세요." }, { status: enough ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AdminError ? error.message : "아침 후보 수집 실패" }, { status: error instanceof AdminError ? error.status : 503 }); }
}
