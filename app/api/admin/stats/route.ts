import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/auth";

export async function GET() {
  const { user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const admin = createAdminClient();

  const [
    { data: counts },
    { count: matches },
    { data: cfg },
  ] = await Promise.all([
    admin.rpc("gender_counts").single(),
    admin.from("matches").select("id", { count: "exact", head: true }),
    admin.from("session_config").select("*").eq("id", 1).single(),
  ]);

  const cardCounts = (counts ?? { male: 0, female: 0 }) as { male: number; female: number };

  return NextResponse.json({
    male: cardCounts.male ?? 0,
    female: cardCounts.female ?? 0,
    matches: matches ?? 0,
    config: cfg,
  });
}
