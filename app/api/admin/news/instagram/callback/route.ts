import { NextResponse } from "next/server";
import { AdminError, consumeOAuthState } from "../../../../../lib/card-news/server";
import { handleCallback } from "../../../../../lib/card-news/instagram-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
const headers = {
  "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow", "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": CSP,
};
const LABEL: Record<string, string> = {
  connected: "Instagram 계정을 연결했습니다.",
  denied: "Instagram에서 권한 동의를 완료하지 않았습니다.",
  invalid_state: "연결 요청 확인에 실패했습니다. 다시 시도해 주세요.",
  session: "관리자 로그인 상태가 바뀌어 연결을 저장하지 못했습니다. 다시 로그인한 뒤 연결해 주세요.",
  failed: "Instagram 연결 처리 중 오류가 발생했습니다. 설정을 확인한 뒤 다시 시도해 주세요.",
};
// Minimal same-origin, no-store HTML with a fixed link back into the admin app. Never echoes
// the upstream code, token, or error description; the enum-labelled link is the only content.
function page(status: "connected" | "error", reason: keyof typeof LABEL) {
  const href = `/admin/news/instagram?status=${status}${status === "error" ? `&reason=${reason}` : ""}`;
  const text = LABEL[reason] ?? LABEL.failed;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Instagram 연결</title></head>` +
    // Static script (no interpolation): drops ?code/&state from the visible address and history entry.
    `<body><p>${text}</p><p><a href="${href}">관리자 화면으로 돌아가기</a></p><script>history.replaceState(null,"",location.pathname)</script></body></html>`;
  return new NextResponse(html, { headers });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  if (params.get("error")) {
    if (state) await consumeOAuthState(state).catch(() => {});
    return page("error", "denied");
  }
  const code = params.get("code");
  if (!code || !state) return page("error", "invalid_state");
  try {
    await handleCallback(code, state);
    return page("connected", "connected");
  } catch (error) {
    return page("error", error instanceof AdminError && error.status === 401 ? "session" : "failed");
  }
}
