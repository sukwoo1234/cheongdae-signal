import { NextResponse } from "next/server";
import { getActiveUser, denialResponse } from "@/lib/auth";

const KNOWN_ERRORS = [
  "SLOT_ALREADY_USED",
  "BOARD_CLOSED",
  "CARD_HIDDEN",
  "SAME_GENDER",
  "CARD_NOT_FOUND",
  "CANNOT_VIEW_OWN_CARD",
  "NOT_AUTHENTICATED",
  "ONBOARDING_INCOMPLETE",
  "NO_CARD",
  "BANNED",
];

export async function POST(req: Request) {
  const { supabase, user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");

  const { card_id } = await req.json().catch(() => ({}));
  if (typeof card_id !== "string" || !card_id) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  // 모든 검증(차단·보드 개방·성별·숨김·슬롯 잔여)은 RPC 안에서 이뤄진다.
  // matches에 대한 직접 INSERT 권한은 회수됐으므로 이 경로가 유일하다.
  const { data, error } = await supabase.rpc("consume_slot_and_reveal", {
    target_card_id: card_id,
  });

  if (error) {
    const code = KNOWN_ERRORS.find((k) => error.message.includes(k)) || "RPC_ERROR";
    return NextResponse.json({ error: code }, { status: 400 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.instagram_id) {
    return NextResponse.json({ error: "RPC_ERROR" }, { status: 500 });
  }
  return NextResponse.json({ instagram_id: row.instagram_id });
}
