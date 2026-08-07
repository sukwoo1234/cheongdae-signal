import { NextResponse } from "next/server";
import { getActiveUser, denialResponse } from "@/lib/auth";

export async function GET() {
  const { supabase, user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");

  const { data, error } = await supabase.rpc("my_matches");
  if (error) return NextResponse.json({ error: "RPC_ERROR" }, { status: 500 });
  return NextResponse.json({ matches: data ?? [] });
}
