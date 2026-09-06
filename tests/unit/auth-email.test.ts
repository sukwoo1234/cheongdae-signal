import { describe, expect, it } from "vitest";
import { isLoginEmailOtpType } from "@/lib/auth-email";

describe("email login callback boundary", () => {
  it("accepts magic links and first-sign-in confirmation types", () => {
    expect(isLoginEmailOtpType("magiclink")).toBe(true);
    expect(isLoginEmailOtpType("signup")).toBe(true);
    expect(isLoginEmailOtpType("email")).toBe(true);
  });

  it("rejects unrelated email actions", () => {
    expect(isLoginEmailOtpType("recovery")).toBe(false);
    expect(isLoginEmailOtpType("invite")).toBe(false);
    expect(isLoginEmailOtpType("email_change")).toBe(false);
    expect(isLoginEmailOtpType("password")).toBe(false);
    expect(isLoginEmailOtpType(null)).toBe(false);
  });
});
