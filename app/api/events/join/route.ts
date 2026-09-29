import { NextResponse } from "next/server";
import { getVerifiedAccount, denialResponse } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAjaxRequest } from "@/lib/csrf";
import { createEventSubjectKey } from "@/lib/event-identity";
import { isAccountRetentionExpired } from "@/lib/account-retention";

/** 보유된 학교 인증 계정을 현재 회차에 명시적으로 참여시킨다. */
export async function POST(req: Request) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;

  const { user, denial } = await getVerifiedAccount();
  if (denial) return denialResponse(denial);
  if (!user?.email) return denialResponse("UNAUTHENTICATED");

  const { retention_consent: retentionConsent } = await req.json().catch(() => ({}));
  const email = user.email.trim().toLowerCase();
  const admin = createAdminClient();

  const [profileResult, eventBanResult, permanentBanResult, configResult] = await Promise.all([
    admin
      .from("users")
      .select("gender, banned, retention_accepted_at, last_active_at")
      .eq("id", user.id)
      .maybeSingle(),
    admin.from("banned_emails").select("email").eq("email", email).maybeSingle(),
    admin
      .from("permanent_bans")
      .select("email")
      .eq("email", email)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
    admin
      .from("session_config")
      .select("event_id, ends_at, purging")
      .eq("id", 1)
      .single(),
  ]);

  if (
    profileResult.error || eventBanResult.error || permanentBanResult.error ||
    configResult.error || !configResult.data
  ) {
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }
  if (!profileResult.data) {
    return NextResponse.json({ error: "ACCOUNT_NOT_FOUND" }, { status: 404 });
  }
  if (isAccountRetentionExpired(profileResult.data.last_active_at)) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
    return NextResponse.json({ error: "ACCOUNT_EXPIRED" }, { status: 401 });
  }
  if (profileResult.data.banned || eventBanResult.data || permanentBanResult.data) {
    return NextResponse.json({ error: "BANNED" }, { status: 403 });
  }
  if (configResult.data.purging) {
    return NextResponse.json({ error: "PURGE_IN_PROGRESS" }, { status: 409 });
  }
  if (Date.now() >= new Date(configResult.data.ends_at).getTime()) {
    return NextResponse.json({ error: "EVENT_ENDED" }, { status: 409 });
  }

  let subjectKey: string;
  try {
    subjectKey = createEventSubjectKey(configResult.data.event_id, email);
  } catch {
    return NextResponse.json({ error: "SERVER_CONFIG_ERROR" }, { status: 500 });
  }

  const { error: joinError } = await admin.rpc("rejoin_event_participant", {
    p_event_id: configResult.data.event_id,
    p_user_id: user.id,
    p_email: email,
    p_subject_key: subjectKey,
    p_retention_accepted: retentionConsent === true,
  });
  if (joinError) {
    if (joinError.message.includes("RETENTION_CONSENT_REQUIRED")) {
      return NextResponse.json({ error: "RETENTION_CONSENT_REQUIRED" }, { status: 400 });
    }
    if (joinError.message.includes("PARTICIPANT_BANNED")) {
      return NextResponse.json({ error: "BANNED" }, { status: 403 });
    }
    if (joinError.message.includes("PURGE_IN_PROGRESS") || joinError.message.includes("STALE_EVENT")) {
      return NextResponse.json({ error: "EVENT_CHANGED" }, { status: 409 });
    }
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }

  if (!profileResult.data.gender) {
    return NextResponse.json({ ok: true, next: "/onboarding" });
  }

  const { count, error: cardError } = await admin
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (cardError) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });

  return NextResponse.json({ ok: true, next: count ? "/board" : "/card/new" });
}
