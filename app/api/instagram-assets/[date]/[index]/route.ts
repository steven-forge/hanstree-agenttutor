import { equalSecret, getEdition, signAsset, validEditionKey } from "../../../../lib/card-news/server";
import { renderCard } from "../../../../lib/card-news/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ date: string; index: string }> }) {
  try {
    const params = await context.params, key = validEditionKey(params.date), index = Number(params.index);
    const query = new URL(request.url).searchParams, attempt = query.get("attempt") || "", signature = query.get("signature") || "", expires = Number(query.get("expires"));
    const now = Date.now() / 1000;
    if (!Number.isInteger(index) || index < 0 || index > 9 || !Number.isInteger(expires) || expires < now || expires > now + 86400 || !/^[a-f0-9-]{36}$/.test(attempt) || !/^[a-f0-9]{64}$/.test(signature) || !equalSecret(signature, signAsset(key, attempt, index, expires))) throw 0;
    const edition = await getEdition(key);
    if (!edition || !["publishing", "needs_check", "published"].includes(edition.status) || edition.publication?.attempt !== attempt || !edition.cards[index]) throw 0;
    return new Response(new Uint8Array(await renderCard(edition.cards[index], edition.explore ? "AI Explore" : "AI News 10")), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
