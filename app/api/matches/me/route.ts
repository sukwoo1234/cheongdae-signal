import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { data, error } = await supabase.rpc("my_matches");
  if (error) return NextResponse.json({ error: "RPC_ERROR" }, { status: 500 });
  return NextResponse.json({ matches: data ?? [] });
}
