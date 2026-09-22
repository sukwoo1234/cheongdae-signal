import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/auth";

export async function GET() {
  const { user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const admin = createAdminClient();

  const [
    { data: counts, error: countsError },
    { data: cumulativeMatches, error: matchesError },
    { data: cfg, error: configError },
  ] = await Promise.all([
    admin.rpc("gender_counts").single(),
    admin.rpc("admin_event_match_count"),
    admin.from("session_config").select("*").eq("id", 1).single(),
  ]);

  if (countsError || matchesError || configError || !cfg) {
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }

  const cardCounts = (counts ?? { male: 0, female: 0 }) as { male: number; female: number };

  return NextResponse.json({
    male: cardCounts.male ?? 0,
    female: cardCounts.female ?? 0,
    matches: cumulativeMatches ?? 0,
    config: cfg,
  });
}
