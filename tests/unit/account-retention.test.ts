import { describe, expect, it } from "vitest";
import { accountRetentionCutoff, isAccountRetentionExpired } from "@/lib/account-retention";

describe("account retention", () => {
  it("uses a six-calendar-month cutoff without overflowing short months", () => {
    const now = new Date("2026-08-31T12:00:00.000Z");
    expect(accountRetentionCutoff(now).toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(isAccountRetentionExpired("2026-02-27T23:59:59.999Z", now)).toBe(true);
    expect(isAccountRetentionExpired("2026-02-28T12:00:00.000Z", now)).toBe(false);
  });
});
