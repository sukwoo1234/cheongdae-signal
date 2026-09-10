import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/auth";
import { requireAjaxRequest } from "@/lib/csrf";

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
    .single();
  if (cardError) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  if (!card) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // 먼저 행사 원장과 이메일을 차단한다. 이후 Auth 계정을 삭제해도 이 원장은
  // 행사 폐기 전까지 남으므로 같은 이메일의 재가입을 계속 거부할 수 있다.
  const { error: ledgerBanError } = await admin.rpc("ban_event_participant", {
    p_user_id: card.user_id,
    p_reason: "admin_card_ban",
  });
  if (ledgerBanError) return NextResponse.json({ error: "MODERATION_FAILED" }, { status: 500 });

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(card.user_id);
  if (authDeleteError) return NextResponse.json({ error: "AUTH_DELETE_FAILED" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
