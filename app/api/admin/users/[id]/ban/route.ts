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

  // 카드는 물리 삭제하지 않는다. matches.viewed_card_id가 on delete cascade라
  // 카드를 지우면 "그 카드를 본 사람들"의 매칭 기록까지 사라지고,
  // 부분 유니크 인덱스 점유가 풀려 그들의 슬롯이 되살아난다.
  await admin.from("cards").update({ hidden_by_admin: true }).eq("user_id", id);

  // 플래그만 세우면 이미 로그인해 있는 브라우저는 그대로 활동한다.
  // refresh token까지 전역 폐기해야 실제로 차단된다.
  await admin.auth.admin.signOut(id, "global").catch(() => {});

  return NextResponse.json({ ok: true });
}
