import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeInstagramId, isValidInstagramId } from "@/lib/validation/instagram";
import { containsProfanity } from "@/lib/validation/profanity";
import { containsPhoneNumber } from "@/lib/validation/phone";
import { ONELINER_MAX_LENGTH, POSTIT_COLORS, PostitColor } from "@/lib/constants";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { one_liner, instagram_id, color } = body;

  if (typeof one_liner !== "string" || one_liner.length === 0 || one_liner.length > ONELINER_MAX_LENGTH) {
    return NextResponse.json({ error: "INVALID_ONELINER" }, { status: 400 });
  }
  if (containsProfanity(one_liner)) {
    return NextResponse.json({ error: "PROFANITY_DETECTED" }, { status: 400 });
  }
  if (containsPhoneNumber(one_liner)) {
    return NextResponse.json({ error: "PHONE_DETECTED" }, { status: 400 });
  }

  const id = sanitizeInstagramId(instagram_id ?? "");
  if (!isValidInstagramId(id)) {
    return NextResponse.json({ error: "INVALID_INSTAGRAM_ID" }, { status: 400 });
  }

  if (!POSTIT_COLORS.includes(color as PostitColor)) {
    return NextResponse.json({ error: "INVALID_COLOR" }, { status: 400 });
  }

  const { error, data } = await supabase
    .from("cards")
    .insert({
      user_id: user.id,
      one_liner,
      instagram_id: id,
      color,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "ALREADY_HAS_CARD" }, { status: 409 });
    }
    return NextResponse.json({ error: "DB_ERROR", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
