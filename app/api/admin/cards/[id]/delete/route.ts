import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/auth";
import { requireAjaxRequest } from "@/lib/csrf";
import { randomUUID } from "node:crypto";

export const maxDuration = 60;

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
    // The lease prevents event rotation across this DB ban and Auth deletion.
    const { error: ledgerBanError } = await admin.rpc("ban_event_participant", {
      p_user_id: targetUserId,
      p_reason: "admin_card_ban",
    });
    if (ledgerBanError) return NextResponse.json({ error: "MODERATION_FAILED" }, { status: 500 });

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(targetUserId);
    if (authDeleteError) return NextResponse.json({ error: "AUTH_DELETE_FAILED" }, { status: 502 });
    return NextResponse.json({ ok: true });
  } finally {
    await admin.rpc("release_event_admin_action", {
      p_expected_event_id: eventId, p_token: token,
    });
  }
}
