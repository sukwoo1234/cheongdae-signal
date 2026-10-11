import { NextResponse } from "next/server";
import { getActiveUser, denialResponse } from "@/lib/auth";
import { requireAjaxRequest } from "@/lib/csrf";
import { createAdminClient } from "@/lib/supabase/admin";
import { cardWriteErrorResponse, expectedCardEventId } from "@/lib/card-event-write";

export async function POST(req: Request) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;
  const { user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");

  const { hidden, expected_event_id } = (await req.json().catch(() => null)) ?? {};
  const expectedEventId = expectedCardEventId(expected_event_id);
  if (!expectedEventId) return NextResponse.json({ error: "EVENT_CHANGED" }, { status: 409 });
  if (typeof hidden !== "boolean") {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const { error } = await createAdminClient().rpc("update_event_card", {
    p_expected_event_id: expectedEventId,
    p_user_id: user.id,
    p_one_liner: null,
    p_instagram_id: null,
    p_contact_type: null,
    p_color: null,
    p_hidden_by_user: hidden,
  });
  if (error) return cardWriteErrorResponse(error);
  return NextResponse.json({ ok: true });
}
