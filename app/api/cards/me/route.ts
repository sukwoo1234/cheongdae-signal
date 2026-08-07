import { NextResponse } from "next/server";
import { getActiveUser, denialResponse } from "@/lib/auth";
import { validateOneLiner, validateInstagramId, validateColor } from "@/lib/validation/card";

export async function GET() {
  const { supabase, user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");

  // cards.instagram_id는 이제 컬럼 단위로 SELECT 권한이 없다.
  // 본인 인스타 ID는 SECURITY DEFINER RPC를 통해서만 받는다.
  const { data, error } = await supabase.rpc("my_card");
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });

  const card = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
  return NextResponse.json({ card });
}

export async function PATCH(req: Request) {
  const { supabase, user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  // 생성(POST)과 동일한 검증을 적용한다. 예전에는 여기가 타입 체크뿐이라
  // 깨끗한 카드를 만든 뒤 PATCH로 욕설·전화번호를 넣을 수 있었다.
  if (body.one_liner !== undefined) {
    const r = validateOneLiner(body.one_liner);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    updates.one_liner = r.value;
  }
  if (body.instagram_id !== undefined) {
    const r = validateInstagramId(body.instagram_id);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    updates.instagram_id = r.value;
  }
  if (body.color !== undefined) {
    const r = validateColor(body.color);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    updates.color = r.value;
  }
  if (typeof body.hidden_by_user === "boolean") {
    updates.hidden_by_user = body.hidden_by_user;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "NO_CHANGES" }, { status: 400 });
  }

  const { error } = await supabase.from("cards").update(updates).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
