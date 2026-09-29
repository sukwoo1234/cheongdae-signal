import { NextResponse } from "next/server";
import {
  hasMagicLinkAuthMethod,
  hasMfaAssuranceLevel,
  isAdminUser,
  isAllowedAccount,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("gender, banned")
    .eq("id", user.id)
    .maybeSingle();

  // 이전 회차에서 삭제된 세션 등은 로그인 화면에 그대로 머무르게 한다.
  if (profileError || !profile) return response(null, 401);
  if (profile.banned) return response(null, 403);
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
