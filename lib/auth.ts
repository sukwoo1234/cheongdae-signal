import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAllowedCJUEmail } from "@/lib/validation/email";

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
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

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const target = process.env.ADMIN_EMAIL?.toLowerCase();
  if (!target) return false;
  return email.toLowerCase() === target;
}

/**
 * 이 서비스를 쓸 수 있는 계정인가.
 * 도메인 검증이 매직링크 발급 라우트에만 있으면, 공개된 anon 키로 Supabase Auth를
 * 직접 호출해 가입한 외부인을 막지 못한다. 인증 경계 전체에서 다시 검사한다.
 */
export function isAllowedAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return isAllowedCJUEmail(email) || isAdminEmail(email);
}

export type ActiveUserDenial = "UNAUTHENTICATED" | "DOMAIN_NOT_ALLOWED" | "BANNED";

/**
 * 인증 + 도메인 재검증 + 차단 확인을 한 번에 처리한다.
 * 거부 시에는 세션까지 폐기해서, 차단된 사용자가 남은 쿠키로 계속 활동하지 못하게 한다.
 */
export async function getActiveUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, profile: null, denial: "UNAUTHENTICATED" as const };
  }

  if (!isAllowedAccountEmail(user.email)) {
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

export function denialResponse(denial: ActiveUserDenial) {
  const status = denial === "UNAUTHENTICATED" ? 401 : 403;
  return NextResponse.json({ error: denial }, { status });
}
