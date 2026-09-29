import { NextResponse } from "next/server";
import {
  hasMagicLinkAuthMethod,
  hasMfaAssuranceLevel,
  isAdminUser,
  isAllowedAccount,
} from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAccountRetentionExpired } from "@/lib/account-retention";

function response(next: string | null, status = 200) {
  return NextResponse.json(
    { next },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** 이미 인증된 브라우저를 현재 참가 단계로 돌려보낸다. */
export async function GET() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (claimsError || !claims || !hasMagicLinkAuthMethod(claims)) {
    return response(null, 401);
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.email || !user.email_confirmed_at || !isAllowedAccount(user)) {
    return response(null, 401);
  }

  if (isAdminUser(user)) {
    const requireMfa = process.env.ADMIN_REQUIRE_MFA?.trim().toLowerCase() !== "false";
    return response(requireMfa && !hasMfaAssuranceLevel(claims) ? "/auth/mfa" : "/admin");
  }

  // 현재 회차에 아직 합류하지 않은 보유 계정은 RLS로 public.users가
  // 보이지 않는다. 서버에서 계정과 현재 회차 원장을 따로 확인한다.
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("gender, banned, retention_accepted_at, last_active_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) return response(null, 401);
  if (isAccountRetentionExpired(profile.last_active_at)) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) return response(null, 503);
    await supabase.auth.signOut().catch(() => {});
    return response(null, 401);
  }
  if (profile.banned) return response(null, 403);

  const { data: participantData, error: participantError } = await admin.rpc(
    "admin_event_participant_state",
    { p_user_id: user.id },
  );
  if (participantError) return response(null, 503);
  const participant = Array.isArray(participantData) ? participantData[0] : participantData;
  if (!participant) return response("/join");
  if (participant.banned) return response(null, 403);
  if (!profile.gender) return response("/onboarding");

  const [{ data: cardData, error: cardError }, { data: config, error: configError }] =
    await Promise.all([
      supabase.rpc("my_card"),
      supabase.from("session_config").select("ends_at, purging").eq("id", 1).single(),
    ]);

  if (cardError || configError || !config || config.purging) {
    return response(null, 503);
  }

  const card = Array.isArray(cardData) ? (cardData[0] ?? null) : (cardData ?? null);
  if (!card) return response("/card/new");
  if (Date.now() >= new Date(config.ends_at).getTime()) return response("/end");
  return response("/board");
}
