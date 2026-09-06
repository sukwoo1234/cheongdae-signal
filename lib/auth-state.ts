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
  if (!expected || !provided || expected.length !== provided.length) return false;

  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(provided, "utf8"));
}
