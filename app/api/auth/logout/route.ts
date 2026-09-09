import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAjaxRequest } from "@/lib/csrf";

export async function POST(req: Request) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) return NextResponse.json({ error: "LOGOUT_FAILED" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
