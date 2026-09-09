const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_ACTION = "magic_link";
const MAX_TOKEN_LENGTH = 2048;

type TurnstileResult = {
  success?: boolean;
  hostname?: string;
  action?: string;
};

/** Vercel이 덮어쓰는 전달 헤더를 우선 사용한다. */
export function clientIp(req: Request): string {
  const forwarded =
    req.headers.get("x-vercel-forwarded-for") ??
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

/**
 * Turnstile 토큰은 브라우저 표시만 믿지 않고 Cloudflare Siteverify에서 소비한다.
 * 운영 환경은 설정 누락·timeout·형식 오류를 모두 실패로 처리한다.
 */
export async function verifyTurnstileToken(token: unknown, ip: string): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" && !process.env.TURNSTILE_SECRET_KEY) {
    return true;
  }
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return false;
  }

  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!secret || !siteUrl) return false;

  let expectedHostname: string;
  try {
    expectedHostname = new URL(siteUrl).hostname;
  } catch {
    return false;
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(5_000),
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: ip,
      }),
    });
    if (!response.ok) return false;

    const result = (await response.json()) as TurnstileResult;
    return (
      result.success === true &&
      result.hostname === expectedHostname &&
      result.action === TURNSTILE_ACTION
    );
  } catch {
    return false;
  }
}

export const TURNSTILE_WIDGET_ACTION = TURNSTILE_ACTION;
