import { describe, expect, it } from "vitest";
import { contactKind, formatContactValue, isValidContactValue, sanitizeContactValue } from "@/lib/validation/contact";

describe("contact helpers", () => {
  it("distinguishes a normalized mobile number from a contact ID", () => {
    expect(contactKind("01012345678")).toBe("phone");
    expect(contactKind("cju_signal")).toBe("id");
  });

  it("formats contacts for disclosure without adding @ to phone numbers", () => {
    expect(formatContactValue("01012345678")).toBe("010-1234-5678");
    expect(formatContactValue("0111234567")).toBe("011-123-4567");
    expect(formatContactValue("cju_signal")).toBe("cju_signal");
  });

  it("normalizes decorated input before storage", () => {
    expect(sanitizeContactValue("  @cju.signal ")).toBe("cju.signal");
    expect(sanitizeContactValue("010 1234 5678")).toBe("01012345678");
  });

  it("accepts a KakaoTalk-style ID containing a hyphen", () => {
    expect(isValidContactValue("cju-signal")).toBe(true);
  });
});
