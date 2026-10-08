import type { BoardMode, SeasonState } from "./types";

export interface SeasonConsent {
  accepted: true;
  event_id: string;
  ends_at: string;
  board_mode: BoardMode;
}

export function parseSeasonConsent(value: unknown): SeasonConsent | null {
  if (!value || typeof value !== "object") return null;
  const consent = value as Record<string, unknown>;
  if (consent.accepted !== true || typeof consent.event_id !== "string"
      || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(consent.event_id)
      || typeof consent.ends_at !== "string" || !Number.isFinite(Date.parse(consent.ends_at))
      || (consent.board_mode !== "opposite" && consent.board_mode !== "selectable")) return null;
  return { accepted: true, event_id: consent.event_id, ends_at: consent.ends_at, board_mode: consent.board_mode };
}

/** Legacy participants retain the previous deadline until they explicitly accept. */
export function needsSeasonTransition(season: SeasonState): boolean {
  if (!season.continuous_mode || season.accepted) return false;
  return !season.participation_ends_at
    || !Number.isFinite(Date.parse(season.participation_ends_at))
    || Date.parse(season.participation_ends_at) < Date.parse(season.ends_at);
}

export function seasonEndLabel(endsAt: string): string {
  return new Date(endsAt).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function seasonAudienceLabel(mode: BoardMode): string {
  return mode === "selectable" ? "남성·여성 모두에게" : "본인과 다른 성별의 참가자에게";
}
