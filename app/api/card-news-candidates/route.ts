import { NextResponse } from "next/server";
import { collectEdition } from "../../lib/card-news/collect";
import { kstDate } from "../../lib/card-news/types";
import { validDate, AdminError, requireAdmin } from "../../lib/card-news/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const date = validDate(new URL(request.url).searchParams.get("date") || kstDate());
    const age = Date.parse(kstDate()) - Date.parse(date);
    if (age < -86400000) throw new AdminError("뉴스레터 불러오기는 다음 날 판본까지만 지원합니다.");
    return NextResponse.json({ edition: await collectEdition(date, null) }, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Robots-Tag": "noindex" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AdminError ? error.message : "뉴스레터를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요." }, { status: error instanceof AdminError ? error.status : 503, headers: { "Cache-Control": "no-store" } }); }
}
