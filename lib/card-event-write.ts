import { NextResponse } from "next/server";

const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function expectedCardEventId(value: unknown): string | null {
  return typeof value === "string" && EVENT_ID_PATTERN.test(value) ? value.toLowerCase() : null;
}

export function cardWriteErrorResponse(error: { code?: string; message?: string }) {
  if (error.message?.includes("STALE_EVENT") || error.message?.includes("PURGE_IN_PROGRESS")) {
    return NextResponse.json({ error: "EVENT_CHANGED" }, { status: 409 });
  }
  if (error.message?.includes("SESSION_ENDED")) {
    return NextResponse.json({ error: "SESSION_ENDED" }, { status: 410 });
  }
  if (error.code === "23505") {
    return NextResponse.json({ error: "ALREADY_HAS_CARD" }, { status: 409 });
  }
  if (error.message?.includes("CARD_NOT_FOUND")) {
    return NextResponse.json({ error: "CARD_NOT_FOUND" }, { status: 404 });
  }
  if (error.message?.includes("ACCOUNT_NOT_ALLOWED")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (error.message?.includes("NO_CONFIG")) {
    return NextResponse.json({ error: "SEASON_UNAVAILABLE" }, { status: 503 });
  }
  return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
}
