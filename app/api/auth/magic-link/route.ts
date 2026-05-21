import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAllowedCJUEmail } from "@/lib/validation/email";
import { isAdminEmail } from "@/lib/auth";

export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }
  const normalized = email.trim().toLowerCase();
  // 어드민 이메일은 도메인 제한 우회
  if (!isAllowedCJUEmail(normalized) && !isAdminEmail(normalized)) {
    return NextResponse.json({ error: "DOMAIN_NOT_ALLOWED" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: ban } = await admin
    .from("banned_emails")
    .select("email")
    .eq("email", normalized)
    .maybeSingle();
  if (ban) {
    return NextResponse.json({ error: "BANNED" }, { status: 403 });
  }

  const { error } = await admin.auth.signInWithOtp({
    email: normalized,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/auth/callback`,
    },
  });

  if (error) {
    return NextResponse.json({ error: "SEND_FAILED", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
