import { NextResponse } from "next/server";
import { AdminError, readBody, requireAdmin, requireSameOrigin } from "../../../../lib/card-news/server";
import { connectionView, disconnect, refreshToken, startAuthorize, verifyConnection } from "../../../../lib/card-news/instagram-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };
function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers }); }
function failure(error: unknown) { return json({ error: error instanceof AdminError ? error.message : "처리를 완료하지 못했습니다. 상태를 새로 확인한 뒤 다시 시도해 주세요." }, error instanceof AdminError ? error.status : 500); }

export async function GET() {
  try {
    await requireAdmin();
    return json({ view: await connectionView() });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdmin();
    const body = await readBody(request);
    if (!body || typeof body !== "object") throw new AdminError("요청 형식을 확인하세요.");
    let result: { ok: boolean; message: string };
    switch (body.action) {
      case "start": return json({ url: await startAuthorize() });
      case "verify": result = await verifyConnection(); break;
      case "refresh": await refreshToken(); result = { ok: true, message: "연결을 갱신했습니다. 새 만료일을 확인하세요." }; break;
      case "disconnect":
        if (body.confirm !== true) throw new AdminError("연결 해제 확인이 필요합니다.");
        await disconnect(); result = { ok: true, message: "이 사이트의 연결을 해제했습니다." }; break;
      default: throw new AdminError("지원하지 않는 작업입니다.");
    }
    // The view is safe status only (no token, ciphertext or fingerprint).
    return json({ view: await connectionView(), result });
  } catch (error) { return failure(error); }
}
