import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasMagicLinkAuthMethod,
  hasMfaAssuranceLevel,
  isAdminUser,
  isAllowedAccount,
} from "@/lib/auth";
import { createLoginState, matchesLoginState } from "@/lib/auth-state";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin identity boundary", () => {
  it("requires both the configured user id and email", () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("ADMIN_USER_ID", "admin-user-id");

    expect(isAdminUser({ id: "admin-user-id", email: "admin@example.com" })).toBe(true);
    expect(isAdminUser({ id: "other-user-id", email: "admin@example.com" })).toBe(false);
    expect(isAdminUser({ id: "admin-user-id", email: "attacker@example.com" })).toBe(false);
  });

  it("fails closed when the administrator user id is not configured", () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("ADMIN_USER_ID", "");

    expect(isAdminUser({ id: "admin-user-id", email: "admin@example.com" })).toBe(false);
  });

  it("allows only the CJU domain or the bound administrator identity", () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("ADMIN_USER_ID", "admin-user-id");

    expect(isAllowedAccount({ id: "student-id", email: "student@cju.ac.kr" })).toBe(true);
    expect(isAllowedAccount({ id: "attacker-id", email: "admin@example.com" })).toBe(false);
    expect(isAllowedAccount({ id: "admin-user-id", email: "admin@example.com" })).toBe(true);
  });
});

describe("authentication method and login state boundary", () => {
  it("accepts only magic-link/OTP amr values", () => {
    expect(hasMagicLinkAuthMethod({ amr: [{ method: "magiclink", timestamp: 1 }] })).toBe(true);
    expect(hasMagicLinkAuthMethod({ amr: ["otp"] })).toBe(true);
    expect(hasMagicLinkAuthMethod({ amr: [{ method: "password", timestamp: 1 }] })).toBe(false);
    expect(hasMagicLinkAuthMethod({ amr: [{ method: "recovery", timestamp: 1 }] })).toBe(false);
    expect(hasMagicLinkAuthMethod({})).toBe(false);
  });

  it("requires AAL2 for the MFA-gated administrator boundary", () => {
    expect(hasMfaAssuranceLevel({ aal: "aal2" })).toBe(true);
    expect(hasMfaAssuranceLevel({ aal: "aal1" })).toBe(false);
    expect(hasMfaAssuranceLevel({})).toBe(false);
  });

  it("binds a callback to the browser's one-time login state", () => {
    const state = createLoginState();
    expect(state).toHaveLength(43);
    expect(matchesLoginState(state, state)).toBe(true);
    expect(matchesLoginState(state, `${state}x`)).toBe(false);
    expect(matchesLoginState(state, undefined)).toBe(false);
  });
});
