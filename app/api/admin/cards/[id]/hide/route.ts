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
  const { error } = await admin.from("cards").update({ hidden_by_admin: true }).eq("id", id);
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
