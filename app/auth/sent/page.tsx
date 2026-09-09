"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AuthCaptcha } from "@/components/AuthCaptcha";
import { CampusShell } from "@/components/CampusShell";

function SentInner() {
  const params = useSearchParams();
  const email = params.get("email") || "";
  const [cooldown, setCooldown] = useState(60);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    setResending(true);
    setError(null);
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ email, captcha_token: captchaToken }),
    });
    setCaptchaToken("");
    setCaptchaKey((key) => key + 1);
    setResending(false);
    setCooldown(60);
    if (res.ok) {
      setResent(true);
      return;
    }
    // 서버측 한도에 걸리면 실제로는 메일이 안 갔는데도 예전 코드는
    // "다시 보냈어요"를 띄웠다. 응답을 확인해서 사실대로 알린다.
    const data = await res.json().catch(() => ({}));
    setError(
      data.error === "RATE_LIMITED"
        ? "너무 자주 요청했어요. 잠시 후 다시 시도해주세요"
        : data.error === "CAPTCHA_REQUIRED"
          ? "자동화 방지 인증을 완료해주세요"
        : "발송에 실패했어요. 잠시 후 다시 시도해주세요"
    );
  }

  return (
    <CampusShell className="min-h-[900px] sm:min-h-screen">
      <section className="mx-auto mt-6 w-full max-w-[460px] rounded-[30px] border border-white/90 bg-white/90 p-7 shadow-[0_28px_80px_rgba(54,90,139,.18)] backdrop-blur-xl sm:p-9">
        <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#dff8f3] text-[#079381]">
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden><path d="M4 6.5h16v11H4z" stroke="currentColor" strokeWidth="1.7"/><path d="m5 7.5 7 5 7-5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>
        </div>
        <p className="text-xs font-bold tracking-[0.12em] text-[#0ca18e]">링크를 보냈어요</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-[#071b33]">메일함을 확인해주세요.</h1>
        <p className="mt-3 text-sm leading-6 text-[#637083]">
          아래 주소로 로그인 링크를 보냈습니다. 메일에서 <strong className="text-[#24374f]">청대 시그널 시작하기</strong>를 눌러주세요.
        </p>
        <div className="mt-5 rounded-2xl bg-[#f1f5f9] px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8390a2]">받는 주소</div>
          <div className="mt-1 break-all font-mono text-xs font-semibold text-[#203149]">{email}</div>
        </div>
        <div className="mt-5 flex gap-3 rounded-xl border border-[#e4eaf1] p-3 text-xs leading-5 text-[#637083]">
          <span className="font-bold text-[#0ca18e]">15분</span>
          <span>링크는 한 번만 사용할 수 있어요. 메일이 없다면 스팸함도 확인해주세요.</span>
        </div>

        <div className="mt-6 flex justify-center"><AuthCaptcha key={captchaKey} onToken={setCaptchaToken} /></div>
        <Button variant="secondary" onClick={resend} disabled={resending || cooldown > 0} className="mt-4 w-full text-xs">
          {resent ? "새 링크를 보냈어요" : cooldown > 0 ? `다시 보내기 · ${cooldown}초` : "로그인 링크 다시 보내기"}
        </Button>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-center text-xs text-red-600">{error}</p>}
      </section>
    </CampusShell>
  );
}

export default function MagicLinkSent() {
  return (
    <Suspense fallback={null}>
      <SentInner />
    </Suspense>
  );
}
