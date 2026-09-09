import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/auth";

// id는 email 또는 UUID (어드민 콘솔이 처음 lookup 시 email로 호출)
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

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

  const { data: slotRows, error: slotError } = await admin.rpc("admin_event_participant_state", {
    p_user_id: u.id,
  });
  if (slotError) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  const slot = Array.isArray(slotRows) ? slotRows[0] : slotRows;
  const lastViewed = (m ?? [])[0];

  return NextResponse.json({
    id: u.id,
    email: u.email,
    gender: u.gender,
    banned: u.banned,
    slot_used: (slot?.used ?? 0) > 0,
    allowance: slot?.allowance ?? 0,
    used: slot?.used ?? 0,
    remaining: slot?.remaining ?? 0,
    viewed_card_oneliner: lastViewed ? (lastViewed.cards as unknown as { one_liner: string }).one_liner : null,
  });
}
