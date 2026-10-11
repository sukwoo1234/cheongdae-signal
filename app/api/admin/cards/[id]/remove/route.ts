import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/auth";
import { requireAjaxRequest } from "@/lib/csrf";
import { randomUUID } from "node:crypto";

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 참가자 계정을 삭제해 내보내되 차단하지 않아 같은 행사 재가입은 허용한다. */
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
  const token = randomUUID();
  const { data: targetUserId, error: acquireError } = await admin.rpc("acquire_event_admin_action", {
    p_expected_event_id: eventId, p_token: token, p_card_id: id,
  });
  if (acquireError?.message.includes("TARGET_NOT_FOUND")) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (acquireError?.message.includes("STALE_EVENT") ||
      acquireError?.message.includes("PURGE_IN_PROGRESS")) {
    return NextResponse.json({ error: "EVENT_CHANGED" }, { status: 409 });
  }
  if (acquireError || !targetUserId) {
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }

  try {
    // Hold the event lease through the external Auth deletion; a concurrent
    // purge cannot rotate the event and turn this into a next-event delete.
    const { error: deleteError } = await admin.auth.admin.deleteUser(targetUserId);
    if (deleteError) return NextResponse.json({ error: "DELETE_FAILED" }, { status: 500 });

    return NextResponse.json({ ok: true });
  } finally {
    await admin.rpc("release_event_admin_action", {
      p_expected_event_id: eventId, p_token: token,
    });
  }
}
