import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { hasMagicLinkAuthMethod, isAdminUser, isAllowedAccount } from "@/lib/auth";
import { LOGIN_STATE_COOKIE, loginStateCookieOptions, matchesLoginState } from "@/lib/auth-state";
import { isAllowedCJUEmail } from "@/lib/validation/email";
import { createEventSubjectKey } from "@/lib/event-identity";
import { isAccountRetentionExpired } from "@/lib/account-retention";

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

  const { data: ban, error: banLookupError } = await admin
    .from("banned_emails")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (banLookupError) {
    await supabase.auth.signOut().catch(() => {});
    clearState();
    return "/?error=auth_failed";
  }
  if (ban) {
    await supabase.auth.signOut().catch(() => {});
    clearState();
    return "/?error=banned";
  }

  const { data: permanentBan, error: permanentBanError } = await admin
    .from("permanent_bans")
    .select("email")
    .eq("email", email)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (permanentBanError || permanentBan) {
    await supabase.auth.signOut().catch(() => {});
    clearState();
    return permanentBan ? "/?error=banned" : "/?error=auth_failed";
  }

  const { data: config, error: configError } = await admin
    .from("session_config")
    .select("event_id, purging")
    .eq("id", 1)
    .single();
  if (configError || !config || config.purging) {
    await supabase.auth.signOut().catch(() => {});
    clearState();
    return "/?error=auth_failed";
  }

  let subjectKey: string;
  try {
    subjectKey = createEventSubjectKey(config.event_id, email);
  } catch {
    await supabase.auth.signOut().catch(() => {});
    clearState();
    return "/?error=auth_failed";
  }

  const { data: foundProfile, error: profileLookupError } = await admin
    .from("users")
    .select("gender, banned, last_active_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profileLookupError) {
    await supabase.auth.signOut().catch(() => {});
    clearState();
    return "/?error=auth_failed";
  }

  // 6개월이 지난 계정이 새 로그인 메일로 다시 인증된 경우에는 남아 있던
  // 프로필을 삭제하고 최초 참여자처럼 온보딩한다.
  let existingProfile = foundProfile;
  if (existingProfile && isAccountRetentionExpired(existingProfile.last_active_at)) {
    const { error: expiredDeleteError } = await admin.from("users").delete().eq("id", user.id);
    if (expiredDeleteError) {
      await supabase.auth.signOut().catch(() => {});
      clearState();
      return "/?error=auth_failed";
    }
    existingProfile = null;
  }

  let prof = existingProfile;
  if (existingProfile) {
    // 이전 회차에서 인증된 계정은 로그인이 완료되어도 자동으로 현재
    // 회차 참여자로 세지 않는다. 재참여 화면에서 버튼을 누른 뒤 원장을 연결한다.
    const { data: participantState, error: participantError } = await admin.rpc(
      "admin_event_participant_state",
      { p_user_id: user.id },
    );
    if (participantError) {
      await supabase.auth.signOut().catch(() => {});
      clearState();
      return "/?error=auth_failed";
    }
    const state = Array.isArray(participantState) ? participantState[0] : participantState;
    if (!state) {
      clearState();
      return "/join";
    }
    if (state.banned) {
      await supabase.auth.signOut().catch(() => {});
      clearState();
      return "/?error=banned";
    }
  } else {
    // 최초 이용자의 계정 행 생성과 행사별 가명 원장 연결을 DB 트랜잭션
    // 하나로 처리한다.
    const { error: registerError } = await admin.rpc("register_event_participant", {
      p_event_id: config.event_id,
      p_user_id: user.id,
      p_email: email,
      p_subject_key: subjectKey,
    });
    if (registerError) {
      await supabase.auth.signOut().catch(() => {});
      clearState();
      return registerError.message.includes("PARTICIPANT_BANNED")
        ? "/?error=banned"
        : "/?error=auth_failed";
    }

    const { data: createdProfile, error: createdProfileError } = await admin
      .from("users")
      .select("gender, banned, last_active_at")
      .eq("id", user.id)
      .single();
    if (createdProfileError || !createdProfile) {
      await supabase.auth.signOut().catch(() => {});
      clearState();
      return "/?error=auth_failed";
    }
    prof = createdProfile;
  }

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
