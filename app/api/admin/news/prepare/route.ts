import { NextResponse } from "next/server";
import { AdminError, equalSecret } from "../../../../lib/card-news/server";
import { runAutomation } from "../../../../lib/card-news/automation";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const secret = process.env.CARD_NEWS_CRON_SECRET;
  if (!secret || secret.length < 32 || !equalSecret(request.headers.get("authorization") || "", `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  try {
    const view = await runAutomation();
    return NextResponse.json({ enabled: view.settings.enabled, run: view.run, nextPrepareAt: view.nextPrepareAt, nextPublishAt: view.nextPublishAt }, { status: (view.settings.enabled || view.run?.testRequested) && view.run?.phase === "failed" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AdminError ? error.message : "아침 후보 수집 실패" }, { status: error instanceof AdminError ? error.status : 503 }); }
}
