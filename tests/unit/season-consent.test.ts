import { describe, expect, it } from "vitest";
import { needsSeasonTransition, parseSeasonConsent, seasonAudienceLabel, seasonEndLabel } from "@/lib/season-consent";
import type { SeasonState } from "@/lib/types";

const season: SeasonState = {
  event_id: "30000000-0000-4000-8000-000000000001", continuous_mode: true,
  ends_at: "2027-01-30T14:59:00Z", participation_ends_at: "2026-10-11T14:59:00Z",
  accepted: false, board_mode: "selectable", base_allowance: 2,
};

describe("season consent presentation", () => {
  it("shows the transition only for existing participants with an older deadline", () => {
    expect(needsSeasonTransition(season)).toBe(true);
    expect(needsSeasonTransition({ ...season, participation_ends_at: season.ends_at })).toBe(false);
    expect(needsSeasonTransition({ ...season, accepted: true })).toBe(false);
    expect(needsSeasonTransition({ ...season, continuous_mode: false })).toBe(false);
  });
  it("does not silently classify missing legacy information as a new participant", () => {
    expect(needsSeasonTransition({ ...season, participation_ends_at: null })).toBe(true);
    expect(needsSeasonTransition({ ...season, participation_ends_at: "invalid" })).toBe(true);
  });
  it("requires explicit acceptance of a valid displayed season", () => {
    const valid = { accepted: true, event_id: season.event_id, ends_at: season.ends_at, board_mode: season.board_mode };
    expect(parseSeasonConsent(valid)).toEqual(valid);
    for (const invalid of [null, {}, { ...valid, accepted: false }, { ...valid, accepted: "true" },
      { ...valid, event_id: "wrong" }, { ...valid, ends_at: "invalid" }, { ...valid, board_mode: "same" }]) {
      expect(parseSeasonConsent(invalid)).toBeNull();
    }
  });
  it("uses Korean time and the actual board audience", () => {
    expect(seasonEndLabel(season.ends_at)).toContain("2027년 1월 30일");
    expect(seasonEndLabel(season.ends_at)).toContain("11:59");
    expect(seasonAudienceLabel("selectable")).toBe("남성·여성 모두에게");
    expect(seasonAudienceLabel("opposite")).toBe("본인과 다른 성별의 참가자에게");
  });
});
