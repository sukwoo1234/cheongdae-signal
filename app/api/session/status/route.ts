import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 종료 화면은 세션을 즉시 폐기한 뒤에도 운영 시간 연장을 감지해야 한다.
 * 전체 설정과 참가자 수는 공개하지 않고 종료 여부 하나만 반환한다.
 */
export async function GET() {
  const { data, error } = await createAdminClient()
    .from("session_config")
    .select("ends_at")
    .eq("id", 1)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "NO_CONFIG" }, { status: 500 });
  }

  return NextResponse.json(
    { in_postsession: Date.now() >= new Date(data.ends_at).getTime() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
