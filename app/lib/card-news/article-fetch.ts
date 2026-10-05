import "server-only";
import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { Agent, request, type AgentOptions } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { createGunzip, createInflate, createBrotliDecompress } from "node:zlib";
import type { Transform } from "node:stream";

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
export class ArticleFetchError extends Error {
  constructor(message: string) { super(message); this.name = "ArticleFetchError"; }
}
const fail = (message: string) => new ArticleFetchError(message);
const timeoutError = () => fail("원문 응답 시간이 초과됐습니다. 잠시 후 다시 시도하거나 직접 입력하세요.");

// Conservative public-address boundary: mapped/translation/tunnel IPv6 never qualifies.
const blocked = new BlockList(), globalV6 = new BlockList();
for (const cidr of ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/3"]) {
  const [address, prefix] = cidr.split("/"); blocked.addSubnet(address, Number(prefix), "ipv4");
}
globalV6.addSubnet("2000::", 3, "ipv6");
for (const cidr of ["2001::/23", "2001:db8::/32", "2002::/16", "3fff::/20"]) {
  const [address, prefix] = cidr.split("/"); blocked.addSubnet(address, Number(prefix), "ipv6");
}
function publicAddress(item: LookupAddress): boolean {
  if (isIP(item.address) !== item.family || item.address.includes("%")) return false;
  return item.family === 4 ? !blocked.check(item.address, "ipv4") : item.family === 6 && globalV6.check(item.address, "ipv6") && !blocked.check(item.address, "ipv6");
}
function articleUrl(value: string): URL {
  if (typeof value !== "string" || !value || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value)) throw fail("공개된 https 원문 주소를 입력하세요.");
  let url: URL;
  try { url = new URL(value); } catch { throw fail("원문 주소 형식을 확인하세요."); }
  const host = url.hostname.toLowerCase(), labels = host.split(".");
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password || isIP(host) || host.length > 253 || labels.length < 2 || !/^[a-z]{2,63}$/.test(labels.at(-1)!) || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || /(?:^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home|test|invalid|example|onion)$/.test(host)) throw fail("로그인 정보가 없는 공개 https 원문 주소만 사용할 수 있습니다.");
  url.hash = "";
  return url;
}
async function publicLookup(host: string, signal: AbortSignal): Promise<LookupAddress[]> {
  const addresses = await new Promise<LookupAddress[]>((resolve, reject) => {
    if (signal.aborted) { reject(timeoutError()); return; }
    const abort = () => reject(timeoutError());
    signal.addEventListener("abort", abort, { once: true });
    lookup(host, { all: true, verbatim: true }).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
  if (!addresses.length || !addresses.every(publicAddress)) throw fail("내부망 또는 특수 주소로 연결되는 원문은 가져올 수 없습니다.");
  return addresses;
}
type PageResponse = { redirect: string } | { bytes: Buffer; contentType: string };
async function download(url: URL, addresses: LookupAddress[], signal: AbortSignal): Promise<PageResponse> {
  const pinned = addresses.find(item => item.family === 4) || addresses[0];
  const pinnedLookup: LookupFunction = (_host, options, callback) => {
    if (options.all) callback(null, [pinned]); else callback(null, pinned.address, pinned.family);
  };
  // A dedicated agent avoids shared sockets, cookies, TLS sessions and environment proxies.
  const agent = new Agent({ keepAlive: false, maxCachedSessions: 0, proxyEnv: {} } as AgentOptions & { proxyEnv: Record<string, string> });
  try {
    return await new Promise<PageResponse>((resolve, reject) => {
      let req: ClientRequest | undefined, response: IncomingMessage | undefined, decoder: Transform | undefined, settled = false;
      const finish = (error?: Error, result?: PageResponse) => {
        if (settled) return;
        settled = true;
        decoder?.destroy(); response?.destroy(); req?.destroy();
        if (error) reject(error); else resolve(result!);
      };
      req = request(url, { method: "GET", agent, lookup: pinnedLookup, family: pinned.family, servername: url.hostname, rejectUnauthorized: true, signal, maxHeaderSize: 16 * 1024,
        headers: { "User-Agent": "AgentTutor-Article-Reader/1.0", Accept: "text/html,application/xhtml+xml", "Accept-Encoding": "gzip, deflate, br", Connection: "close" },
      }, incoming => {
        response = incoming;
        incoming.on("error", error => finish(error));
        incoming.on("aborted", () => finish(fail("원문 전송이 중단됐습니다. 다시 시도하거나 직접 입력하세요.")));
        const status = incoming.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          if (!incoming.headers.location) { finish(fail("이동된 원문 주소를 확인하지 못했습니다.")); return; }
          finish(undefined, { redirect: incoming.headers.location }); return;
        }
        if (status < 200 || status >= 300) {
          finish(fail(status === 404 ? "원문 페이지를 찾지 못했습니다. 기사 주소를 확인해 주세요." : status === 429 ? "원문 사이트의 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요." : status === 401 || status === 403 ? "원문 사이트가 접근을 허용하지 않았습니다. 원문을 확인하고 직접 입력하세요." : "원문 사이트에서 오류가 발생했습니다. 잠시 후 다시 시도하거나 직접 입력하세요."));
          return;
        }
        const contentType = incoming.headers["content-type"] || "";
        if (!/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/i.test(contentType)) { finish(fail("HTML 기사 페이지만 가져올 수 있습니다.")); return; }
        if (Number(incoming.headers["content-length"]) > MAX_BYTES) { finish(fail("원문 용량이 너무 큽니다. 내용을 직접 입력하세요.")); return; }
        const encoding = (incoming.headers["content-encoding"] || "identity").trim().toLowerCase();
        if (encoding === "gzip") decoder = createGunzip();
        else if (encoding === "deflate") decoder = createInflate();
        else if (encoding === "br") decoder = createBrotliDecompress();
        else if (encoding !== "identity") { finish(fail("원문의 압축 형식을 지원하지 않습니다. 직접 입력하세요.")); return; }
        let received = 0, decoded = 0;
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => { received += chunk.length; if (received > MAX_BYTES) finish(fail("원문 용량이 너무 큽니다. 내용을 직접 입력하세요.")); });
        const body = decoder || incoming;
        body.on("error", error => finish(error));
        body.on("data", (chunk: Buffer) => {
          if (settled) return;
          decoded += chunk.length;
          if (decoded > MAX_BYTES) { finish(fail("원문 용량이 너무 큽니다. 내용을 직접 입력하세요.")); return; }
          chunks.push(chunk);
        });
        body.on("end", () => finish(undefined, { bytes: Buffer.concat(chunks), contentType }));
        if (decoder) incoming.pipe(decoder);
      });
      req.on("error", error => finish(error));
      req.end();
    });
  } finally { agent.destroy(); }
}

export async function fetchArticleHtml(value: string): Promise<{ html: string; url: string }> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let url = articleUrl(value);
    for (let hop = 0; hop <= 3; hop++) {
      const result = await download(url, await publicLookup(url.hostname, controller.signal), controller.signal);
      if ("redirect" in result) {
        if (hop === 3) throw fail("원문 주소 이동이 너무 많습니다. 최종 기사 주소를 입력하세요.");
        if (/[\s\\\u0000-\u001f\u007f]/.test(result.redirect)) throw fail("이동된 원문 주소 형식을 확인하세요.");
        url = articleUrl(new URL(result.redirect, url).href);
        continue;
      }
      if (controller.signal.aborted) throw timeoutError();
      const charset = result.contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] || result.bytes.subarray(0, 4096).toString("ascii").match(/<meta\b[^>]*charset\s*=\s*["']?([^\s;"'/>]+)/i)?.[1] || "utf-8";
      let html: string;
      try { html = new TextDecoder(charset).decode(result.bytes); } catch { throw fail("원문의 문자 형식을 지원하지 않습니다. 직접 입력하세요."); }
      if (!html.trim()) throw fail("원문에서 내용을 찾지 못했습니다. 직접 입력하세요.");
      return { html, url: url.href };
    }
    throw fail("원문 주소 이동이 너무 많습니다. 최종 기사 주소를 입력하세요.");
  } catch (error) {
    if (error instanceof ArticleFetchError) throw error;
    if (controller.signal.aborted) throw timeoutError();
    throw fail("원문에 연결하지 못했습니다. 잠시 후 다시 시도하거나 직접 입력하세요.");
  } finally { clearTimeout(timer); }
}
