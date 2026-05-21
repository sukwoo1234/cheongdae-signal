import { describe, it, expect } from "vitest";
import { sanitizeInstagramId, isValidInstagramId } from "@/lib/validation/instagram";

describe("sanitizeInstagramId", () => {
  it("strips leading @", () => {
    expect(sanitizeInstagramId("@user_name")).toBe("user_name");
    expect(sanitizeInstagramId("user_name")).toBe("user_name");
  });
  it("trims whitespace", () => {
    expect(sanitizeInstagramId("  @user.name  ")).toBe("user.name");
  });
});

describe("isValidInstagramId", () => {
  it("accepts valid IDs", () => {
    expect(isValidInstagramId("user_name")).toBe(true);
    expect(isValidInstagramId("user.name")).toBe(true);
    expect(isValidInstagramId("a")).toBe(true);
    expect(isValidInstagramId("a".repeat(30))).toBe(true);
  });
  it("rejects invalid IDs", () => {
    expect(isValidInstagramId("")).toBe(false);
    expect(isValidInstagramId("a".repeat(31))).toBe(false);
    expect(isValidInstagramId("user name")).toBe(false);
    expect(isValidInstagramId("한글이름")).toBe(false);
    expect(isValidInstagramId("user-name")).toBe(false);
  });
});
