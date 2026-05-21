import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const [{ data: cfg }, { count: maleCount }, { count: femaleCount }] = await Promise.all([
    supabase.from("session_config").select("*").eq("id", 1).single(),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("gender", "M"),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("gender", "F"),
  ]);

  if (!cfg) return NextResponse.json({ error: "NO_CONFIG" }, { status: 500 });

  const now = Date.now();
  const startsAt = new Date(cfg.starts_at).getTime();
  const endsAt = new Date(cfg.ends_at).getTime();

  const thresholdMet =
    (maleCount ?? 0) >= cfg.threshold_male && (femaleCount ?? 0) >= cfg.threshold_female;
  const inPregating = now < startsAt || !thresholdMet;
  const inPostSession = now >= endsAt;
  const board_open = !cfg.force_locked && !inPregating && !inPostSession;

  return NextResponse.json({
    config: cfg,
    counts: { male: maleCount ?? 0, female: femaleCount ?? 0 },
    board_open,
    in_pregating: inPregating,
    in_postsession: inPostSession,
    time_to_end_seconds: Math.max(0, Math.floor((endsAt - now) / 1000)),
  });
}
