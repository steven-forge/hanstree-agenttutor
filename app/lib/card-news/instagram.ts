import "server-only";
import { randomUUID } from "node:crypto";
import { AdminError, equalSecret, getEdition, putEdition, setupStatus, signAsset } from "./server";
import { editionIssues, type Edition } from "./types";

class InstagramAuthRejection extends AdminError {}

function config() {
  if (!setupStatus().instagram) throw new AdminError("인스타그램 계정 연결을 먼저 설정해 주세요.", 503);
  const id = process.env.INSTAGRAM_USER_ID!, version = process.env.INSTAGRAM_API_VERSION || "v26.0";
  const origin = new URL(process.env.CARD_NEWS_PUBLIC_URL!);
  if (!/^\d+$/.test(id) || !/^v\d+\.0$/.test(version) || origin.protocol !== "https:" || origin.username || origin.password) throw new AdminError("인스타그램 연결 설정을 확인해 주세요.", 503);
  return { id, base: `https://graph.instagram.com/${version}`, origin: origin.origin };
}
async function graph(endpoint: string, body?: Record<string, string | boolean>) {
  const { base } = config();
  let response: Response;
  try {
    response = await fetch(`${base}/${endpoint}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${process.env.INSTAGRAM_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
  } catch { throw new AdminError("인스타그램 응답을 받지 못했습니다. 발행 상태 확인을 눌러 확인하세요.", 502); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const code = Number(data.error?.code);
    // These explicit authentication/permission rejections cannot have published media.
    // Other failures, malformed responses and network errors remain ambiguous.
    if (response.status >= 400 && response.status < 500 && [10, 190, 200].includes(code)) throw new InstagramAuthRejection("인스타그램 인증·발행 권한이 거절됐습니다. 연결을 갱신한 뒤 다시 발행할 수 있습니다.", 502);
    throw new AdminError(code === 190 ? "인스타그램 연결이 만료되었습니다. 연결을 갱신해 주세요." : `인스타그램 요청 실패${Number.isFinite(code) ? ` (코드 ${code})` : ""}. 연결 권한과 발행 상태를 확인해 주세요.`, 502);
  }
  return data as { id?: string; username?: string; status_code?: string; permalink?: string };
}
function checkedId(id?: string) { if (!id || !/^\d+$/.test(id)) throw new AdminError("인스타그램이 유효한 결과 번호를 반환하지 않았습니다.", 502); return id; }
export async function instagramAccount() {
  const data = await graph(`${config().id}?fields=id,username`);
  if (!data.username) throw new AdminError("인스타그램 계정 이름을 확인할 수 없습니다.", 502);
  return { id: checkedId(data.id), username: data.username };
}
async function save(edition: Edition) { return putEdition(edition, edition.revision); }
async function publishContainer(edition: Edition) {
  if (!edition.publication?.containerId || edition.publication.publishRequestedAt) return edition;
  // Durable fence before the external side effect. Never retry an ambiguous media_publish call.
  edition = await save({ ...edition, publication: { ...edition.publication, publishRequestedAt: new Date().toISOString(), message: "인스타그램에 최종 발행 요청 중입니다." } });
  let data: Awaited<ReturnType<typeof graph>>;
  try { data = await graph(`${config().id}/media_publish`, { creation_id: edition.publication!.containerId! }); }
  catch (error) {
    if (error instanceof InstagramAuthRejection) return save({ ...edition, status: "approved", publication: { ...edition.publication!, publishRequestedAt: undefined, message: error.message } });
    throw error;
  }
  const mediaId = checkedId(data.id);
  edition = await save({ ...edition, status: "published", publishedAt: new Date().toISOString(), publication: { ...edition.publication!, mediaId, message: "인스타그램에서 게시물 발행을 확인했습니다." } });
  try {
    const media = await graph(`${mediaId}?fields=permalink`);
    if (media.permalink && /^https:\/\/(www\.)?instagram\.com\//.test(media.permalink)) edition = await save({ ...edition, publication: { ...edition.publication!, permalink: media.permalink } });
  } catch { /* Publication is already durable; a missing link must not invite a retry. */ }
  return edition;
}
export async function publishEdition(edition: Edition, accountId: unknown) {
  if (edition.status !== "approved") throw new AdminError("검토 완료된 원고만 발행할 수 있습니다.", 409);
  const issues = editionIssues(edition); if (issues.length) throw new AdminError(issues[0]);
  const account = await instagramAccount();
  if (typeof accountId !== "string" || !equalSecret(account.id, accountId)) throw new AdminError("연결 계정을 확인한 후 발행해 주세요.", 409);
  edition = await save({ ...edition, status: "publishing", publication: { attempt: randomUUID(), children: [], message: "카드 10장을 인스타그램에 준비하고 있습니다." } });
  try {
    const expires = Math.floor(Date.now() / 1000) + 86400;
    for (let i = 0; i < 10; i++) {
      const attempt = edition.publication!.attempt;
      const signature = signAsset(edition.date, attempt, i, expires);
      const imageUrl = `${config().origin}/api/instagram-assets/${edition.date}/${i}?attempt=${attempt}&expires=${expires}&signature=${signature}`;
      const child = await graph(`${config().id}/media`, { image_url: imageUrl, is_carousel_item: true, alt_text: `${edition.cards[i].title.replace(/\n/g, " ")} ${edition.cards[i].body.replace(/\n/g, " ")}` });
      edition = await save({ ...edition, publication: { ...edition.publication!, children: [...edition.publication!.children, checkedId(child.id)] } });
    }
    const parent = await graph(`${config().id}/media`, { media_type: "CAROUSEL", children: edition.publication!.children.join(","), caption: edition.caption });
    edition = await save({ ...edition, publication: { ...edition.publication!, containerId: checkedId(parent.id) } });
    const status = await graph(`${edition.publication!.containerId}?fields=status_code`);
    if (status.status_code === "FINISHED") return await publishContainer(edition);
    return await save({ ...edition, status: "needs_check", publication: { ...edition.publication!, message: "이미지 처리 중입니다. 1분 뒤 발행 계속 및 확인을 눌러 주세요." } });
  } catch (error) {
    const latest = await getEdition(edition.date);
    if (!latest || latest.status === "published") return latest || edition;
    return save({ ...latest, status: "needs_check", publication: { ...latest.publication!, message: error instanceof AdminError ? error.message : "발행 결과를 확인해야 합니다. 재발행하지 말고 상태를 확인해 주세요." } });
  }
}
export async function reconcileEdition(edition: Edition) {
  if (!["publishing", "needs_check"].includes(edition.status) || !edition.publication) throw new AdminError("확인할 발행 작업이 없습니다.");
  if (Date.now() - Date.parse(edition.updatedAt) < 60000) throw new AdminError("인스타그램이 처리 중일 수 있습니다. 1분 뒤 다시 확인해 주세요.", 409);
  const publication = edition.publication;
  if (!publication.containerId) {
    if (Date.now() - Date.parse(edition.updatedAt) < 600000) throw new AdminError("카드 업로드가 진행 중일 수 있습니다. 마지막 처리 후 10분이 지나면 복구할 수 있습니다.", 409);
    return save({ ...edition, status: "approved", publication: undefined });
  }
  const data = await graph(`${publication.containerId}?fields=status_code`);
  if (data.status_code === "PUBLISHED") return save({ ...edition, status: "published", publishedAt: new Date().toISOString(), publication: { ...publication, message: "인스타그램에서 발행 완료 상태를 확인했습니다." } });
  if (!publication.publishRequestedAt && data.status_code === "FINISHED") {
    try { return await publishContainer(edition); } catch (error) {
      const latest = await getEdition(edition.date); if (!latest || latest.status === "published") return latest || edition;
      return save({ ...latest, status: "needs_check", publication: { ...latest.publication!, message: error instanceof AdminError ? error.message : "발행 결과 확인이 필요합니다." } });
    }
  }
  if (!publication.publishRequestedAt && ["ERROR", "EXPIRED"].includes(data.status_code || "")) return save({ ...edition, status: "approved", publication: undefined });
  return save({ ...edition, status: "needs_check", publication: { ...publication, message: publication.publishRequestedAt ? "최종 발행 요청의 결과가 아직 확정되지 않았습니다. 인스타그램 계정에서 확인하세요. 중복 방지를 위해 재발행을 차단했습니다." : "이미지 처리 중입니다. 1분 뒤 다시 확인해 주세요." } });
}
