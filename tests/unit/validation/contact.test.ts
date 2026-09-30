import { describe, expect, it } from "vitest";
import { contactTypeLabel, formatContactValue, isValidContactValue, sanitizeContactValue } from "@/lib/validation/contact";

describe("contact helpers", () => {
  it("uses the selected contact method instead of guessing between IDs", () => {
    expect(contactTypeLabel("instagram")).toBe("인스타그램 ID");
    expect(contactTypeLabel("kakao")).toBe("카카오톡 ID");
    expect(contactTypeLabel("phone")).toBe("휴대전화 번호");
  });

  it("formats contacts for disclosure without adding @ to phone numbers", () => {
    expect(formatContactValue("01012345678", "phone")).toBe("010-1234-5678");
    expect(formatContactValue("0111234567", "phone")).toBe("011-123-4567");
    expect(formatContactValue("cju_signal", "instagram")).toBe("cju_signal");
  });

  it("normalizes decorated input before storage", () => {
    expect(sanitizeContactValue("  @cju.signal ", "instagram")).toBe("cju.signal");
    expect(sanitizeContactValue("010 1234 5678", "phone")).toBe("01012345678");
  });

  it("validates each value against the explicitly selected method", () => {
    expect(isValidContactValue("cju-signal", "kakao")).toBe(true);
    expect(isValidContactValue("cju-signal", "instagram")).toBe(false);
    expect(isValidContactValue("01012345678", "phone")).toBe(true);
    expect(isValidContactValue("01012345678", "instagram")).toBe(false);
  });
});
