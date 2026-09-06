import { NextResponse } from "next/server";

/**
 * 쿠키 세션을 사용하는 상태 변경 요청은 브라우저의 same-origin fetch에서만
 * 보내지는 사용자 정의 헤더를 요구한다. 외부 사이트의 form POST와 일반적인
 * cross-site fetch는 이 헤더를 설정할 수 없으므로 CSRF를 차단한다.
 */
export function requireAjaxRequest(req: Request): NextResponse | null {
  if (req.headers.get("x-requested-with") === "XMLHttpRequest") return null;
  return NextResponse.json({ error: "CSRF_FAILED" }, { status: 403 });
}
