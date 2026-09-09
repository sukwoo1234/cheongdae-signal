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
  const { data: target, error: targetError } = await admin
    .from("users")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (targetError) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  if (!target) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // 사용 기록은 보존하고 allowance만 늘린다. 남은 기회가 이미 있으면
  // 재전송/연속 클릭으로 중복 지급하지 않는다.
  const { error } = await admin.rpc("grant_event_slot", { p_user_id: id });
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
