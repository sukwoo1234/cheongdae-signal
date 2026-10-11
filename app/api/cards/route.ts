import { NextResponse } from "next/server";
import { getActiveUser, denialResponse } from "@/lib/auth";
import { validateOneLiner, validateContactType, validateContactValue, validateColor } from "@/lib/validation/card";
import { requireAjaxRequest } from "@/lib/csrf";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSeasonConsent } from "@/lib/season-consent";
import { cardWriteErrorResponse, expectedCardEventId } from "@/lib/card-event-write";

export async function POST(req: Request) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;
  const { supabase, user, profile, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");
  if (!profile?.gender) return NextResponse.json({ error: "ONBOARDING_INCOMPLETE" }, { status: 403 });

  const body = (await req.json().catch(() => null)) ?? {};
  const expectedEventId = expectedCardEventId(body.expected_event_id);
  if (!expectedEventId) return NextResponse.json({ error: "EVENT_CHANGED" }, { status: 409 });

  const oneLiner = validateOneLiner(body.one_liner);
  if (oneLiner.error) return NextResponse.json({ error: oneLiner.error }, { status: 400 });

  const contactType = validateContactType(body.contact_type);
  if (contactType.error) return NextResponse.json({ error: contactType.error }, { status: 400 });

  const contact = validateContactValue(body.instagram_id, contactType.value);
  if (contact.error) return NextResponse.json({ error: contact.error }, { status: 400 });

  const color = validateColor(body.color);
  if (color.error) return NextResponse.json({ error: color.error }, { status: 400 });

  const { data: seasonRows, error: seasonError } = await supabase.rpc("my_season_state");
  const season = Array.isArray(seasonRows) ? seasonRows[0] : seasonRows;
  if (seasonError || !season) return NextResponse.json({ error: "SEASON_UNAVAILABLE" }, { status: 503 });
  if (season.event_id !== expectedEventId) {
    return NextResponse.json({ error: "EVENT_CHANGED" }, { status: 409 });
  }
  if (new Date(season.ends_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "SESSION_ENDED" }, { status: 410 });
  }
  if (season.continuous_mode && (!season.accepted || body.season_consent !== undefined)) {
    const consent = parseSeasonConsent(body.season_consent);
    if (!consent) return NextResponse.json({ error: "SEASON_CONSENT_REQUIRED" }, { status: 400 });
    if (consent.event_id !== expectedEventId) {
      return NextResponse.json({ error: "EVENT_CHANGED" }, { status: 409 });
    }
    const { error } = await supabase.rpc("accept_current_season", {
      p_event_id: consent.event_id, p_ends_at: consent.ends_at, p_board_mode: consent.board_mode,
    });
    if (error) return NextResponse.json({ error: "SEASON_CHANGED" }, { status: 409 });
    // Consent reflects the explicit form submission, even if a later card write fails.
    // Never infer acceptance from merely visiting a page or fetching season state.
  }

  // authenticated 역할의 직접 쓰기 권한은 회수한다. 검증을 통과한 서버만
  // service_role로 쓰며 user_id는 요청 body가 아닌 검증된 세션에서 고정한다.
  const { error, data } = await createAdminClient().rpc("create_event_card", {
    p_expected_event_id: expectedEventId,
    p_user_id: user.id,
    p_one_liner: oneLiner.value,
    p_instagram_id: contact.value,
    p_contact_type: contactType.value,
    p_color: color.value,
  });
  if (error) return cardWriteErrorResponse(error);
  return NextResponse.json({ ok: true, id: data });
}
