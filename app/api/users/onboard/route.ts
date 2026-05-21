import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { gender, terms, privacy } = await req.json().catch(() => ({}));

  if (!["M", "F"].includes(gender)) {
    return NextResponse.json({ error: "INVALID_GENDER" }, { status: 400 });
  }
  if (!terms || !privacy) {
    return NextResponse.json({ error: "TERMS_REQUIRED" }, { status: 400 });
  }

  const { error } = await supabase
    .from("users")
    .update({
      gender,
      terms_accepted_at: new Date().toISOString(),
      privacy_accepted_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "DB_ERROR", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
