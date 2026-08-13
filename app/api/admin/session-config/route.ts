import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

/**
 * 예전에는 요청 본문을 그대로 update()에 넘겼다. 어드민 전용이라 권한 문제는 없지만,
 * 잘못된 값 하나가 보드를 영구히 잠글 수 있었다 (ends_at < starts_at, 음수 임계점 등).
 * 화이트리스트로 필드를 제한하고 값을 검증한다.
 */
const ALLOWED = [
  "starts_at",
  "ends_at",
  "threshold_male",
  "threshold_female",
  "force_locked",
  "max_views_per_card",
] as const;

function isValidTimestamp(v: unknown): v is string {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  for (const key of ALLOWED) {
    if (!(key in body)) continue;
    const v = body[key];

    switch (key) {
      case "starts_at":
      case "ends_at":
        if (!isValidTimestamp(v)) {
          return NextResponse.json({ error: "INVALID_TIMESTAMP" }, { status: 400 });
        }
        updates[key] = v;
        break;

      case "threshold_male":
      case "threshold_female":
        if (!Number.isInteger(v) || (v as number) < 1) {
          return NextResponse.json({ error: "INVALID_THRESHOLD" }, { status: 400 });
        }
        updates[key] = v;
        break;

      case "max_views_per_card":
        // null = 무제한
        if (v !== null && (!Number.isInteger(v) || (v as number) < 1)) {
          return NextResponse.json({ error: "INVALID_MAX_VIEWS" }, { status: 400 });
        }
        updates[key] = v;
        break;

      case "force_locked":
        if (typeof v !== "boolean") {
          return NextResponse.json({ error: "INVALID_LOCK" }, { status: 400 });
        }
        updates[key] = v;
        break;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "NO_CHANGES" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 시각은 둘 중 하나만 바뀌어도 순서가 뒤집힐 수 있으므로 현재 값과 합쳐서 검증한다.
  if (updates.starts_at || updates.ends_at) {
    const { data: cur } = await admin
      .from("session_config")
      .select("starts_at, ends_at")
      .eq("id", 1)
      .single();
    const starts = Date.parse((updates.starts_at as string) ?? cur?.starts_at);
    const ends = Date.parse((updates.ends_at as string) ?? cur?.ends_at);
    if (!(ends > starts)) {
      return NextResponse.json({ error: "ENDS_BEFORE_STARTS" }, { status: 400 });
    }
  }

  const { error } = await admin.from("session_config").update(updates).eq("id", 1);
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
