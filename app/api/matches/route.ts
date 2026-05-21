import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { card_id } = await req.json().catch(() => ({}));
  if (!card_id) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const { data, error } = await supabase.rpc("consume_slot_and_reveal", {
    target_card_id: card_id,
  });

  if (error) {
    const knownErrors = [
      "SLOT_ALREADY_USED", "BOARD_CLOSED", "CARD_HIDDEN", "SAME_GENDER",
      "CARD_NOT_FOUND", "CANNOT_VIEW_OWN_CARD", "NOT_AUTHENTICATED", "ONBOARDING_INCOMPLETE",
    ];
    const code = knownErrors.find((k) => error.message.includes(k)) || "RPC_ERROR";
    return NextResponse.json({ error: code }, { status: 400 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ instagram_id: row.instagram_id });
}
