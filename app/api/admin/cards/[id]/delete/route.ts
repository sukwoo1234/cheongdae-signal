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

  const { data: card } = await admin
    .from("cards")
    .select("user_id, users!inner(email)")
    .eq("id", id)
    .single();
  if (!card) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const email = (card.users as unknown as { email: string }).email;

  await admin.from("cards").delete().eq("id", id);
  await admin.from("banned_emails").upsert({ email, reason: "admin_card_delete" });
  await admin.from("users").update({ banned: true, banned_reason: "admin_card_delete" }).eq("id", card.user_id);
  return NextResponse.json({ ok: true });
}
