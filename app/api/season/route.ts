import { NextResponse } from "next/server";
import { getActiveUser, denialResponse } from "@/lib/auth";
import { requireAjaxRequest } from "@/lib/csrf";
import { parseSeasonConsent } from "@/lib/season-consent";

export async function GET() {
  const { supabase, user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");
  const { data, error } = await supabase.rpc("my_season_state");
  const season = Array.isArray(data) ? data[0] : data;
  if (error || !season) return NextResponse.json({ error: "SEASON_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ season }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;
  const { supabase, user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");
  const body = parseSeasonConsent(await req.json().catch(() => null));
  if (!body) {
    return NextResponse.json({ error: "INVALID_CONSENT" }, { status: 400 });
  }
  // Bind consent to exactly the period and audience the participant was shown.
  const { error } = await supabase.rpc("accept_current_season", {
    p_event_id: body.event_id, p_ends_at: body.ends_at, p_board_mode: body.board_mode,
  });
  if (error) return NextResponse.json({ error: "SEASON_CHANGED" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
