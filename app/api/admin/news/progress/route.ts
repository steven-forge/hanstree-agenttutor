import { NextResponse } from "next/server";
import { AdminError, getEdition, requireAdmin, validEditionKey } from "../../../../lib/card-news/server";
import { publicationRemoteStatus } from "../../../../lib/card-news/instagram";
import type { PublicationProgress } from "../../../../lib/card-news/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const edition = await getEdition(validEditionKey(params.get("date")));
    const remote = params.get("remote") === "1" && edition ? await publicationRemoteStatus(edition) : {};
    const progress: PublicationProgress = { edition, checkedAt: new Date().toISOString(), ...remote };
    return NextResponse.json(progress, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AdminError ? error.message : "발행 진행 상황을 불러오지 못했습니다. 잠시 후 다시 조회해 주세요." }, { status: error instanceof AdminError ? error.status : 503, headers });
  }
}
