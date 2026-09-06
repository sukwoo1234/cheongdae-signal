import { NextResponse } from "next/server";
import { getActiveUser, denialResponse } from "@/lib/auth";
import { requireAjaxRequest } from "@/lib/csrf";

export async function POST(req: Request) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;
  const { supabase, user, denial } = await getActiveUser();
  if (denial) return denialResponse(denial);
  if (!user) return denialResponse("UNAUTHENTICATED");

  const { gender, terms, privacy } = await req.json().catch(() => ({}));

  if (!["M", "F"].includes(gender)) {
    return NextResponse.json({ error: "INVALID_GENDER" }, { status: 400 });
  }
  if (terms !== true || privacy !== true) {
    return NextResponse.json({ error: "TERMS_REQUIRED" }, { status: 400 });
  }

  // users 테이블에 대한 직접 UPDATE 권한은 회수됐다.
  // 이 RPC는 gender가 아직 null일 때만 통과하므로 성별 변경이 DB에서 1회로 강제된다.
  const { error } = await supabase.rpc("complete_onboarding", {
    p_gender: gender,
    p_terms_accepted: terms,
    p_privacy_accepted: privacy,
  });

  if (error) {
    if (error.message.includes("GENDER_ALREADY_SET")) {
      return NextResponse.json({ error: "GENDER_ALREADY_SET" }, { status: 409 });
    }
    if (error.message.includes("CONSENT_REQUIRED")) {
      return NextResponse.json({ error: "TERMS_REQUIRED" }, { status: 400 });
    }
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
