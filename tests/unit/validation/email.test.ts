import { describe, it, expect } from "vitest";
import { isAllowedCJUEmail } from "@/lib/validation/email";

describe("isAllowedCJUEmail", () => {
  it("accepts @cju.ac.kr emails", () => {
    expect(isAllowedCJUEmail("student@cju.ac.kr")).toBe(true);
    expect(isAllowedCJUEmail("STUDENT@CJU.AC.KR")).toBe(true);
  });

  it("rejects other domains", () => {
    expect(isAllowedCJUEmail("foo@gmail.com")).toBe(false);
    expect(isAllowedCJUEmail("foo@cju.com")).toBe(false);
    expect(isAllowedCJUEmail("foo@sub.cju.ac.kr")).toBe(false);
  });

  it("rejects malformed inputs", () => {
    expect(isAllowedCJUEmail("not-an-email")).toBe(false);
    expect(isAllowedCJUEmail("")).toBe(false);
    expect(isAllowedCJUEmail("@cju.ac.kr")).toBe(false);
  });
});
