import { redirect } from "next/navigation";
import { isLoginEmailOtpType } from "@/lib/auth-email";

/**
 * 이전 이메일 템플릿의 호환 경로.
 * GET 요청에서 OTP를 소비하면 메일 보안 스캐너가 사용자가 누르기 전에 링크를
 * 무효화할 수 있으므로, 실제 검증은 확인 UI가 있는 /auth/callback 에서 수행한다.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const state = url.searchParams.get("state");

  if (!token_hash || !isLoginEmailOtpType(type) || !state) {
    redirect("/?error=invalid_link");
  }

  const callback = new URL("/auth/callback", url.origin);
  callback.searchParams.set("state", state);
  callback.searchParams.set("token_hash", token_hash);
  callback.searchParams.set("type", type);
  redirect(callback.toString());
}
