import { NextResponse } from "next/server";
import { AdminError, readBody, requireAdmin, requireSameOrigin } from "../../../../lib/card-news/server";
import { fetchArticleHtml, ArticleFetchError } from "../../../../lib/card-news/article-fetch";
import { extractArticle, ArticleExtractionError } from "../../../../lib/card-news/article-extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdmin();
    const input = await readBody(request);
    if (!input || typeof input.sourceUrl !== "string") throw new AdminError("원문 URL을 입력해 주세요.");
    const page = await fetchArticleHtml(input.sourceUrl);
    return NextResponse.json({ article: extractArticle(page.html, page.url) }, { headers });
  } catch (error) {
    const known = error instanceof ArticleFetchError || error instanceof ArticleExtractionError;
    return NextResponse.json({ error: error instanceof AdminError || known ? error.message : "원문을 읽지 못했습니다. 잠시 후 다시 시도하거나 직접 입력해 주세요." }, { status: error instanceof AdminError ? error.status : known ? 422 : 503, headers });
  }
}
