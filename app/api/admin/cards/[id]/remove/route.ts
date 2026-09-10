import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/auth";
import { requireAjaxRequest } from "@/lib/csrf";

/** 참가자 계정을 삭제해 내보내되 차단하지 않아 같은 행사 재가입은 허용한다. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;

  const { user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await ctx.params;
  const admin = createAdminClient();
  const { data: card, error: cardError } = await admin
    .from("cards")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();
  if (cardError) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  if (!card) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Auth 계정을 기준으로 profile/card/matches가 cascade 삭제된다. 행사 원장은
  // current_user_id만 null이 되고 allowance/used는 남아 재가입 시 기회가 초기화되지 않는다.
  const { error: deleteError } = await admin.auth.admin.deleteUser(card.user_id);
  if (deleteError) return NextResponse.json({ error: "DELETE_FAILED" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
