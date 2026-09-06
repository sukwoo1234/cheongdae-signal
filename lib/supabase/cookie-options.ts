import type { CookieOptions } from "@supabase/ssr";

export function isSecureCookieEnvironment(): boolean {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredSiteUrl) return configuredSiteUrl.startsWith("https://");
  return process.env.NODE_ENV === "production";
}

// 브라우저 클라이언트가 세션을 동기화해야 하므로 httpOnly는 사용할 수 없다.
// 대신 HTTPS에서는 Secure를 강제하고, SameSite=Lax로 cross-site 요청에 세션이
// 자동으로 붙는 범위를 줄인다. 실제 세션 수명은 Supabase auth.sessions에서 제한한다.
export const SUPABASE_COOKIE_OPTIONS: CookieOptions = {
  path: "/",
  sameSite: "lax",
  secure: isSecureCookieEnvironment(),
};
