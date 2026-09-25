import { NextResponse } from "next/server";
import { denialResponse, getActiveUser } from "@/lib/auth";

interface GenderCounts {
  male: number;
  female: number;
}

export async function GET() {
  const { supabase, user, profile, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");

  // 공개 가능한 카드 집계는 반드시 RPC로 해야 한다. cards에는 RLS가 걸려 있어서
  // 사용자 컨텍스트의 단순 count와 보드 개방 판정이 달라질 수 있다.
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
    viewer_gender: profile?.gender ?? null,
    counts: { male, female },
    // 실제 접근 통제와 동일한 판정을 쓴다 (DB가 단일 기준).
    board_open: boardOpen === true && !cfg.force_locked,
    in_pregating: inPregating,
    in_postsession: inPostSession,
    time_to_end_seconds: Math.max(0, Math.floor((endsAt - now) / 1000)),
  });
}
