import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/auth";
import { requireAjaxRequest } from "@/lib/csrf";

/** 카드만 물리 삭제한다. 사용자는 차단하지 않으며 행사 원장의 사용 횟수는 유지된다. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;

  const { user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await ctx.params;
  const admin = createAdminClient();
  // matches는 FK cascade로 함께 사라지지만, 선택 사용량은 별도의
  // private.event_participants 원장에 남아 선택 기회가 되살아나지 않는다.
  const { data: deleted, error: deleteError } = await admin
    .from("cards")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (deleteError) return NextResponse.json({ error: "DELETE_FAILED" }, { status: 500 });
  if (!deleted) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
