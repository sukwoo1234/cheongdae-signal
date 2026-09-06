import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/auth";

export async function GET() {
  const { user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const admin = createAdminClient();

  const [
    { count: m },
    { count: f },
    { count: matches },
    { data: cfg },
  ] = await Promise.all([
    admin.from("users").select("id", { count: "exact", head: true }).eq("gender", "M"),
    admin.from("users").select("id", { count: "exact", head: true }).eq("gender", "F"),
    admin.from("matches").select("id", { count: "exact", head: true }).eq("bonus", false),
    admin.from("session_config").select("*").eq("id", 1).single(),
  ]);

  return NextResponse.json({
    male: m ?? 0,
    female: f ?? 0,
    matches: matches ?? 0,
    config: cfg,
  });
}
