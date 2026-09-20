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
  const body = await req.json().catch(() => ({}));
  if (typeof body.hidden !== "boolean") {
    return NextResponse.json({ error: "INVALID_HIDDEN" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.from("cards")
    .update({ hidden_by_admin: body.hidden })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
