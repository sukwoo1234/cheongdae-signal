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
  const { data: u, error: userError } = await admin.from("users").select("id").eq("id", id).single();
  if (userError) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  if (!u) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  // 원장 차단·프로필 차단·이메일 차단·카드 숨김을 DB 트랜잭션 하나로 처리한다.
  const { error: ledgerBanError } = await admin.rpc("ban_event_participant", {
    p_user_id: id,
    p_reason: "admin_ban",
  });
  if (ledgerBanError) return NextResponse.json({ error: "BAN_FAILED" }, { status: 500 });

  // 이메일·행사 원장을 먼저 차단한 뒤 계정을 삭제한다. 이미 발급된 토큰은
  // 프로필 삭제와 원장 차단 양쪽에서 즉시 거부되고 같은 이메일 재가입도 막힌다.
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(id);
  if (authDeleteError) return NextResponse.json({ error: "AUTH_DELETE_FAILED" }, { status: 502 });

  return NextResponse.json({ ok: true });
}
