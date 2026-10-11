"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";
import { isLoginEmailOtpType } from "@/lib/auth-email";
import { Button } from "@/components/ui/Button";
import { SignalLoading } from "@/components/SignalLoading";
import { CampusShell } from "@/components/CampusShell";

type CallbackCredential =
  | { kind: "session"; accessToken: string; refreshToken: string }
  | { kind: "otp"; tokenHash: string; type: EmailOtpType }
  | { kind: "code"; code: string };

/**
 * 매직링크 복귀 지점.
 *
 * 로그인 링크를 요청한 브라우저에서만 자격 증명을 교환한다. 다른 브라우저에서
 * 열리거나 state 확인에 실패하면 현재 브라우저에서 새 링크를 요청해야 한다.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const ran = useRef(false);
  const credentialRef = useRef<CallbackCredential | null>(null);
  const stateRef = useRef<string | null>(null);
  const [needsNewLink, setNeedsNewLink] = useState(false);
  const [loading, setLoading] = useState(true);

  const completeSignIn = useCallback(
    async () => {
      const credential = credentialRef.current;
      const state = stateRef.current;
      if (!credential || !state) {
        router.replace("/?error=auth_failed");
        return;
      }

      setLoading(true);
      try {
        // createBrowserClient는 PKCE code가 주소에 있으면 초기화 과정에서 자동으로
        // 교환한다. 아래의 명시적 교환과 동시에 실행되면 일회용 code가 두 번
        // 소비되어 간헐적으로 로그인 화면으로 돌아간다. 자격 증명은 이미 ref에
        // 보관했으므로 클라이언트를 만들기 전에 주소창에서 먼저 제거한다.
        window.history.replaceState({}, "", "/auth/callback");

        const supabase = createClient();
        let authError: unknown = null;

        if (credential.kind === "session") {
          const { error } = await supabase.auth.setSession({
            access_token: credential.accessToken,
            refresh_token: credential.refreshToken,
          });
          authError = error;
        } else if (credential.kind === "otp") {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: credential.tokenHash,
            type: credential.type,
          });
          authError = error;
        } else {
          const { error } = await supabase.auth.exchangeCodeForSession(credential.code);
          authError = error;
        }

        if (authError) {
          router.replace("/?error=auth_failed");
          return;
        }

        const res = await fetch("/api/auth/finish", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({ state }),
        });
        const data = (await res.json().catch(() => ({}))) as { next?: string };
        router.replace(res.ok ? (data.next ?? "/") : "/?error=auth_failed");
      } catch {
        router.replace("/?error=auth_failed");
      }
    },
    [router]
  );

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const state = url.searchParams.get("state");
      const errorDescription =
        hash.get("error_description") ?? url.searchParams.get("error_description");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      const code = url.searchParams.get("code");
      const hashType = hash.get("type");

      if (
        !state ||
        errorDescription ||
        (type && !isLoginEmailOtpType(type)) ||
        (hashType && !isLoginEmailOtpType(hashType))
      ) {
        router.replace("/?error=auth_failed");
        return;
      }

      let credential: CallbackCredential | null = null;
      if (accessToken && refreshToken) {
        credential = { kind: "session", accessToken, refreshToken };
      } else if (tokenHash && isLoginEmailOtpType(type)) {
        credential = { kind: "otp", tokenHash, type };
      } else if (code) {
        credential = { kind: "code", code };
      }

      if (!credential) {
        router.replace("/?error=auth_failed");
        return;
      }

      credentialRef.current = credential;
      stateRef.current = state;

      let stateMatches = false;
      try {
        const stateResponse = await fetch("/api/auth/check-state", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({ state }),
        });
        const stateData = (await stateResponse.json().catch(() => ({}))) as { matches?: boolean };
        stateMatches = stateResponse.ok && stateData.matches === true;
      } catch {
        // 상태를 확인할 수 없으면 자격 증명을 교환하지 않는다.
      }

      if (stateMatches) {
        await completeSignIn();
        return;
      }

      // state가 맞지 않는 링크는 확인 버튼으로 우회할 수 없다. SDK 초기화와
      // 세션 교환 전에 자격 증명을 버려 기존 브라우저 세션도 바꾸지 않는다.
      credentialRef.current = null;
      stateRef.current = null;
      window.history.replaceState({}, "", "/auth/callback");
      setNeedsNewLink(true);
      setLoading(false);
    })();
  }, [completeSignIn, router]);

  if (needsNewLink) {
    return (
      <CampusShell className="min-h-[900px] sm:min-h-screen">
        <div className="mx-auto mt-6 w-full max-w-[440px] rounded-[28px] border border-white/90 bg-white/90 p-7 text-center shadow-[0_28px_80px_rgba(54,90,139,.18)] backdrop-blur-xl sm:p-9">
          <span className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e5f8f4] text-lg font-black text-[#0b8f7e]">↗</span>
          <p className="text-xs font-bold tracking-[0.12em] text-[#0ca18e]">브라우저 확인</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-[#071b33]">로그인 링크를 다시 요청해주세요.</h1>
          <p className="mt-3 text-sm leading-6 text-[#637083]">
            링크를 요청한 브라우저인지 확인할 수 없어요.
            <br />
            이 브라우저에서 새 로그인 링크를 요청한 뒤, 받은 링크도 같은 브라우저에서 열어주세요.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button
              type="button"
              onClick={() => {
                window.history.replaceState({}, "", "/");
                router.replace("/");
              }}
            >
              새 로그인 링크 요청하기
            </Button>
          </div>
        </div>
      </CampusShell>
    );
  }

  return <SignalLoading message={loading ? "안전하게 로그인을 확인하고 있어요." : "로그인을 확인해주세요."} />;
}
