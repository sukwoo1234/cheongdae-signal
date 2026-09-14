import type { CookieOptions } from "@supabase/ssr";

export function isSecureCookieEnvironment(): boolean {
  // 운영에서는 URL 변수를 잘못 HTTP로 입력해도 인증 쿠키가 평문 연결에 노출되지
  // 않도록 Secure를 절대 해제하지 않는다.
  if (process.env.NODE_ENV === "production") return true;

  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredSiteUrl) return configuredSiteUrl.startsWith("https://");
  return false;
}

// 브라우저 클라이언트가 세션을 동기화해야 하므로 httpOnly는 사용할 수 없다.
// 대신 HTTPS에서는 Secure를 강제하고, SameSite=Lax로 cross-site 요청에 세션이
// 자동으로 붙는 범위를 줄인다. 실제 세션 수명은 Supabase auth.sessions에서 제한한다.
export const SUPABASE_COOKIE_OPTIONS: CookieOptions = {
  path: "/",
  sameSite: "lax",
  secure: isSecureCookieEnvironment(),
};
