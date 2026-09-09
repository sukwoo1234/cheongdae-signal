import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAllowedCJUEmail } from "@/lib/validation/email";
import { isConfiguredAdminEmail } from "@/lib/auth";
import { requireAjaxRequest } from "@/lib/csrf";
import { createLoginState, LOGIN_STATE_COOKIE, loginStateCookieOptions } from "@/lib/auth-state";
import {
  MAGIC_LINK_RESEND_COOLDOWN_SEC,
  MAGIC_LINK_MAX_PER_EMAIL_PER_HOUR,
  MAGIC_LINK_MAX_PER_IP_PER_HOUR,
  MAGIC_LINK_IP_COOLDOWN_SEC,
} from "@/lib/constants";
import { clientIp, verifyTurnstileToken } from "@/lib/turnstile";

/**
 * 식별자를 그대로 저장하지 않기 위해 HMAC으로 감춘다.
 * 미가입자의 이메일 주소까지 throttle 테이블에 남기지 않으려는 목적이다.
 * 서버에만 있는 값을 키로 쓰므로 DB만 봐서는 역산할 수 없다.
 */
function hashKey(scope: string, value: string): string {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(`${scope}:${value}`)
    .digest("hex");
}

export async function POST(req: Request) {
  // 로그인 요청 자체가 cross-site form POST로 시작되면 공격자가 자기 이메일의
  // 링크를 피해자 브라우저에 심을 수 있다. JSON + custom header 조합은 브라우저의
  // CORS preflight를 요구하므로 외부 사이트가 이 흐름을 시작할 수 없다.
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;

  const body = await req.json().catch(() => ({}));
  const email = body?.email;
  const captchaToken = typeof body?.captcha_token === "string" ? body.captcha_token : "";
  if (process.env.NODE_ENV === "production" && !captchaToken) {
    return NextResponse.json({ error: "CAPTCHA_REQUIRED" }, { status: 400 });
  }
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }
  const normalized = email.trim().toLowerCase();
  if (!isAllowedCJUEmail(normalized) && !isConfiguredAdminEmail(normalized)) {
    return NextResponse.json({ error: "DOMAIN_NOT_ALLOWED" }, { status: 400 });
  }

  const admin = createAdminClient();
  const ip = clientIp(req);

  // 서버측 한도. 예전에는 쿨다운이 app/auth/sent/page.tsx 의 클라이언트 타이머뿐이라
  // 이 엔드포인트를 직접 호출하면 무제한이었고, 커스텀 SMTP의 일일 할당량을
  // 태워서 실제 학생들의 로그인을 막을 수 있었다.
  // IP를 먼저 본다 — 이메일을 바꿔가며 도는 스크립트는 이쪽에서만 걸린다.
  const ipQuota = await admin.rpc("consume_magic_link_quota", {
    p_key_hash: hashKey("ip", ip),
    p_scope: "ip",
    p_cooldown_sec: MAGIC_LINK_IP_COOLDOWN_SEC,
    p_max_per_hour: MAGIC_LINK_MAX_PER_IP_PER_HOUR,
  });
  if (ipQuota.error || ipQuota.data !== true) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  // service_role 요청은 Supabase Auth가 CAPTCHA를 검사하지 않는다. 따라서
  // 이메일별 quota와 SMTP를 쓰기 전에 앱 서버가 일회용 토큰을 직접 검증한다.
  if (!(await verifyTurnstileToken(captchaToken, ip))) {
    return NextResponse.json({ error: "CAPTCHA_FAILED" }, { status: 400 });
  }

  const emailQuota = await admin.rpc("consume_magic_link_quota", {
    p_key_hash: hashKey("email", normalized),
    p_scope: "email",
    p_cooldown_sec: MAGIC_LINK_RESEND_COOLDOWN_SEC,
    p_max_per_hour: MAGIC_LINK_MAX_PER_EMAIL_PER_HOUR,
  });
  if (emailQuota.error || emailQuota.data !== true) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const { data: ban, error: banLookupError } = await admin
    .from("banned_emails")
    .select("email")
    .eq("email", normalized)
    .maybeSingle();
  if (banLookupError) {
    return NextResponse.json({ error: "AUTH_CHECK_FAILED" }, { status: 500 });
  }

  const state = createLoginState();
  const redirectUrl = new URL(
    "/auth/callback",
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  );
  redirectUrl.searchParams.set("state", state);

  // 차단된 주소에도 성공과 동일한 cookie/응답을 내려 계정 상태를 열거하지 못하게
  // 한다. 메일만 발송하지 않는다.
  if (!ban) {
    const { error } = await admin.auth.signInWithOtp({
      email: normalized,
      options: { emailRedirectTo: redirectUrl.toString() },
    });

    if (error) {
      return NextResponse.json({ error: "SEND_FAILED" }, { status: 500 });
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(LOGIN_STATE_COOKIE, state, loginStateCookieOptions());
  return response;
}
