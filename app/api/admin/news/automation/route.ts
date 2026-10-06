import { NextResponse } from "next/server";
import { AdminError, readBody, requireAdmin, requireSameOrigin } from "../../../../lib/card-news/server";
import { automationView, cancelAutomationTest, runAutomation, saveAutomationSettings } from "../../../../lib/card-news/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };
const failure = (error: unknown) => NextResponse.json({ error: error instanceof AdminError ? error.message : "자동 제작·발행 상태를 확인하지 못했습니다. 잠시 후 다시 시도하세요." }, { status: error instanceof AdminError ? error.status : 503, headers });
export async function GET() {
  try { await requireAdmin(); return NextResponse.json(await automationView(), { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request); await requireAdmin();
    const body = await readBody(request);
    if (!body || typeof body !== "object") throw new AdminError("요청을 확인하세요.");
    let result;
    switch (body.action) {
      case "save": result = await saveAutomationSettings(body.settings); break;
      case "prepare": result = await runAutomation("prepare"); break;
      case "test": if (body.confirm !== true) throw new AdminError("실제 Instagram 발행 테스트에 동의해야 합니다."); result = await runAutomation("test"); break;
      case "cancel_test": result = await cancelAutomationTest(); break;
      default: throw new AdminError("지원하지 않는 예약 요청입니다.");
    }
    return NextResponse.json(result, { headers });
  } catch (error) { return failure(error); }
}
