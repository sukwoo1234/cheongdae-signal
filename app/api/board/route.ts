import { NextResponse } from "next/server";
import { getActiveUser, denialResponse } from "@/lib/auth";

export async function GET(req: Request) {
  const { supabase, user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");

  const requestedGender = new URL(req.url).searchParams.get("gender");
  if (requestedGender !== null && requestedGender !== "M" && requestedGender !== "F") {
    return NextResponse.json({ error: "INVALID_TARGET_GENDER" }, { status: 400 });
  }

  // 교차 사용자 카드 목록은 테이블 SELECT가 아니라 보안 경계를 가진 RPC로만 읽는다.
  // opposite 모드에서는 요청 값을 무시하고 이성 카드만, selectable 모드에서는
  // 관리자가 허용한 남/여 보드 중 요청한 보드만 반환한다.
  const { data, error } = await supabase.rpc("board_cards", {
    p_target_gender: requestedGender,
  });

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
