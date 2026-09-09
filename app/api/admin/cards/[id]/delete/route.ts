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

  const { data: card, error: cardError } = await admin
    .from("cards")
    .select("user_id")
    .eq("id", id)
    .single();
  if (cardError) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  if (!card) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // 물리 삭제하지 않는다. matches.viewed_card_id가 on delete cascade라
  // 카드를 지우면 그 카드를 이미 열람한 사람들의 매칭 기록까지 사라지고,
  // 부분 유니크 인덱스 점유가 풀려 그들의 슬롯이 되살아난다
  // (= 어그로 카드로 다수를 끌어들인 뒤 삭제를 유도하면 슬롯을 뿌릴 수 있다).
  // 보드에서 내리고 계정을 차단하는 것으로 모더레이션 목적은 달성된다.
  // 관련 DB 변경을 원자적으로 적용해 중간 실패가 부분 차단을 만들지 않게 한다.
  const { error: ledgerBanError } = await admin.rpc("ban_event_participant", {
    p_user_id: card.user_id,
    p_reason: "admin_card_delete",
  });
  if (ledgerBanError) return NextResponse.json({ error: "MODERATION_FAILED" }, { status: 500 });

  const { error: authBanError } = await admin.auth.admin.updateUserById(card.user_id, {
    ban_duration: "876000h",
  });
  if (authBanError) return NextResponse.json({ error: "AUTH_BAN_FAILED" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
