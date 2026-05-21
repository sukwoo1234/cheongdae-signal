import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

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
