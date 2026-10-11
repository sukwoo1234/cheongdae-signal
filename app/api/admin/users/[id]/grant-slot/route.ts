import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/auth";
import { requireAjaxRequest } from "@/lib/csrf";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;
  const { user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const eventId = body && typeof body === "object" && !Array.isArray(body)
    ? body.expected_event_id : null;
  if (typeof eventId !== "string" || !UUID.test(eventId) || !UUID.test(id)) {
    return NextResponse.json({ error: "INVALID_EVENT_ID" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 사용 기록은 보존하고 allowance만 늘린다. 남은 기회가 이미 있으면
  // 재전송/연속 클릭으로 중복 지급하지 않는다.
  const { error } = await admin.rpc("grant_event_slot_for_event", {
    p_expected_event_id: eventId, p_user_id: id,
  });
  if (error?.message.includes("STALE_EVENT") ||
      error?.message.includes("PURGE_IN_PROGRESS")) {
    return NextResponse.json({ error: "EVENT_CHANGED" }, { status: 409 });
  }
  if (error?.message.includes("PARTICIPANT_NOT_FOUND")) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
