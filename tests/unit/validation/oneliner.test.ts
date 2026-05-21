import { describe, it, expect } from "vitest";
import { containsProfanity } from "@/lib/validation/profanity";
import { containsPhoneNumber } from "@/lib/validation/phone";

describe("containsProfanity", () => {
  it("flags banned words", () => {
    expect(containsProfanity("씨발 진짜")).toBe(true);
    expect(containsProfanity("ㅅㅂ")).toBe(true);
    expect(containsProfanity("FUCK")).toBe(true);
  });
  it("passes clean text", () => {
    expect(containsProfanity("강동원 닮은꼴")).toBe(false);
    expect(containsProfanity("축구러")).toBe(false);
  });
});

describe("containsPhoneNumber", () => {
  it("flags common phone formats", () => {
    expect(containsPhoneNumber("010-1234-5678")).toBe(true);
    expect(containsPhoneNumber("01012345678")).toBe(true);
    expect(containsPhoneNumber("연락 010 1234 5678")).toBe(true);
  });
  it("passes non-phone text", () => {
    expect(containsPhoneNumber("키 188 농구러")).toBe(false);
    expect(containsPhoneNumber("22학번")).toBe(false);
  });
});
