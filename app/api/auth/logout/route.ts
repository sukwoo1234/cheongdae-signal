import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAjaxRequest } from "@/lib/csrf";

export async function POST(req: Request) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
