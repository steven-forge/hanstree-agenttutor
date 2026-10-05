import "server-only";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { zipSync, strToU8 } from "fflate";
import type { Edition, NewsCard } from "./types";
import { cardIssues } from "./types";
import { CARD_SOURCE, cardBodyTop, cardSourceLines } from "./copy";
import { AdminError } from "./server";

let fontPromise: Promise<Buffer[]> | undefined;
const fonts = () => fontPromise ||= Promise.all(["NanumGothic-Bold.ttf", "Arimo-Bold.ttf", "Arimo-BoldItalic.ttf", "NanumGothic-ExtraBold.ttf"].map(f => readFile(path.join(process.cwd(), "public/fonts", f))));
export async function renderCard(card: NewsCard): Promise<Buffer> {
  const issues = cardIssues({ ...card, verified: true }).filter(s => !s.includes("주소"));
  if (issues.length) throw new AdminError(issues[0]);
  const [face, latin, italic, heavy] = await fonts();
  const png = new ImageResponse(
    <div style={{ width: 1080, height: 1350, background: "#000", color: "#CCFF00", display: "flex", position: "relative", fontFamily: "CardGothic", fontWeight: 700 }}>
      <div style={{ display: "flex", position: "absolute", left: 140, top: 128, width: 940, height: 132, background: "#CCFF00" }} />
      <div style={{ display: "flex", position: "absolute", left: 154, top: 130, fontFamily: "CardLatin", fontSize: 126, lineHeight: 1, letterSpacing: -8.19, color: "#111", fontWeight: 700 }}>AI News 10</div>
      <div style={{ display: "flex", position: "absolute", right: 56, top: 214, fontFamily: "CardLatin", fontSize: 32, lineHeight: 1, letterSpacing: -1.12, color: "#111", fontStyle: "italic", fontWeight: 700 }}>AgentTutor</div>
      <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: 140, top: 376, width: 870, fontSize: 54, fontWeight: 900, lineHeight: 1.5, letterSpacing: -2.43 }}>
        {card.title.split("\n").map((line, i) => <div key={i} style={{ display: "flex", height: 81, whiteSpace: "pre" }}>{line || " "}</div>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: 140, top: cardBodyTop(card.title) - 18, width: 870, fontSize: 48, lineHeight: 1.74, letterSpacing: -1.68 }}>
        {card.body.split("\n").map((line, i) => <div key={i} style={{ display: "flex", height: 83.52, whiteSpace: "pre" }}>{line || " "}</div>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: CARD_SOURCE.left, top: CARD_SOURCE.top, width: CARD_SOURCE.width, fontFamily: "CardGothic", fontWeight: 700, fontSize: CARD_SOURCE.fontSize, lineHeight: CARD_SOURCE.lineHeight / CARD_SOURCE.fontSize, letterSpacing: CARD_SOURCE.letterSpacing, color: CARD_SOURCE.color }}>
        {cardSourceLines(card).map((line, i) => <div key={i} style={{ display: "flex", height: CARD_SOURCE.lineHeight, whiteSpace: "pre" }}>{line}</div>)}
      </div>
    </div>,
    { width: 1080, height: 1350, fonts: [{ name: "CardGothic", data: face, style: "normal", weight: 700 }, { name: "CardGothic", data: heavy, style: "normal", weight: 900 }, { name: "CardLatin", data: latin, style: "normal", weight: 700 }, { name: "CardLatin", data: italic, style: "italic", weight: 700 }], headers: { "Cache-Control": "private, no-store" } },
  );
  return sharp(Buffer.from(await png.arrayBuffer())).flatten({ background: "#000" }).jpeg({ quality: 96, chromaSubsampling: "4:4:4" }).toBuffer();
}
export async function renderBundle(edition: Edition) {
  const files: Record<string, Uint8Array> = {};
  // Sequential rendering bounds native image/font memory.
  for (let i = 0; i < edition.cards.length; i++) files[`AgentTutor_AI_News10_${edition.date}_${String(i + 1).padStart(2, "0")}.jpg`] = await renderCard(edition.cards[i]);
  files["caption.txt"] = strToU8(edition.caption);
  files["sources.txt"] = strToU8(edition.cards.map((c, i) => `${i + 1}. ${c.title.replace(/\n/g, " ")}\n${c.sourceName}\n${c.publishedAt}\n${c.sourceUrl}`).join("\n\n"));
  return zipSync(files, { level: 0 });
}
