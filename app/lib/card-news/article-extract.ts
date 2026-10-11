import "server-only";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { exactPublishedTime } from "./manual";

export type ExtractedArticle = {
  title: string; body: string; sourceName: string; sourceUrl: string; publishedAt: string;
  language?: string;
};
export class ArticleExtractionError extends Error {}

// Parse inert HTML only. Return plain text; never mount fetched markup in the app.
export function extractArticle(html: string, sourceUrl: string): ExtractedArticle {
  const { document } = parseHTML(html);
  Object.defineProperty(document, "documentURI", { value: sourceUrl });
  const language = document.documentElement.getAttribute("lang")?.trim().toLowerCase().replace(/_/g, "-");
  const meta = (selector: string) => document.querySelector(selector)?.getAttribute("content")?.trim() || "";
  const sourceName = meta('meta[property="og:site_name"]') || new URL(sourceUrl).hostname.replace(/^www\./, "");
  const date = meta('meta[property="article:published_time"]') || meta('meta[name="datePublished"]') || meta('meta[itemprop="datePublished"]') || document.querySelector("time[datetime]")?.getAttribute("datetime") || "";
  if (document.getElementsByTagName("*").length > 20000) throw new ArticleExtractionError("페이지 구조가 너무 큽니다. 제목과 내용을 직접 입력해 주세요.");
  // Some publishers render recommendation cards as article-like paragraphs.
  // Remove only a separately headed recommendation section, never its parent article.
  document.querySelectorAll("h2, h3").forEach(heading => {
    const label = (heading.textContent || "").replace(/\s+/g, " ").trim();
    if (!/^(?:related (?:content|articles|posts|stories)|you may also like|관련\s*(?:기사|콘텐츠)|추천\s*기사|함께\s*볼\s*기사)$/i.test(label)) return;
    const section = heading.closest('section, aside, [role="complementary"]');
    if (section && section.querySelector("h1, h2, h3") === heading && !section.querySelector("article")) section.remove();
  });
  // TechCrunch author cards sit inside the story and would be scored as body text.
  document.querySelectorAll(".wp-block-tc23-author-card, .wp-block-tc23-author-card-bio").forEach(element => element.remove());
  const article = new Readability(document as unknown as Document, { charThreshold: 80, maxElemsToParse: 20000 }).parse();
  const title = article?.title?.replace(/\s+/g, " ").trim() || "";
  if (!article?.content || !title || /^(just a moment|access denied|attention required|captcha)/i.test(title)) throw new ArticleExtractionError("원문에서 기사 제목과 본문을 찾지 못했습니다. 주소를 확인하거나 직접 입력해 주세요.");
  const content = parseHTML(`<html><body>${article.content}</body></html>`).document.body;
  content.querySelectorAll("script, style, iframe, object, embed, noscript, template, nav, footer, aside, form, button, h1, h2, h3, h4, h5, h6, [hidden], [aria-hidden=true]").forEach(element => element.remove());
  const body = content.innerText.replace(/\r/g, "").replace(/[\t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (body.length < 40) throw new ArticleExtractionError("읽을 수 있는 기사 본문이 부족합니다. 로그인이나 화면 실행이 필요한 페이지는 직접 입력해 주세요.");
  if (title.length > 2000 || body.length > 50000 || sourceName.length > 500) throw new ArticleExtractionError("가져올 원문이 너무 깁니다. 필요한 내용을 직접 정리해 입력해 주세요.");
  const published = article.publishedTime || date;
  const stamp = exactPublishedTime(published);
  return { title, body, sourceName, sourceUrl, publishedAt: Number.isFinite(stamp) ? new Date(stamp).toISOString() : "", ...(language && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(language) ? { language } : {}) };
}
