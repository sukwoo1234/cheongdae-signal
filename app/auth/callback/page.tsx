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

function emailFromAccessToken(token: string): string | null {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return null;
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    return typeof payload?.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

/**
 * 매직링크 복귀 지점.
 *
 * 같은 브라우저는 즉시 로그인한다. 이메일 앱이 링크를 다른 브라우저로 연 경우에는
 * 인증 토큰을 소비하거나 세션을 만들기 전에 사용자가 계정을 한 번 확인해야 한다.
 * 서버는 관리자 계정에 이 예외를 허용하지 않는다.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const ran = useRef(false);
  const credentialRef = useRef<CallbackCredential | null>(null);
  const stateRef = useRef<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const completeSignIn = useCallback(
    async (crossBrowserConfirmed: boolean) => {
      const credential = credentialRef.current;
      const state = stateRef.current;
      if (!credential || !state) {
        router.replace("/?error=auth_failed");
        return;
      }

      setLoading(true);
      try {
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

        // 토큰은 세션 확립 직후 주소창에서 제거한다.
        window.history.replaceState({}, "", "/auth/callback");

        const res = await fetch("/api/auth/finish", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({
            state,
            cross_browser_confirmed: crossBrowserConfirmed,
          }),
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
        setEmail(emailFromAccessToken(accessToken));
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
        // 상태를 확인할 수 없으면 자동 로그인하지 않고 명시적 확인 화면으로 내린다.
      }

      if (stateMatches) {
        await completeSignIn(false);
        return;
      }

      // 다른 브라우저에서는 실제 인증 전에 명시적인 사용자 동의를 받는다.
      setNeedsConfirmation(true);
      setLoading(false);
    })();
  }, [completeSignIn, router]);

  if (needsConfirmation) {
    return (
      <CampusShell className="min-h-[900px] sm:min-h-screen">
        <div className="mx-auto mt-6 w-full max-w-[440px] rounded-[28px] border border-white/90 bg-white/90 p-7 text-center shadow-[0_28px_80px_rgba(54,90,139,.18)] backdrop-blur-xl sm:p-9">
          <span className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e5f8f4] text-lg font-black text-[#0b8f7e]">↗</span>
          <p className="text-xs font-bold tracking-[0.12em] text-[#0ca18e]">브라우저 확인</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-[#071b33]">다른 브라우저에서 열렸어요.</h1>
          <p className="mt-3 text-sm leading-6 text-[#637083]">
            이메일 앱이 로그인 링크를 새 브라우저로 열었습니다.
            {email && (
              <>
                <br />
                <span className="mt-3 inline-block rounded-lg bg-[#f1f5f9] px-3 py-2 font-mono text-xs font-semibold text-[#203149]">
                  {email}
                </span>
              </>
            )}
          </p>
          <p className="mt-4 text-xs font-medium text-[#34445a]">본인의 청주대학교 이메일이 맞는지 확인해주세요.</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button type="button" disabled={loading} onClick={() => completeSignIn(true)}>
              {loading ? "확인 중..." : "이 계정으로 계속"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              onClick={() => {
                window.history.replaceState({}, "", "/");
                router.replace("/");
              }}
            >
              취소
            </Button>
          </div>
        </div>
      </CampusShell>
    );
  }

  return <SignalLoading message={loading ? "안전하게 로그인을 확인하고 있어요." : "로그인을 확인해주세요."} />;
}
