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
    { data: participantCounts, error: participantCountsError },
    { data: cfg, error: configError },
    { data: boardOpen, error: boardOpenError },
    { count: completedCards, error: cardsError },
  ] = await Promise.all([
    admin.rpc("gender_counts").single(),
    admin.rpc("admin_event_match_count"),
    admin.rpc("event_purge_status").single(),
    admin.from("session_config").select("*").eq("id", 1).single(),
    admin.rpc("board_is_open"),
    admin.from("cards").select("id", { count: "exact", head: true }),
  ]);

  if (countsError || matchesError || participantCountsError || configError || boardOpenError || cardsError || !participantCounts || !cfg) {
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }

  const cardCounts = (counts ?? { male: 0, female: 0 }) as { male: number; female: number };
  const users = participantCounts as { participants: number; users: number };
  const completed = completedCards ?? 0;
  let seasonConsent = null;
  if (cfg.continuous_mode) {
    const { data, error } = await admin.rpc("admin_season_summary").single();
    if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
    seasonConsent = data;
  }

  return NextResponse.json({
    male: cardCounts.male ?? 0,
    female: cardCounts.female ?? 0,
    matches: cumulativeMatches ?? 0,
    users: {
      cumulative: users.participants,
      completed,
      incomplete: Math.max(users.participants - completed, 0),
    },
    retained_accounts: users.users,
    season_consent: seasonConsent,
    board_open: boardOpen === true,
    config: cfg,
  });
}
