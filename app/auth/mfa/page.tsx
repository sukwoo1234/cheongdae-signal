"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export default function AdminMfaPage() {
  const router = useRouter();
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [needsEnrollment, setNeedsEnrollment] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const { data, error: factorError } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;

      if (factorError || !data) {
        setError("관리자 세션을 확인할 수 없어요. 로그인 링크를 다시 요청해주세요.");
        setLoading(false);
        return;
      }

      const factor = data.totp.find((candidate) => candidate.status === "verified");
      if (factor) {
        setVerifiedFactorId(factor.id);
      } else {
        // listFactors().totp에는 verified factor만 들어오므로, 이 경우는
        // 최초 등록이 필요하거나 이전 등록이 중단된 상태다.
        setNeedsEnrollment(true);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function startEnrollment() {
    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError || !factors) throw new Error("MFA_FACTORS_UNAVAILABLE");

      // 완료되지 않은 enrollment는 secret을 다시 조회할 수 없으므로,
      // 새 QR을 만들기 전에 사용되지 않은 TOTP만 정리한다. verified factor는
      // 절대 삭제하지 않는다.
      const pendingFactors = factors.all.filter(
        (factor) => factor.factor_type === "totp" && factor.status === "unverified"
      );
      for (const factor of pendingFactors) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({
          factorId: factor.id,
        });
        if (unenrollError) throw new Error("MFA_PENDING_CLEANUP_FAILED");
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "청대 시그널 관리자",
      });
      if (enrollError || !data?.totp?.qr_code || !data.totp.secret) {
        throw new Error("MFA_ENROLL_FAILED");
      }

      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setNeedsEnrollment(false);
      setCode("");
    } catch {
      setError("MFA 등록을 시작할 수 없어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    const factorId = enrollment?.factorId ?? verifiedFactorId;
    if (!factorId || !/^\d{6}$/.test(code)) {
      setError("인증 앱의 6자리 코드를 입력해주세요.");
      return;
    }

    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });

    if (verifyError) {
      setError("인증 코드가 올바르지 않거나 만료됐어요. 새 코드를 입력해주세요.");
      setBusy(false);
      return;
    }
    router.replace("/admin");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-gray-900 text-gray-200">
      <div className="w-full max-w-sm rounded-2xl bg-gray-800 p-6 shadow">
        <h1 className="text-lg font-bold text-center">관리자 MFA 인증</h1>
        {loading ? (
          <p className="mt-6 text-sm text-center text-gray-400">인증 준비 중...</p>
        ) : needsEnrollment && !enrollment ? (
          <>
            <p className="mt-4 text-sm text-center text-gray-400">
              관리자 계정에 MFA가 아직 등록되지 않았어요. 인증 앱 등록을 시작해주세요.
            </p>
            <Button onClick={startEnrollment} disabled={busy} className="mt-4 w-full">
              {busy ? "등록 준비 중..." : "MFA 등록 시작"}
            </Button>
          </>
        ) : enrollment ? (
          <>
            <p className="mt-4 text-sm text-center text-gray-400">
              QR 코드를 인증 앱으로 스캔한 뒤 표시된 6자리 코드를 입력해주세요.
            </p>
            <div className="mt-4 flex justify-center rounded-lg bg-white p-3">
              <img
                src={enrollment.qrCode}
                alt="관리자용 MFA 등록 QR 코드"
                className="h-48 w-48"
                referrerPolicy="no-referrer"
              />
            </div>
            <label htmlFor="mfa-secret" className="mt-4 block text-xs text-gray-400">
              QR을 스캔할 수 없을 때 사용할 수동 설정 키
            </label>
            <Input
              id="mfa-secret"
              className="mt-1 text-xs"
              type="text"
              value={enrollment.secret}
              readOnly
              autoComplete="off"
              spellCheck={false}
            />
            <Input
              className="mt-4 text-center tracking-[0.4em]"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              autoComplete="one-time-code"
              aria-label="MFA 인증 코드"
            />
            <Button onClick={verify} disabled={busy} className="mt-4 w-full">
              {busy ? "확인 중..." : "등록 완료 및 관리자 진입"}
            </Button>
          </>
        ) : verifiedFactorId ? (
          <>
            <p className="mt-4 text-sm text-center text-gray-400">
              인증 앱의 6자리 코드를 입력해주세요.
            </p>
            <Input
              className="mt-4 text-center tracking-[0.4em]"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              autoComplete="one-time-code"
              aria-label="MFA 인증 코드"
            />
            <Button onClick={verify} disabled={busy} className="mt-4 w-full">
              {busy ? "확인 중..." : "확인"}
            </Button>
          </>
        ) : null}
        {error && (
          <p className="mt-4 text-xs text-center text-red-300" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
