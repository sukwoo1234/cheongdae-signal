import { NextResponse } from "next/server";
import { getActiveUser, denialResponse } from "@/lib/auth";

export async function POST(req: Request) {
  const { supabase, user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");

  const { hidden } = await req.json().catch(() => ({}));
  const { error } = await supabase
    .from("cards")
    .update({ hidden_by_user: !!hidden })
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
