import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  // RLS가 알아서 필터: 본인 카드 X / 같은 성별 X / hidden X / 본 카드 X / 종료·잠금 시 X
  const { data, error } = await supabase
    .from("cards")
    .select("id, one_liner, color");

  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });

  const shuffled = [...(data ?? [])].sort(() => Math.random() - 0.5);
  return NextResponse.json({ cards: shuffled });
}
