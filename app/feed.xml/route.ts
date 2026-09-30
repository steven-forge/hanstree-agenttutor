import { todayData } from "../content";
import { RELEASE_SOURCE_IDS, SITE_URL, escapeXml, toRfc822, truncate } from "../today/newsHelpers";

export const dynamic = "force-static";

const SUMMARY_MAX = 500;
const FEED_SIZE = 50;

export async function GET() {
  const articles = (todayData.articles || [])
    .filter((a) => !RELEASE_SOURCE_IDS.has(a.source_id))
    .slice(0, FEED_SIZE);

  const items = articles
    .map((a) => {
      const title = escapeXml(a.title_ko || a.title);
      const summary = escapeXml(
        truncate(a.summary || a.source_summary_ko || a.source_summary || "", SUMMARY_MAX)
      );
      const link = escapeXml(a.source_url);
      const guid = `${SITE_URL}/today/${escapeXml(a.id)}`;
      const pubDate = a.date_precision === "time" ? toRfc822(a.published_at) : null;
      return [
        "    <item>",
        `      <title>${title}</title>`,
        `      <link>${link}</link>`,
        `      <guid isPermaLink="false">${guid}</guid>`,
        pubDate ? `      <pubDate>${pubDate}</pubDate>` : null,
        `      <description>${summary}</description>`,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AgentTutor 뉴스레터</title>
    <link>${SITE_URL}/today</link>
    <description>공개 뉴스 최신 50건 (archive는 더 이전 기사도 보관하며, 이 피드는 최신 50건만 포함)</description>
    <language>ko-KR</language>
${items}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
