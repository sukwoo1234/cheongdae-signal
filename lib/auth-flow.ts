import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { hasMagicLinkAuthMethod, isAdminUser, isAllowedAccount } from "@/lib/auth";
import { LOGIN_STATE_COOKIE, loginStateCookieOptions, matchesLoginState } from "@/lib/auth-state";
import { isAllowedCJUEmail } from "@/lib/validation/email";

type FinishSignInOptions = {
  crossBrowserConfirmed?: boolean;
};

/**
 * 로그인 직후 공통 마무리 처리. 어느 콜백 경로로 들어왔든 여기를 지난다.
 *
 * - 이메일 도메인 재검증 (공개 anon 키로 Supabase Auth를 직접 호출해 만든 외부 계정 차단)
 * - 차단 이메일 확인
 * - users 행 생성 (사용자 직접 쓰기 권한이 회수됐으므로 service_role 사용)
 * - 진행 상태에 따른 다음 경로 결정
 *
 * @returns 리다이렉트할 경로
 */
export async function finishSignIn(
  providedState: string | null | undefined,
  options: FinishSignInOptions = {}
): Promise<string> {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(LOGIN_STATE_COOKIE)?.value;
  const clearState = () => cookieStore.set(LOGIN_STATE_COOKIE, "", loginStateCookieOptions(0));

  // getUser()만으로는 현재 로그인 방식(비밀번호/복구/매직링크)을 구분할 수 없다.
  // 서명 검증된 JWT claims의 amr을 확인해 앱의 유일한 로그인 방식만 허용한다.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData || !hasMagicLinkAuthMethod(claimsData.claims)) {
    await supabase.auth.signOut().catch(() => {});
    clearState();
    return "/?error=auth_failed";
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !user.email_confirmed_at) {
    clearState();
    return "/?error=auth_failed";
  }

  const email = user.email.toLowerCase();
  const stateMatches = matchesLoginState(expectedState, providedState ?? undefined);

  if (!stateMatches) {
    // 이메일 앱이 매직링크를 기본 브라우저로 열면 요청 브라우저의 state 쿠키를
    // 가져올 수 없다. 일반 CJU 사용자는 콜백 화면에서 계정을 명시적으로 확인한
    // 경우에만 새 브라우저에서 이어간다. 관리자는 이 예외 없이 동일 브라우저와
    // MFA를 모두 요구한다.
    if (isAdminUser(user) || !options.crossBrowserConfirmed) {
      await supabase.auth.signOut().catch(() => {});
      clearState();
      return "/?error=auth_failed";
    }
    if (!isAllowedCJUEmail(email)) {
      await supabase.auth.signOut().catch(() => {});
      clearState();
      return "/?error=domain";
    }
  }

  if (!isAllowedAccount(user)) {
    await supabase.auth.signOut().catch(() => {});
    clearState();
    return "/?error=domain";
  }

  // 어드민은 users 행을 만들지 않는다 (온보딩·카드가 필요 없고,
  // users_cju_domain CHECK 제약에도 걸리지 않아야 한다).
  if (isAdminUser(user)) {
    clearState();
    if (process.env.ADMIN_REQUIRE_MFA?.trim().toLowerCase() !== "false" && claimsData.claims.aal !== "aal2") {
      return "/auth/mfa";
    }
    return "/admin";
  }

  const admin = createAdminClient();

  const { data: ban } = await admin
    .from("banned_emails")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (ban) {
    await supabase.auth.signOut().catch(() => {});
    clearState();
    return "/?error=banned";
  }

  const { error: upsertError } = await admin
    .from("users")
    .upsert({ id: user.id, email }, { onConflict: "id" });
  if (upsertError) {
    clearState();
    return "/?error=auth_failed";
  }

  const { data: prof } = await admin
    .from("users")
    .select("gender, banned")
    .eq("id", user.id)
    .single();

  if (prof?.banned) {
    await supabase.auth.signOut().catch(() => {});
    clearState();
    return "/?error=banned";
  }
  if (!prof?.gender) {
    clearState();
    return "/onboarding";
  }

  const { count } = await admin
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  clearState();
  if (!count) return "/card/new";

  return "/board";
}
