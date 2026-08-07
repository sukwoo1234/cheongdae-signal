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

  // 물리 삭제하지 않는다. matches.viewed_card_id가 on delete cascade라
  // 카드를 지우면 그 카드를 이미 열람한 사람들의 매칭 기록까지 사라지고,
  // 부분 유니크 인덱스 점유가 풀려 그들의 슬롯이 되살아난다
  // (= 어그로 카드로 다수를 끌어들인 뒤 삭제를 유도하면 슬롯을 뿌릴 수 있다).
  // 보드에서 내리고 계정을 차단하는 것으로 모더레이션 목적은 달성된다.
  await admin.from("cards").update({ hidden_by_admin: true }).eq("id", id);
  await admin.from("banned_emails").upsert({ email, reason: "admin_card_delete" });
  await admin.from("users").update({ banned: true, banned_reason: "admin_card_delete" }).eq("id", card.user_id);
  await admin.auth.admin.signOut(card.user_id, "global").catch(() => {});
  return NextResponse.json({ ok: true });
}
