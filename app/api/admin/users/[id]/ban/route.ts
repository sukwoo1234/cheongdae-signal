import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await ctx.params;
  const admin = createAdminClient();
  const { data: u } = await admin.from("users").select("email").eq("id", id).single();
  if (!u) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  await admin.from("users").update({ banned: true, banned_reason: "admin_ban" }).eq("id", id);
  await admin.from("banned_emails").upsert({ email: u.email, reason: "admin_ban" });
  await admin.from("cards").delete().eq("user_id", id);
  return NextResponse.json({ ok: true });
}
