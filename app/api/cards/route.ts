import { NextResponse } from "next/server";
import { getActiveUser, denialResponse } from "@/lib/auth";
import { validateOneLiner, validateInstagramId, validateColor } from "@/lib/validation/card";

export async function POST(req: Request) {
  const { supabase, user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");

  const body = await req.json().catch(() => ({}));

  const oneLiner = validateOneLiner(body.one_liner);
  if (oneLiner.error) return NextResponse.json({ error: oneLiner.error }, { status: 400 });

  const instagram = validateInstagramId(body.instagram_id);
  if (instagram.error) return NextResponse.json({ error: instagram.error }, { status: 400 });

  const color = validateColor(body.color);
  if (color.error) return NextResponse.json({ error: color.error }, { status: 400 });

  const { error, data } = await supabase
    .from("cards")
    .insert({
      user_id: user.id,
      one_liner: oneLiner.value,
      instagram_id: instagram.value,
      color: color.value,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "ALREADY_HAS_CARD" }, { status: 409 });
    }
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
