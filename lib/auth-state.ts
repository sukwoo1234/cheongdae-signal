import { randomBytes, timingSafeEqual } from "crypto";
import { isSecureCookieEnvironment } from "@/lib/supabase/cookie-options";

export const LOGIN_STATE_COOKIE = "cd_login_state";
export const LOGIN_STATE_TTL_SECONDS = 15 * 60;

export function createLoginState(): string {
  return randomBytes(32).toString("base64url");
}

export function loginStateCookieOptions(maxAge = LOGIN_STATE_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSecureCookieEnvironment(),
    path: "/",
    maxAge,
  };
}

export function matchesLoginState(expected: string | undefined, provided: string | undefined): boolean {
  if (!expected || !provided) return false;

  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  if (expectedBytes.length !== providedBytes.length) return false;

  return timingSafeEqual(expectedBytes, providedBytes);
}
