import { NextResponse } from "next/server";
import { getVerifiedAccount, denialResponse } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAjaxRequest } from "@/lib/csrf";
import { createEventSubjectKey } from "@/lib/event-identity";
import { expireRetainedAccount } from "@/lib/expire-account";

/** 보유된 학교 인증 계정을 현재 회차에 명시적으로 참여시킨다. */
export async function POST(req: Request) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;

  const { user, denial } = await getVerifiedAccount();
  if (denial) return denialResponse(denial);
  if (!user?.email) return denialResponse("UNAUTHENTICATED");

  const { retention_consent: retentionConsent } = (await req.json().catch(() => null)) ?? {};
  const email = user.email.trim().toLowerCase();
  const admin = createAdminClient();

  const { data: expiredAccountDeleted, error: expiryError } =
    await expireRetainedAccount(admin, user.id);
  if (expiryError || typeof expiredAccountDeleted !== "boolean") {
    return NextResponse.json(
      { error: expiryError?.message.includes("PURGE_IN_PROGRESS") ? "PURGE_IN_PROGRESS" : "DB_ERROR" },
      { status: expiryError?.message.includes("PURGE_IN_PROGRESS") ? 409 : 500 },
    );
  }
  if (expiredAccountDeleted) {
    const supabase = await createClient();
    await supabase.auth.signOut().catch(() => {});
    return NextResponse.json({ error: "ACCOUNT_EXPIRED" }, { status: 401 });
  }

  const [profileResult, eventBanResult, permanentBanResult, configResult, participantResult] = await Promise.all([
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
    admin.rpc("admin_event_participant_state", { p_user_id: user.id }),
  ]);

  if (
    profileResult.error || eventBanResult.error || permanentBanResult.error ||
    configResult.error || !configResult.data || participantResult.error
  ) {
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }
  if (!profileResult.data) {
    return NextResponse.json({ error: "ACCOUNT_NOT_FOUND" }, { status: 404 });
  }
  const participant = Array.isArray(participantResult.data)
    ? participantResult.data[0] : participantResult.data;
  if (profileResult.data.banned || eventBanResult.data || permanentBanResult.data) {
    return NextResponse.json({ error: "BANNED" }, { status: 403 });
  }
  if (configResult.data.purging) {
    return NextResponse.json({ error: "PURGE_IN_PROGRESS" }, { status: 409 });
  }
  if (Date.now() >= new Date(configResult.data.ends_at).getTime()) {
    return NextResponse.json({ error: "EVENT_ENDED" }, { status: 409 });
  }

  if (participant?.banned) {
    return NextResponse.json({ error: "BANNED" }, { status: 403 });
  }

  // 이미 현재 회차에 참여했다면 재참여 RPC를 다시 호출하지 않는다.
  // 그 RPC는 마지막 참여일을 갱신하므로, 중복 호출이 계정 보유 기한을 늘릴 수 있다.
  if (!participant) {
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
      if (joinError.message.includes("ACCOUNT_NOT_FOUND")) {
        const supabase = await createClient();
        await supabase.auth.signOut().catch(() => {});
        return NextResponse.json({ error: "ACCOUNT_EXPIRED" }, { status: 401 });
      }
      if (joinError.message.includes("EVENT_ENDED")) {
        return NextResponse.json({ error: "EVENT_ENDED" }, { status: 409 });
      }
      if (joinError.message.includes("PURGE_IN_PROGRESS") || joinError.message.includes("STALE_EVENT")) {
        return NextResponse.json({ error: "EVENT_CHANGED" }, { status: 409 });
      }
      return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
    }
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
