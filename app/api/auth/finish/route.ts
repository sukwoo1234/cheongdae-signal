import { NextResponse } from "next/server";
import { finishSignIn } from "@/lib/auth-flow";

export async function POST() {
  const next = await finishSignIn();
  return NextResponse.json({ next });
}
