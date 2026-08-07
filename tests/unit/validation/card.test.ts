import { describe, it, expect } from "vitest";
import { validateOneLiner, validateInstagramId, validateColor } from "@/lib/validation/card";
import { containsPhoneNumber } from "@/lib/validation/phone";

describe("validateOneLiner", () => {
  it("accepts normal text and trims it", () => {
    expect(validateOneLiner("  강동원 닮은꼴  ")).toEqual({ value: "강동원 닮은꼴" });
  });

  it("rejects empty / whitespace-only", () => {
    expect(validateOneLiner("").error).toBe("INVALID_ONELINER");
    expect(validateOneLiner("   ").error).toBe("INVALID_ONELINER");
    expect(validateOneLiner(undefined).error).toBe("INVALID_ONELINER");
    expect(validateOneLiner(123).error).toBe("INVALID_ONELINER");
  });

  it("counts by code point, not UTF-16 unit", () => {
    // 이모지 20개 = UTF-16 기준 40. .length로 세면 부당하게 거부된다.
    // DB의 char_length는 20으로 세므로 통과해야 한다.
    const twentyEmoji = "🙂".repeat(20);
    expect(validateOneLiner(twentyEmoji)).toEqual({ value: twentyEmoji });

    expect(validateOneLiner("🙂".repeat(21)).error).toBe("INVALID_ONELINER");
    expect(validateOneLiner("가".repeat(20)).error).toBeUndefined();
    expect(validateOneLiner("가".repeat(21)).error).toBe("INVALID_ONELINER");
  });

  it("blocks profanity and phone numbers", () => {
    expect(validateOneLiner("씨발 진짜").error).toBe("PROFANITY_DETECTED");
    expect(validateOneLiner("010-1234-5678").error).toBe("PHONE_DETECTED");
  });
});

describe("containsPhoneNumber — 우회 표기", () => {
  it("catches separator-obfuscated numbers", () => {
    expect(containsPhoneNumber("010.1234.5678")).toBe(true);
    expect(containsPhoneNumber("010_1234_5678")).toBe(true);
    expect(containsPhoneNumber("010(1234)5678")).toBe(true);
  });

  it("catches full-width digits via NFKC", () => {
    expect(containsPhoneNumber("０１０１２３４５６７８")).toBe(true);
  });

  it("still passes non-phone text", () => {
    expect(containsPhoneNumber("키 188 농구러")).toBe(false);
    expect(containsPhoneNumber("22학번")).toBe(false);
  });
});

describe("validateInstagramId", () => {
  it("strips a leading @ and surrounding space", () => {
    expect(validateInstagramId("  @cju_signal ")).toEqual({ value: "cju_signal" });
  });

  it("rejects invalid ids", () => {
    expect(validateInstagramId("").error).toBe("INVALID_INSTAGRAM_ID");
    expect(validateInstagramId("has space").error).toBe("INVALID_INSTAGRAM_ID");
    expect(validateInstagramId("한글아이디").error).toBe("INVALID_INSTAGRAM_ID");
    expect(validateInstagramId("a".repeat(31)).error).toBe("INVALID_INSTAGRAM_ID");
    expect(validateInstagramId(null).error).toBe("INVALID_INSTAGRAM_ID");
  });

  it("accepts a 30-char id", () => {
    expect(validateInstagramId("a".repeat(30)).error).toBeUndefined();
  });
});

describe("validateColor", () => {
  it("accepts the six allowed colors", () => {
    for (const c of ["yellow", "pink", "green", "blue", "purple", "orange"]) {
      expect(validateColor(c)).toEqual({ value: c });
    }
  });

  it("rejects anything else", () => {
    expect(validateColor("red").error).toBe("INVALID_COLOR");
    expect(validateColor("").error).toBe("INVALID_COLOR");
    expect(validateColor(undefined).error).toBe("INVALID_COLOR");
  });
});
