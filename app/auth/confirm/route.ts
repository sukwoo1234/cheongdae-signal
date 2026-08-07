import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { finishSignIn } from "@/lib/auth-flow";

/**
 * Supabase 이메일 템플릿이 `token_hash` 방식으로 설정된 경우의 복귀 지점.
 * 세션 확립 이후 처리는 /auth/callback 과 완전히 동일하게 finishSignIn()을 쓴다.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (!token_hash || !type) {
    redirect("/?error=invalid_link");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    redirect("/?error=verify_failed");
  }

  redirect(await finishSignIn());
}
