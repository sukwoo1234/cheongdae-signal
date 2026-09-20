import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext, isConfiguredAdminEmail } from "@/lib/auth";
import { requireAjaxRequest } from "@/lib/csrf";
import { isAllowedCJUEmail } from "@/lib/validation/email";

export async function GET() {
  const { user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { data, error } = await createAdminClient()
    .from("permanent_bans")
    .select("email, reason, created_at, expires_at")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  return NextResponse.json({ bans: data ?? [] });
}

export async function POST(req: Request) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;
  const { user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!isAllowedCJUEmail(email) || isConfiguredAdminEmail(email) || !reason || reason.length > 500) {
    return NextResponse.json({ error: "INVALID_BAN" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: userId, error } = await admin.rpc("add_permanent_ban", {
    p_email: email,
    p_reason: reason,
    p_actor: user.id,
  });
  if (error) return NextResponse.json({ error: "BAN_FAILED" }, { status: 500 });

  // DB 차단을 먼저 확정한다. 삭제가 실패해도 세션/RLS는 이미 차단되며 재시도 가능하다.
  if (userId) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) return NextResponse.json({ error: "AUTH_DELETE_FAILED" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;
  const { user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isAllowedCJUEmail(email) || isConfiguredAdminEmail(email)) {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }
  const { data: released, error } = await createAdminClient().rpc("release_permanent_ban", {
    p_email: email,
  });
  if (error) return NextResponse.json({ error: "RELEASE_FAILED" }, { status: 500 });
  if (!released) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
