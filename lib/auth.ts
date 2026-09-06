import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAllowedCJUEmail } from "@/lib/validation/email";

type VerifiedClaims = {
  sub?: unknown;
  email?: unknown;
  aal?: unknown;
  amr?: unknown;
};

/** Supabase JWT의 인증 방식은 서버가 검증한 claims에서만 읽는다. */
export function hasMagicLinkAuthMethod(claims: VerifiedClaims | null | undefined): boolean {
  if (!claims || !Array.isArray(claims.amr)) return false;

  return claims.amr.some((entry) => {
    const method =
      typeof entry === "string"
        ? entry
        : entry && typeof entry === "object" && "method" in entry
          ? (entry as { method?: unknown }).method
          : undefined;
    return method === "magiclink" || method === "otp";
  });
}

export function hasMfaAssuranceLevel(claims: VerifiedClaims | null | undefined): boolean {
  return claims?.aal === "aal2";
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData || !hasMagicLinkAuthMethod(claimsData.claims)) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email_confirmed_at || !isAllowedAccount(user)) return null;
  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();
  return profile;
}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

/**
 * 관리자 로그인 링크를 허용할 이메일 주소인지 확인한다.
 *
 * 이 함수는 이메일 발송 허용목록 용도일 뿐, 관리자 권한 판정에 사용하면 안 된다.
 * 이메일은 Supabase Auth 설정/관리자 API/OAuth 구성에 따라 바뀔 수 있으므로
 * 실제 권한은 아래 isAdminUser()에서 고정된 사용자 UUID와 함께 확인한다.
 */
export function isConfiguredAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const target = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!target) return false;
  return email.trim().toLowerCase() === target;
}

export type AuthenticatedIdentity = {
  id: string;
  email?: string | null;
};

/** 관리자 권한은 이메일 단독이 아니라 고정된 Auth 사용자 UUID와 이메일을 함께 검증한다. */
export function isAdminUser(user: AuthenticatedIdentity | null | undefined): boolean {
  const targetId = process.env.ADMIN_USER_ID?.trim();
  return Boolean(
    targetId &&
      user?.id &&
      user.id === targetId &&
      isConfiguredAdminEmail(user.email)
  );
}

/**
 * 이 서비스를 쓸 수 있는 계정인가.
 * 도메인 검증이 매직링크 발급 라우트에만 있으면, 공개된 anon 키로 Supabase Auth를
 * 직접 호출해 가입한 외부인을 막지 못한다. 인증 경계 전체에서 다시 검사한다.
 */
export function isAllowedAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return isAllowedCJUEmail(email) || isConfiguredAdminEmail(email);
}

/** 세션을 가진 사용자가 실제로 서비스 경계를 통과할 수 있는지 확인한다. */
export function isAllowedAccount(user: AuthenticatedIdentity | null | undefined): boolean {
  if (!user?.email) return false;
  return isAllowedCJUEmail(user.email) || isAdminUser(user);
}

export type ActiveUserDenial = "UNAUTHENTICATED" | "DOMAIN_NOT_ALLOWED" | "BANNED";

/**
 * 인증 + 도메인 재검증 + 차단 확인을 한 번에 처리한다.
 * 거부 시에는 세션까지 폐기해서, 차단된 사용자가 남은 쿠키로 계속 활동하지 못하게 한다.
 */
export async function getActiveUser() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData || !hasMagicLinkAuthMethod(claimsData.claims)) {
    return { supabase, user: null, profile: null, denial: "UNAUTHENTICATED" as const };
  }

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, profile: null, denial: "UNAUTHENTICATED" as const };
  }

  if (!user.email_confirmed_at) {
    await supabase.auth.signOut();
    return { supabase, user: null, profile: null, denial: "UNAUTHENTICATED" as const };
  }

  if (!isAllowedAccount(user)) {
    await supabase.auth.signOut();
    return { supabase, user: null, profile: null, denial: "DOMAIN_NOT_ALLOWED" as const };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id, gender, banned")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.banned) {
    await supabase.auth.signOut();
    return { supabase, user: null, profile: null, denial: "BANNED" as const };
  }

  return { supabase, user, profile, denial: null };
}

/** 관리자 API 공통 인증. 관리자 계정은 매직링크와 AAL2(MFA)를 모두 요구한다. */
export async function getAdminContext() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const { data: { user } } = await supabase.auth.getUser();

  const requireMfa = process.env.ADMIN_REQUIRE_MFA?.trim().toLowerCase() !== "false";
  const valid =
    !claimsError &&
    !!claims &&
    hasMagicLinkAuthMethod(claims) &&
    (!requireMfa || hasMfaAssuranceLevel(claims)) &&
    !!user &&
    !!user.email_confirmed_at &&
    claims.sub === user.id &&
    isAdminUser(user);

  return { supabase, user: valid ? user : null };
}

export function denialResponse(denial: ActiveUserDenial) {
  const status = denial === "UNAUTHENTICATED" ? 401 : 403;
  return NextResponse.json({ error: denial }, { status });
}
