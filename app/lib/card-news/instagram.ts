import "server-only";
import { randomUUID } from "node:crypto";
import { AdminError, equalSecret, getEdition, putEdition, signAsset } from "./server";
import { editionIssues, type Edition } from "./types";
import { apiVersion, assertCredentialsCurrent, resolveCredentials, verifyIdentity, type InstagramCredentials } from "./instagram-connection";

class InstagramAuthRejection extends AdminError {}

function assetOrigin() {
  const base = process.env.CARD_NEWS_PUBLIC_URL;
  if (!base) throw new AdminError("인스타그램 연결 설정을 확인해 주세요.", 503);
  let origin: URL;
  try { origin = new URL(base); } catch { throw new AdminError("인스타그램 연결 설정을 확인해 주세요.", 503); }
  if (origin.protocol !== "https:" || origin.username || origin.password) throw new AdminError("인스타그램 연결 설정을 확인해 주세요.", 503);
  return origin.origin;
}
// Every call of one publish/reconcile operation receives the same credentials, resolved once by the caller.
async function graph(creds: InstagramCredentials, endpoint: string, body?: Record<string, string | boolean>) {
  const version = apiVersion();
  let response: Response;
  try {
    response = await fetch(`https://graph.instagram.com/${version}/${endpoint}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
  } catch { throw new AdminError("인스타그램 응답을 받지 못했습니다. 발행 상태 확인을 눌러 확인하세요.", 502); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const code = Number(data.error?.code);
    // These explicit authentication/permission rejections cannot have published media.
    // Other failures, malformed responses and network errors remain ambiguous.
    if (response.status >= 400 && response.status < 500 && [10, 190, 200].includes(code)) throw new InstagramAuthRejection("인스타그램 인증·발행 권한이 거절됐습니다. 연결을 갱신한 뒤 다시 발행할 수 있습니다.", 502);
    throw new AdminError(code === 190 ? "인스타그램 연결이 만료되었습니다. 연결을 갱신해 주세요." : `인스타그램 요청 실패${Number.isFinite(code) ? ` (코드 ${code})` : ""}. 연결 권한과 발행 상태를 확인해 주세요.`, 502);
  }
  return data as { id?: string; status_code?: string; permalink?: string };
}
function checkedId(id?: string) { if (!id || !/^\d+$/.test(id)) throw new AdminError("인스타그램이 유효한 결과 번호를 반환하지 않았습니다.", 502); return id; }
// Live /me check: the authenticated account must be the one the credentials were resolved for (OAuth and legacy).
export async function instagramAccount(creds?: InstagramCredentials) {
  const identity = await verifyIdentity(creds ?? await resolveCredentials());
  return { id: identity.user_id, username: identity.username };
}
async function save(edition: Edition) { return putEdition(edition, edition.revision); }
// The caller has already confirmed the live /me identity for exactly these credentials.
async function publishContainer(edition: Edition, creds: InstagramCredentials) {
  if (!edition.publication?.containerId || edition.publication.publishRequestedAt) return edition;
  const pinnedId = edition.publication.accountId;
  if (!pinnedId) return save({ ...edition, status: "needs_check", publication: { ...edition.publication, message: "이 발행 작업은 계정 기록 없이 시작되어 자동으로 이어서 발행할 수 없습니다. Instagram 앱에서 이 게시물이 올라갔는지 직접 확인하세요. 올라가지 않았다면 이미지 준비가 만료된 뒤(약 24시간) ‘발행 계속 및 확인’을 눌러 검토 완료 상태로 되돌리고 다시 발행하세요." } });
  // Reconnecting to a different account mid-publish must not mix containers across accounts.
  if (creds.userId !== pinnedId) return save({ ...edition, status: "needs_check", publication: { ...edition.publication, message: "연결된 Instagram 계정이 바뀌어 발행을 계속할 수 없습니다. 원래 계정으로 다시 연결한 뒤 상태를 확인하세요." } });
  // Last check before the irreversible step: a disconnect/replacement since these credentials
  // were resolved stops here, before the fence, so the request stays safely retryable.
  await assertCredentialsCurrent(creds);
  // Durable fence before the external side effect. Never retry an ambiguous media_publish call.
  edition = await save({ ...edition, publication: { ...edition.publication, publishRequestedAt: new Date().toISOString(), message: "인스타그램에 최종 발행 요청 중입니다." } });
  let data: Awaited<ReturnType<typeof graph>>;
  try { data = await graph(creds, `${pinnedId}/media_publish`, { creation_id: edition.publication!.containerId! }); }
  catch (error) {
    if (error instanceof InstagramAuthRejection) return save({ ...edition, status: "approved", publication: { ...edition.publication!, publishRequestedAt: undefined, message: error.message } });
    throw error;
  }
  const mediaId = checkedId(data.id);
  edition = await save({ ...edition, status: "published", publishedAt: new Date().toISOString(), publication: { ...edition.publication!, mediaId, message: "인스타그램에서 게시물 발행을 확인했습니다." } });
  try {
    const media = await graph(creds, `${mediaId}?fields=permalink`);
    if (media.permalink && /^https:\/\/(www\.)?instagram\.com\//.test(media.permalink)) edition = await save({ ...edition, publication: { ...edition.publication!, permalink: media.permalink } });
  } catch { /* Publication is already durable; a missing link must not invite a retry. */ }
  return edition;
}
export async function publishEdition(edition: Edition, accountId: unknown) {
  if (edition.status !== "approved") throw new AdminError("검토 완료된 원고만 발행할 수 있습니다.", 409);
  const issues = editionIssues(edition); if (issues.length) throw new AdminError(issues[0]);
  // Resolve credentials once; the token and account ID stay pinned for every step of this publication.
  const creds = await resolveCredentials();
  const account = await instagramAccount(creds);
  if (typeof accountId !== "string" || !equalSecret(account.id, accountId)) throw new AdminError("연결 계정을 확인한 후 발행해 주세요.", 409);
  const pinnedId = creds.userId;
  edition = await save({ ...edition, status: "publishing", publication: { attempt: randomUUID(), children: [], accountId: pinnedId, message: "카드 10장을 인스타그램에 준비하고 있습니다." } });
  try {
    const expires = Math.floor(Date.now() / 1000) + 86400;
    const origin = assetOrigin();
    for (let i = 0; i < 10; i++) {
      const attempt = edition.publication!.attempt;
      const signature = signAsset(edition.date, attempt, i, expires);
      const imageUrl = `${origin}/api/instagram-assets/${edition.date}/${i}?attempt=${attempt}&expires=${expires}&signature=${signature}`;
      const child = await graph(creds, `${pinnedId}/media`, { image_url: imageUrl, is_carousel_item: true, alt_text: `${edition.cards[i].title.replace(/\n/g, " ")} ${edition.cards[i].body.replace(/\n/g, " ")}` });
      edition = await save({ ...edition, publication: { ...edition.publication!, children: [...edition.publication!.children, checkedId(child.id)] } });
    }
    const parent = await graph(creds, `${pinnedId}/media`, { media_type: "CAROUSEL", children: edition.publication!.children.join(","), caption: edition.caption });
    edition = await save({ ...edition, publication: { ...edition.publication!, containerId: checkedId(parent.id) } });
    const status = await graph(creds, `${edition.publication!.containerId}?fields=status_code`);
    if (status.status_code === "FINISHED") return await publishContainer(edition, creds);
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
  // One credential context for this whole reconcile. A container belongs to the account that
  // created it, so a recorded account that differs from the current connection is rejected up front.
  const creds = await resolveCredentials();
  if (publication.accountId && publication.accountId !== creds.userId) throw new AdminError("이 발행 작업은 지금 연결된 계정과 다른 Instagram 계정으로 시작됐습니다. 원래 계정으로 다시 연결한 뒤 확인해 주세요.", 409);
  // Read-only status query; also allowed for older attempts without a recorded account so a
  // completed publication can still be confirmed. Continuing to publish is gated below.
  const data = await graph(creds, `${publication.containerId}?fields=status_code`);
  if (data.status_code === "PUBLISHED") return save({ ...edition, status: "published", publishedAt: new Date().toISOString(), publication: { ...publication, message: "인스타그램에서 발행 완료 상태를 확인했습니다." } });
  if (!publication.publishRequestedAt && data.status_code === "FINISHED") {
    try {
      if (publication.accountId) await instagramAccount(creds);
      return await publishContainer(edition, creds);
    } catch (error) {
      const latest = await getEdition(edition.date); if (!latest || latest.status === "published") return latest || edition;
      return save({ ...latest, status: "needs_check", publication: { ...latest.publication!, message: error instanceof AdminError ? error.message : "발행 결과 확인이 필요합니다." } });
    }
  }
  if (!publication.publishRequestedAt && ["ERROR", "EXPIRED"].includes(data.status_code || "")) return save({ ...edition, status: "approved", publication: undefined });
  return save({ ...edition, status: "needs_check", publication: { ...publication, message: publication.publishRequestedAt ? "최종 발행 요청의 결과가 아직 확정되지 않았습니다. 인스타그램 계정에서 확인하세요. 중복 방지를 위해 재발행을 차단했습니다." : "이미지 처리 중입니다. 1분 뒤 다시 확인해 주세요." } });
}
