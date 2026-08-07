import { NextResponse } from "next/server";
import { getActiveUser, denialResponse } from "@/lib/auth";

export async function GET() {
  const { supabase, user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");

  // RLS가 필터링한다: 본인 카드 X / 같은 성별 X / hidden X / 이미 본 카드 X /
  // 보드 미개방(시간창·force_locked·임계점) X.
  // instagram_id는 컬럼 권한 자체가 없으므로 조회 목록에 넣을 수 없다.
  const { data, error } = await supabase
    .from("cards")
    .select("id, one_liner, color");

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
