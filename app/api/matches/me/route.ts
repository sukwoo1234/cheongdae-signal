import { NextResponse } from "next/server";
import { getActiveUser, denialResponse } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const { supabase, user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");

  // 화면이 /end로 이동하거나 로그아웃되는 것에만 기대지 않는다.
  // 종료 직후에도 남아 있는 세션으로 이 API를 직접 호출할 수 있으므로
  // 서버에서 먼저 닫고, my_matches() 내부에서도 같은 경계를 다시 검사한다.
  const { data: config, error: configError } = await createAdminClient()
    .from("session_config")
    .select("starts_at, ends_at, purging")
    .eq("id", 1)
    .single();

  if (configError || !config) {
    return NextResponse.json({ error: "SESSION_CHECK_FAILED" }, { status: 500 });
  }

  const now = Date.now();
  if (config.purging || now >= new Date(config.ends_at).getTime()) {
    return NextResponse.json(
      { error: "SESSION_ENDED", matches: [], slot: null },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (now < new Date(config.starts_at).getTime()) {
    return NextResponse.json(
      { error: "SESSION_NOT_STARTED", matches: [], slot: null },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const [{ data, error }, { data: slotRows, error: slotError }] = await Promise.all([
    supabase.rpc("my_matches"),
    supabase.rpc("my_slot_state"),
  ]);
  if (error || slotError) return NextResponse.json({ error: "RPC_ERROR" }, { status: 500 });
  const slot = Array.isArray(slotRows) ? (slotRows[0] ?? null) : (slotRows ?? null);
  return NextResponse.json(
    { matches: data ?? [], slot },
    { headers: { "Cache-Control": "no-store" } },
  );
}
