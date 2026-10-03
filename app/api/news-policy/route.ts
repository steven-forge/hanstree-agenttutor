import { NextResponse } from "next/server";
import { getNewsPolicy } from "../../lib/news-policy-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };
// Public read-only collection rules contain no credentials, drafts, or administrator data.
export async function GET() {
  try { return NextResponse.json(await getNewsPolicy(), { headers }); }
  catch { return NextResponse.json({ error: "뉴스레터 기준을 가져오지 못했습니다." }, { status: 503, headers }); }
}
