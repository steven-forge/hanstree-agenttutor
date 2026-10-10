import "server-only";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { zipSync, strToU8 } from "fflate";
import { editionKey, type Edition, type NewsCard } from "./types";
import { cardIssues } from "./types";
import { CARD_COLORS, CARD_LAYOUT, CARD_SOURCE, cardBodyTop, cardSourceLines, cardFontSize } from "./copy";
import { AdminError } from "./server";
import { renderWebtoonImage } from "./webtoon";

let fontPromise: Promise<Buffer[]> | undefined;
const fonts = () => fontPromise ||= Promise.all(["NotoSansKR-Regular.ttf", "NotoSansKR-Medium.ttf", "NotoSansKR-Bold.ttf", "NotoSansKR-ExtraBold.ttf"].map(f => readFile(path.join(process.cwd(), "public/fonts", f))));
export async function renderCard(card: NewsCard, series: "AI News 10" | "AI Explore" = "AI News 10"): Promise<Buffer> {
  const issues = cardIssues({ ...card, verified: true }).filter(s => !s.includes("주소"));
  if (issues.length) throw new AdminError(issues[0]);
  if (card.image) return renderWebtoonImage(card.image);
  const [regular, medium, bold, extra] = await fonts();
  const L = CARD_LAYOUT, line = (height: number) => ({ display: "flex", height, whiteSpace: "pre" } as const);
  const png = new ImageResponse(
    <div style={{ width: L.width, height: L.height, background: CARD_COLORS.dark, display: "flex", position: "relative", fontFamily: "CardGothic", fontWeight: 400 }}>
      <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: L.width, height: L.split, background: CARD_COLORS.lime }} />
      <div style={{ display: "flex", position: "absolute", left: L.left, top: L.headerTop, height: L.headerLineHeight, fontSize: L.seriesSize, lineHeight: `${L.headerLineHeight}px`, color: CARD_COLORS.dark, fontWeight: 700 }}>{series}</div>
      {/* Satori does not synthesize italic; skew the Medium face by Chrome's faux-italic angle (14deg). */}
      <div style={{ display: "flex", position: "absolute", right: L.width - L.left - L.contentWidth, top: L.headerTop, height: L.headerLineHeight, fontSize: L.brandSize, lineHeight: `${L.headerLineHeight}px`, color: CARD_COLORS.dark, fontWeight: 500, transform: "skewX(-14deg)" }}>AgentTutor</div>
      <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: L.left, top: L.titleTop, width: L.contentWidth, fontSize: cardFontSize(card.title, L.titleSize), fontWeight: 800, lineHeight: `${L.titleLineHeight}px`, color: CARD_COLORS.dark }}>
        {card.title.split("\n").map((text, i) => <div key={i} style={line(L.titleLineHeight)}>{text || " "}</div>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: L.left, top: cardBodyTop(card.title), width: L.contentWidth, fontSize: cardFontSize(card.body, L.bodySize), lineHeight: `${L.bodyLineHeight}px`, color: CARD_COLORS.body }}>
        {card.body.split("\n").map((text, i) => <div key={i} style={line(L.bodyLineHeight)}>{text || " "}</div>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: CARD_SOURCE.left, top: CARD_SOURCE.top, width: CARD_SOURCE.width, fontSize: cardFontSize(cardSourceLines(card).join("\n"), CARD_SOURCE.fontSize), lineHeight: `${CARD_SOURCE.lineHeight}px`, color: CARD_SOURCE.color }}>
        {cardSourceLines(card).map((text, i) => <div key={i} style={line(CARD_SOURCE.lineHeight)}>{text}</div>)}
      </div>
    </div>,
    { width: L.width, height: L.height, fonts: [{ name: "CardGothic", data: regular, style: "normal", weight: 400 }, { name: "CardGothic", data: medium, style: "normal", weight: 500 }, { name: "CardGothic", data: bold, style: "normal", weight: 700 }, { name: "CardGothic", data: extra, style: "normal", weight: 800 }], headers: { "Cache-Control": "private, no-store" } },
  );
  return sharp(Buffer.from(await png.arrayBuffer())).flatten({ background: CARD_COLORS.dark }).jpeg({ quality: 96, chromaSubsampling: "4:4:4" }).toBuffer();
}
export async function renderBundle(edition: Edition) {
  const files: Record<string, Uint8Array> = {};
  // Sequential rendering bounds native image/font memory.
  for (let i = 0; i < edition.cards.length; i++) files[`AgentTutor_AI_${edition.explore ? "Explore" : "News10"}_${editionKey(edition)}_${String(i + 1).padStart(2, "0")}.jpg`] = await renderCard(edition.cards[i], edition.explore ? "AI Explore" : "AI News 10");
  files["caption.txt"] = strToU8(edition.caption);
  files["sources.txt"] = strToU8(edition.cards.map((c, i) => `${i + 1}. ${c.title.replace(/\n/g, " ")}\n${c.sourceName}\n${c.publishedAt}\n${c.sourceUrl}`).join("\n\n"));
  return zipSync(files, { level: 0 });
}
