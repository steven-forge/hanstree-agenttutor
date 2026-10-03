import { NextResponse } from "next/server";
import { AdminError, readBody, requireAdmin, requireSameOrigin } from "../../../lib/card-news/server";
import { getNewsPolicy, policyStorageConfigured, saveNewsPolicy } from "../../../lib/news-policy-store";
import collection from "../../../../data/today-candidates.json";
import { todayData } from "../../../content";
import { articleDateKey, RELEASE_SOURCE_IDS } from "../../../today/newsHelpers";
import { kstDate } from "../../../lib/card-news/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });
function failure(error: unknown) { return json({ error: error instanceof AdminError ? error.message : "기준을 확인하지 못했습니다. 다시 불러와 저장 상태를 확인해 주세요." }, error instanceof AdminError ? error.status : 500); }
async function snapshot() {
  const runs = collection as { official_run?: { policy_revision?: number; collected_at?: string }; hourly_run?: { policy_revision?: number; collected_at?: string } };
  const date = kstDate();
  return {
    policy: await getNewsPolicy(), storageConfigured: policyStorageConfigured(),
    applied: { officialRevision: runs.official_run?.policy_revision ?? null, externalRevision: runs.hourly_run?.policy_revision ?? null, officialAt: runs.official_run?.collected_at ?? null, externalAt: runs.hourly_run?.collected_at ?? null },
    daily: { date, count: todayData.articles.filter(a => !RELEASE_SOURCE_IDS.has(a.source_id) && articleDateKey(a) === date).length },
  };
}
export async function GET() { try { await requireAdmin(); return json(await snapshot()); } catch (error) { return failure(error); } }
export async function POST(request: Request) {
  try { requireSameOrigin(request); await requireAdmin(); const body = await readBody(request); const policy = await saveNewsPolicy(body); return json({ policy, storageConfigured: true }); }
  catch (error) { return failure(error); }
}
