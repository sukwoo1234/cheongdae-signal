import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { LOGIN_STATE_COOKIE, matchesLoginState } from "@/lib/auth-state";
import { requireAjaxRequest } from "@/lib/csrf";

/**
 * 매직링크가 요청된 브라우저로 돌아왔는지만 확인한다.
 * 인증 토큰을 소비하거나 세션을 만들지 않는다. 다른 브라우저이거나 state가
 * 만료된 경우에는 링크를 다시 요청해야 한다.
 */
export async function POST(req: Request) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;

  const body = await req.json().catch(() => ({}));
  const state = typeof body?.state === "string" ? body.state : undefined;
  const expected = (await cookies()).get(LOGIN_STATE_COOKIE)?.value;

  return NextResponse.json({ matches: matchesLoginState(expected, state) });
}
