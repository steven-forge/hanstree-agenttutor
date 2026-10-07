import "server-only";
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import rawExplore from "../../../data/explore.json";
import { SITE_URL } from "../../today/newsHelpers";
import { AdminError, validDate } from "./server";
import type { Edition, NewsCandidate, NewsCard, WebtoonImage } from "./types";

type RegisteredImage = { src: string; alt: string; caption: string };
type Document = { slug: string; title: string; summary: string; created_at: string; updated_at?: string; diagram_image?: RegisteredImage; comparison?: { comparison_image?: RegisteredImage } };
const documents = (rawExplore as { docs: Document[] }).docs;
const sourceLimit = 20 * 1024 * 1024;

// Only bundled, author-registered PNGs are accepted. No user path or remote URL is read.
async function originalImage(src: string) {
  if (typeof src !== "string" || !/^\/explore\/[a-z0-9-]+-webtoon\.png$/.test(src) || !documents.some(doc => doc.diagram_image?.src === src || doc.comparison?.comparison_image?.src === src)) throw new AdminError("등록된 Explore 웹툰만 사용할 수 있습니다.");
  try {
    const root = path.resolve(process.cwd(), "public/explore");
    const filename = await realpath(path.join(root, path.basename(src)));
    if (!filename.startsWith(`${root}${path.sep}`)) throw new AdminError("등록된 Explore 웹툰만 사용할 수 있습니다.");
    const info = await stat(filename);
    if (!info.isFile() || info.size < 1 || info.size > sourceLimit) throw new AdminError("웹툰 원본 파일의 크기를 확인하세요.");
    const buffer = await readFile(filename);
    if (buffer.length > sourceLimit) throw new AdminError("웹툰 원본 파일의 크기를 확인하세요.");
    const metadata = await sharp(buffer, { limitInputPixels: 40000000 }).metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height || metadata.width > 10000 || metadata.height > 10000 || (metadata.pages || 1) !== 1) throw new AdminError("웹툰 원본의 이미지 형식을 확인하세요.");
    return { buffer, width: metadata.width, height: metadata.height, sha256: createHash("sha256").update(buffer).digest("hex") };
  } catch (error) {
    if (error instanceof AdminError) throw error;
    throw new AdminError("웹툰 원본을 읽지 못했습니다. 이미지 파일이 포함된 배포인지 확인하세요.", 503);
  }
}

export async function createWebtoonEdition(date: string, slug: string): Promise<Edition> {
  validDate(date);
  const doc = documents.find(item => item.slug === slug);
  if (!doc || !/^[a-z0-9-]{1,80}$/.test(slug)) throw new AdminError("Explore 문서를 찾지 못했습니다.");
  const day = validDate(doc.updated_at || doc.created_at);
  if (day > date || Date.parse(`${day}T00:00:00+09:00`) > Date.now()) throw new AdminError("문서의 기록 날짜 이후 판본을 선택하세요.");
  const originals = [
    { kind: "diagram", title: "설명 웹툰", image: doc.diagram_image },
    { kind: "comparison", title: "비교 웹툰", image: doc.comparison?.comparison_image },
  ].filter((item): item is { kind: string; title: string; image: RegisteredImage } => !!item.image);
  if (!originals.length) throw new AdminError("이 Explore 문서에는 등록된 웹툰이 없습니다.");
  const sourceUrl = `${SITE_URL}/explore/${doc.slug}`, sourceName = "AgentTutor · Explore";
  const candidates: NewsCandidate[] = [], cards: NewsCard[] = [];
  for (const item of originals) {
    if (typeof item.image.alt !== "string" || !item.image.alt.trim() || item.image.alt.length > 600) throw new AdminError("웹툰 원본 설명은 1~600자여야 합니다.");
    const original = await originalImage(item.image.src);
    const image: WebtoonImage = { src: item.image.src, alt: item.image.alt, width: original.width, height: original.height, sha256: original.sha256 };
    const id = `webtoon:${slug}:${item.kind}`;
    candidates.push({ id, title: item.title, summary: image.alt, sourceName, sourceUrl, publishedAt: day, datePrecision: "day", origin: "explore", image });
    cards.push({ candidateId: id, title: item.title, body: image.alt, sourceName, sourceUrl, publishedAt: day, verified: false, image });
  }
  const caption = [`AgentTutor Explore · ${doc.title}`, doc.summary, sourceUrl, ...originals.map(item => `${item.title} · ${item.image.caption}`)].join("\n\n");
  if (Array.from(caption).length > 2200) throw new AdminError("웹툰 설명이 Instagram 설명 길이를 넘습니다. 문서의 소개와 이미지 설명을 확인하세요.");
  const now = new Date().toISOString();
  return {
    id: `${date}~webtoon~${slug}`, date, explore: { slug, title: doc.title, format: "webtoon" }, revision: 0, status: "draft",
    windowStart: `${day}T00:00:00+09:00`, windowEnd: `${date}T23:59:59.999+09:00`, collectedAt: now, updatedAt: now,
    candidates, cards, caption, sources: [{ name: sourceName, status: "ok", count: cards.length }],
  };
}

export async function renderWebtoonImage(image: WebtoonImage): Promise<Buffer> {
  const original = await originalImage(image.src);
  if (original.sha256 !== image.sha256 || original.width !== image.width || original.height !== image.height) throw new AdminError("웹툰 원본이 초안 생성 이후 변경됐습니다. 기존 승인으로 발행할 수 없습니다. 다른 판본 날짜에서 웹툰을 불러오고 다시 검토하세요.", 409);
  try {
    // Preserve the whole image. White padding makes every export the same 4:5 ratio.
    const jpeg = await sharp(original.buffer, { limitInputPixels: 40000000 }).flatten({ background: "#fff" }).resize(1080, 1350, { fit: "contain", background: "#fff" }).toColourspace("srgb").jpeg({ quality: 96, chromaSubsampling: "4:4:4" }).toBuffer();
    if (jpeg.length >= 8000000) throw new AdminError("웹툰 JPG가 Instagram의 8MB 제한을 넘습니다.");
    return jpeg;
  } catch (error) {
    if (error instanceof AdminError) throw error;
    throw new AdminError("웹툰 JPG를 만들지 못했습니다. 원본 이미지 형식을 확인하세요.", 503);
  }
}
