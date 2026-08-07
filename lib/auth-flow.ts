import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail, isAllowedAccountEmail } from "@/lib/auth";

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
export async function finishSignIn(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return "/?error=auth_failed";

  const email = user.email.toLowerCase();

  if (!isAllowedAccountEmail(email)) {
    await supabase.auth.signOut();
    return "/?error=domain";
  }

  // 어드민은 users 행을 만들지 않는다 (온보딩·카드가 필요 없고,
  // users_cju_domain CHECK 제약에도 걸리지 않아야 한다).
  if (isAdminEmail(email)) return "/admin";

  const admin = createAdminClient();

  const { data: ban } = await admin
    .from("banned_emails")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (ban) {
    await supabase.auth.signOut();
    return "/?error=banned";
  }

  const { error: upsertError } = await admin
    .from("users")
    .upsert({ id: user.id, email }, { onConflict: "id" });
  if (upsertError) return "/?error=auth_failed";

  const { data: prof } = await admin
    .from("users")
    .select("gender, banned")
    .eq("id", user.id)
    .single();

  if (prof?.banned) {
    await supabase.auth.signOut();
    return "/?error=banned";
  }
  if (!prof?.gender) return "/onboarding";

  const { count } = await admin
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (!count) return "/card/new";

  return "/board";
}
