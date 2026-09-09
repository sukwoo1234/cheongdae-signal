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
    if (error.message.includes("ACCOUNT_NOT_ALLOWED")) {
      console.warn("[onboarding] rejected inactive session", { code: error.code ?? "UNKNOWN" });
      return NextResponse.json({ error: "SESSION_INVALID" }, { status: 401 });
    }
    // DB 세부 메시지나 사용자 식별자는 응답에 노출하지 않는다. 운영 로그에는
    // Supabase 오류 코드만 남겨 재발 시 원인을 추적할 수 있게 한다.
    console.error("[onboarding] RPC failed", { code: error.code ?? "UNKNOWN" });
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
