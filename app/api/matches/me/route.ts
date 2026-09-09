import { NextResponse } from "next/server";
import { getActiveUser, denialResponse } from "@/lib/auth";

export async function GET() {
  const { supabase, user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");

  const [{ data, error }, { data: slotRows, error: slotError }] = await Promise.all([
    supabase.rpc("my_matches"),
    supabase.rpc("my_slot_state"),
  ]);
  if (error || slotError) return NextResponse.json({ error: "RPC_ERROR" }, { status: 500 });
  const slot = Array.isArray(slotRows) ? (slotRows[0] ?? null) : (slotRows ?? null);
  return NextResponse.json({ matches: data ?? [], slot });
}
