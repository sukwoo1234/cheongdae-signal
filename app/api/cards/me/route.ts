import { NextResponse } from "next/server";
import { getActiveUser, denialResponse } from "@/lib/auth";
import { validateOneLiner, validateContactType, validateContactValue, validateColor } from "@/lib/validation/card";
import { requireAjaxRequest } from "@/lib/csrf";
import { createAdminClient } from "@/lib/supabase/admin";
import { cardWriteErrorResponse, expectedCardEventId } from "@/lib/card-event-write";

export async function GET() {
  const { supabase, user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");

  // Capture the event before reading the card. A rotation between these reads
  // can only pair an old event with a new card, whose later write is rejected.
  const { data: seasonRows, error: seasonError } = await supabase.rpc("my_season_state");
  const season = Array.isArray(seasonRows) ? seasonRows[0] : seasonRows;
  if (seasonError || !season) return NextResponse.json({ error: "SEASON_UNAVAILABLE" }, { status: 503 });

  // cards.instagram_id는 이제 컬럼 단위로 SELECT 권한이 없다.
  // 본인이 등록한 연락처는 SECURITY DEFINER RPC를 통해서만 받는다.
  const { data, error } = await supabase.rpc("my_card");
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });

  const card = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
  return NextResponse.json({ card, event_id: season.event_id });
}

export async function PATCH(req: Request) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;
  const { user, profile, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");
  if (!profile?.gender) return NextResponse.json({ error: "ONBOARDING_INCOMPLETE" }, { status: 403 });

  const body = (await req.json().catch(() => null)) ?? {};
  const expectedEventId = expectedCardEventId(body.expected_event_id);
  if (!expectedEventId) return NextResponse.json({ error: "EVENT_CHANGED" }, { status: 409 });
  const updates: Record<string, unknown> = {};

  // 생성(POST)과 동일한 검증을 적용한다. 예전에는 여기가 타입 체크뿐이라
  // 깨끗한 카드를 만든 뒤 PATCH로 욕설·전화번호를 넣을 수 있었다.
  if (body.one_liner !== undefined) {
    const r = validateOneLiner(body.one_liner);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    updates.one_liner = r.value;
  }
  if (body.instagram_id !== undefined || body.contact_type !== undefined) {
    const type = validateContactType(body.contact_type);
    if (type.error) return NextResponse.json({ error: type.error }, { status: 400 });
    const r = validateContactValue(body.instagram_id, type.value);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    updates.instagram_id = r.value;
    updates.contact_type = type.value;
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

  const { error } = await createAdminClient().rpc("update_event_card", {
    p_expected_event_id: expectedEventId,
    p_user_id: user.id,
    p_one_liner: updates.one_liner ?? null,
    p_instagram_id: updates.instagram_id ?? null,
    p_contact_type: updates.contact_type ?? null,
    p_color: updates.color ?? null,
    p_hidden_by_user: updates.hidden_by_user ?? null,
  });
  if (error) return cardWriteErrorResponse(error);
  return NextResponse.json({ ok: true });
}
