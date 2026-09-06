import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * 이 앱의 비밀번호 없는 로그인 과정에서 Supabase가 반환할 수 있는 이메일 OTP 타입.
 *
 * 기존 사용자는 `magiclink`, 신규 사용자의 이메일 확인은 `signup` 또는 `email`로
 * 돌아올 수 있다. 비밀번호 복구·초대·이메일 변경 링크는 로그인 콜백에서 받지 않는다.
 */
export function isLoginEmailOtpType(value: string | null): value is EmailOtpType {
  return value === "magiclink" || value === "signup" || value === "email";
}
