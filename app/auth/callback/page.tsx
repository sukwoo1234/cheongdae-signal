"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * 매직링크 복귀 지점.
 *
 * 예전에는 서버 route handler가 `?code=` 만 처리했다. 그런데 매직링크는
 * service_role 클라이언트(implicit flow)로 발급되므로 브라우저에 PKCE
 * code_verifier가 없고, Supabase는 토큰을 URL 해시(`#access_token=...`)로
 * 돌려준다. 해시는 서버로 전송되지 않기 때문에 서버는 아무것도 못 받고
 * 조용히 홈으로 돌려보냈다 (= 로그인이 아예 성립하지 않던 원인).
 *
 * 이 페이지는 Supabase 이메일 템플릿이 어떻게 설정돼 있든 동작하도록
 * 세 가지 형태를 모두 처리한다.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

      const errorDescription =
        hash.get("error_description") ?? url.searchParams.get("error_description");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type") as EmailOtpType | null;
      const code = url.searchParams.get("code");

      let ok = false;

      if (errorDescription) {
        ok = false;
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        ok = !error;
      } else if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        ok = !error;
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        ok = !error;
      }

      if (!ok) {
        router.replace("/?error=auth_failed");
        return;
      }

      // 주소창에 남은 토큰을 즉시 제거한다 (뒤로가기·링크 공유로 새어나가지 않도록).
      window.history.replaceState({}, "", "/auth/callback");

      const res = await fetch("/api/auth/finish", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { next?: string };
      router.replace(data.next ?? "/");
    })();
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <p className="text-sm text-gray-600">로그인 중이에요...</p>
    </main>
  );
}
