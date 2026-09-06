import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveUser, denialResponse } from "@/lib/auth";
import { requireAjaxRequest } from "@/lib/csrf";

export async function DELETE(req: Request) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;
  const { supabase, user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");

  const admin = createAdminClient();
  // auth.users 삭제가 public.users/cards/matches의 FK cascade를 시작하는
  // 기준점이다. 각 단계의 오류를 확인하지 않으면 계정은 남아 있는데
  // 프로필만 사라지는 부분 삭제를 성공으로 오인할 수 있다.
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(user.id);
  if (authDeleteError) {
    return NextResponse.json({ error: "DELETE_FAILED" }, { status: 500 });
  }

  // 정상적으로는 FK cascade로 없어져야 한다. 마이그레이션/스키마가 다른
  // 환경에서도 개인정보가 남지 않도록 잔여 profile을 확인하고 정리한다.
  const { data: lingeringUser, error: checkError } = await admin
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (checkError) {
    return NextResponse.json({ error: "DELETE_INCOMPLETE" }, { status: 500 });
  }
  if (lingeringUser) {
    const { error: profileDeleteError } = await admin
      .from("users")
      .delete()
      .eq("id", user.id);
    if (profileDeleteError) {
      return NextResponse.json({ error: "DELETE_INCOMPLETE" }, { status: 500 });
    }
  }

  await supabase.auth.signOut().catch(() => {});
  return NextResponse.json({ ok: true });
}
