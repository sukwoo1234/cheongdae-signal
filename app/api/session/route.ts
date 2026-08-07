import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface GenderCounts {
  male: number;
  female: number;
}

export async function GET() {
  const supabase = await createClient();

  // 인원 집계는 반드시 RPC로 해야 한다. users에는 "본인 행만" RLS가 걸려 있어서
  // 사용자 컨텍스트로 count하면 항상 자기 자신 1명(또는 0명)만 세어진다.
  const [{ data: cfg }, { data: counts }, { data: boardOpen }] = await Promise.all([
    supabase.from("session_config").select("*").eq("id", 1).single(),
    supabase.rpc("gender_counts").single(),
    supabase.rpc("board_is_open"),
  ]);

  if (!cfg) return NextResponse.json({ error: "NO_CONFIG" }, { status: 500 });

  const c = (counts ?? { male: 0, female: 0 }) as GenderCounts;
  const male = c.male ?? 0;
  const female = c.female ?? 0;

  const now = Date.now();
  const startsAt = new Date(cfg.starts_at).getTime();
  const endsAt = new Date(cfg.ends_at).getTime();

  const thresholdMet = male >= cfg.threshold_male && female >= cfg.threshold_female;
  const inPregating = now < startsAt || !thresholdMet;
  const inPostSession = now >= endsAt;

  return NextResponse.json({
    config: cfg,
    counts: { male, female },
    // 실제 접근 통제와 동일한 판정을 쓴다 (DB가 단일 기준).
    board_open: boardOpen === true && !cfg.force_locked,
    in_pregating: inPregating,
    in_postsession: inPostSession,
    time_to_end_seconds: Math.max(0, Math.floor((endsAt - now) / 1000)),
  });
}
