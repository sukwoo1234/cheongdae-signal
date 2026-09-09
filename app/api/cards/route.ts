import { NextResponse } from "next/server";
import { getActiveUser, denialResponse } from "@/lib/auth";
import { validateOneLiner, validateInstagramId, validateColor } from "@/lib/validation/card";
import { requireAjaxRequest } from "@/lib/csrf";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;
  const { user, profile, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");
  if (!profile?.gender) return NextResponse.json({ error: "ONBOARDING_INCOMPLETE" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  const oneLiner = validateOneLiner(body.one_liner);
  if (oneLiner.error) return NextResponse.json({ error: oneLiner.error }, { status: 400 });

  const instagram = validateInstagramId(body.instagram_id);
  if (instagram.error) return NextResponse.json({ error: instagram.error }, { status: 400 });

  const color = validateColor(body.color);
  if (color.error) return NextResponse.json({ error: color.error }, { status: 400 });

  // authenticated 역할의 직접 쓰기 권한은 회수한다. 검증을 통과한 서버만
  // service_role로 쓰며 user_id는 요청 body가 아닌 검증된 세션에서 고정한다.
  const { error, data } = await createAdminClient()
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
