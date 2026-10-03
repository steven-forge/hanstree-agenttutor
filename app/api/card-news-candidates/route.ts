import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { collectEdition } from "../../lib/card-news/collect";
import { kstDate } from "../../lib/card-news/types";
import { validDate, AdminError, requireAdmin } from "../../lib/card-news/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const collect = unstable_cache((date: string) => collectEdition(date, null), ["public-card-news-candidates-v1"], { revalidate: 900 });
// Cache public source data internally, but authenticate every request before reading it.
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const date = validDate(new URL(request.url).searchParams.get("date") || kstDate());
    const age = Date.parse(kstDate()) - Date.parse(date);
    if (age < -86400000 || age > 7 * 86400000) throw new AdminError("새 후보 수집은 최근 7일과 다음 날만 지원합니다. 저장된 이전 원고는 이력에서 열어 주세요.");
    return NextResponse.json({ edition: await collect(date) }, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Robots-Tag": "noindex" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AdminError ? error.message : "뉴스 수집에 실패했습니다. 잠시 뒤 다시 시도해 주세요." }, { status: error instanceof AdminError ? error.status : 503, headers: { "Cache-Control": "no-store" } }); }
}
