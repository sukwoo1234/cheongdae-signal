import { NextResponse } from "next/server";
import { getActiveUser, denialResponse } from "@/lib/auth";
import { requireAjaxRequest } from "@/lib/csrf";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;
  const { user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");

  const { hidden } = (await req.json().catch(() => null)) ?? {};
  if (typeof hidden !== "boolean") {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const { data, error } = await createAdminClient()
    .from("cards")
    .update({ hidden_by_user: hidden })
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "CARD_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
