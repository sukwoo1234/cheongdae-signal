import { NextResponse } from "next/server";
import { getActiveUser, denialResponse } from "@/lib/auth";

export async function GET() {
  const { supabase, user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");

  // RLS가 필터링한다: 같은 성별 X / hidden X / 이미 본 카드 X /
  // 보드 미개방(시간창·force_locked·임계점) X.
  // instagram_id는 컬럼 권한 자체가 없으므로 조회 목록에 넣을 수 없다.
  //
  // 본인 카드만은 앱에서 제외해야 한다. RLS 정책 두 개(cards_self_all,
  // cards_opposite_gender_select)는 OR로 합쳐지고, cards_self_all이 본인 행의
  // SELECT를 허용한다 — 카드 등록 직후 insert().select()가 동작하려면 필요한
  // 권한이라 정책에서 뺄 수 없다. 그래서 보드 목록에서만 걸러낸다.
  const { data, error } = await supabase
    .from("cards")
    .select("id, one_liner, color")
    .neq("user_id", user.id);

  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });

  // Fisher-Yates. sort(() => Math.random() - 0.5)는 균등하지 않아
  // 특정 카드가 앞쪽에 몰리는 편향이 생긴다.
  const cards = [...(data ?? [])];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  return NextResponse.json({ cards });
}
