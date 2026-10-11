import { NextResponse } from "next/server";
import { finishSignIn } from "@/lib/auth-flow";
import { requireAjaxRequest } from "@/lib/csrf";

export async function POST(req: Request) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;

  const body = await req.json().catch(() => ({}));
  const state = typeof body?.state === "string" ? body.state : null;
  const next = await finishSignIn(state);
  return NextResponse.json({ next });
}
