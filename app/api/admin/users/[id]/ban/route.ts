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

  // admin.signOut은 UUID가 아니라 사용자 JWT를 요구한다. 계정 자체를 Auth에서
  // ban하고, 이미 발급된 access token은 DB의 banned 검사로 즉시 거부한다.
  const { error: authBanError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: "876000h",
  });
  if (authBanError) return NextResponse.json({ error: "AUTH_BAN_FAILED" }, { status: 502 });

  return NextResponse.json({ ok: true });
}
