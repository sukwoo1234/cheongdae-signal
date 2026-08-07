import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAllowedCJUEmail } from "@/lib/validation/email";
import { isAdminEmail } from "@/lib/auth";
import {
  MAGIC_LINK_RESEND_COOLDOWN_SEC,
  MAGIC_LINK_MAX_PER_EMAIL_PER_HOUR,
  MAGIC_LINK_MAX_PER_IP_PER_HOUR,
  MAGIC_LINK_IP_COOLDOWN_SEC,
} from "@/lib/constants";

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

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }
  const normalized = email.trim().toLowerCase();
  if (!isAllowedCJUEmail(normalized) && !isAdminEmail(normalized)) {
    return NextResponse.json({ error: "DOMAIN_NOT_ALLOWED" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 서버측 한도. 예전에는 쿨다운이 app/auth/sent/page.tsx 의 클라이언트 타이머뿐이라
  // 이 엔드포인트를 직접 호출하면 무제한이었고, 커스텀 SMTP의 일일 할당량을
  // 태워서 실제 학생들의 로그인을 막을 수 있었다.
  // IP를 먼저 본다 — 이메일을 바꿔가며 도는 스크립트는 이쪽에서만 걸린다.
  const ipQuota = await admin.rpc("consume_magic_link_quota", {
    p_key_hash: hashKey("ip", clientIp(req)),
    p_scope: "ip",
    p_cooldown_sec: MAGIC_LINK_IP_COOLDOWN_SEC,
    p_max_per_hour: MAGIC_LINK_MAX_PER_IP_PER_HOUR,
  });
  if (ipQuota.error || ipQuota.data !== true) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
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

  const { data: ban } = await admin
    .from("banned_emails")
    .select("email")
    .eq("email", normalized)
    .maybeSingle();

  // 차단된 주소에도 성공과 똑같이 응답한다. BANNED를 그대로 돌려주면
  // "이 주소가 차단됐는지" 확인하는 열거 도구가 된다. 메일만 보내지 않는다.
  if (ban) return NextResponse.json({ ok: true });

  const { error } = await admin.auth.signInWithOtp({
    email: normalized,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/auth/callback`,
    },
  });

  if (error) {
    return NextResponse.json({ error: "SEND_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
