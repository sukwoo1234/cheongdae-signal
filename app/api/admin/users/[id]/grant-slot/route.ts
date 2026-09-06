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

  // 기존 슬롯 사용을 bonus로 변환 → 새 1회 사용 가능
  const { error } = await admin
    .from("matches")
    .update({ bonus: true })
    .eq("viewer_user_id", id)
    .eq("bonus", false);
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
