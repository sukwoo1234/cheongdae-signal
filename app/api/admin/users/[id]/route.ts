import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

// id는 email 또는 UUID (어드민 콘솔이 처음 lookup 시 email로 호출)
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await ctx.params;
  const decoded = decodeURIComponent(id);
  const admin = createAdminClient();
  const isEmail = decoded.includes("@");
  const query = admin.from("users").select("*");
  const { data: u } = isEmail
    ? await query.eq("email", decoded).single()
    : await query.eq("id", decoded).single();
  if (!u) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const { data: m } = await admin
    .from("matches")
    .select("id, bonus, viewed_card_id, cards!inner(one_liner)")
    .eq("viewer_user_id", u.id);

  const slotUsed = (m ?? []).some((x) => !x.bonus);
  const lastViewed = (m ?? []).find((x) => !x.bonus);

  return NextResponse.json({
    id: u.id,
    email: u.email,
    gender: u.gender,
    banned: u.banned,
    slot_used: slotUsed,
    viewed_card_oneliner: lastViewed ? (lastViewed.cards as unknown as { one_liner: string }).one_liner : null,
  });
}
