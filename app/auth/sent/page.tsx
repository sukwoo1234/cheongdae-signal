"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AuthCaptcha } from "@/components/AuthCaptcha";

function SentInner() {
  const params = useSearchParams();
  const email = params.get("email") || "";
  const [cooldown, setCooldown] = useState(60);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const [copied, setCopied] = useState(false);

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

  async function copyEmail() {
    if (!email) return;
    await navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main
      className="relative min-h-[1080px] overflow-hidden bg-[radial-gradient(ellipse_at_18%_10%,rgba(255,255,255,.88)_0%,rgba(255,255,255,0)_38%),radial-gradient(ellipse_at_82%_28%,rgba(255,255,255,.72)_0%,rgba(255,255,255,0)_35%),radial-gradient(ellipse_at_30%_84%,rgba(255,255,255,.58)_0%,rgba(255,255,255,0)_34%),linear-gradient(180deg,#cfe8ff_0%,#e8efff_45%,#ffe1ee_100%)] px-4 py-8 sm:px-6 sm:py-14"
    >
      <div className="absolute -left-[10%] top-[12%] h-72 w-[55%] rounded-full bg-white/35 blur-3xl" />
      <div className="absolute -right-[8%] bottom-[6%] h-80 w-[58%] rounded-full bg-white/30 blur-3xl" />
      <section className="signal-enter relative mx-auto w-full max-w-[960px] rounded-[38px] border border-white/90 bg-white/78 px-6 py-8 shadow-[0_30px_90px_rgba(72,104,148,.18)] backdrop-blur-xl sm:px-[72px] sm:py-14">
        <div className="flex items-start justify-between">
          <div className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-[#e9f1ff] text-[#5d8fd9] sm:h-20 sm:w-20 sm:rounded-[22px]">
            <svg viewBox="0 0 24 24" fill="none" className="h-9 w-9 sm:h-11 sm:w-11" aria-hidden><path d="M4 6.5h16v11H4z" stroke="currentColor" strokeWidth="1.7"/><path d="m5 7.5 7 5 7-5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>
          </div>
          <div className="pt-1 text-right font-serif text-[11px] font-bold leading-4 tracking-[0.12em] text-[#7188ab] sm:text-sm sm:leading-5">CHEONGJU<br />UNIVERSITY</div>
        </div>

        <p className="mt-7 text-base font-extrabold text-[#5595ef] sm:mt-10 sm:text-2xl">링크를 보냈어요</p>
        <h1 className="mt-2 text-[38px] font-black leading-[1.14] tracking-[-0.055em] text-[#071b33] sm:text-[64px]">
          메일함을<br /><span className="text-[#ec78ad]">확인</span>해주세요<span className="text-[#ec78ad]">.</span>
        </h1>
        <p className="mt-6 text-[15px] leading-7 text-[#6981a3] sm:mt-8 sm:text-xl sm:leading-9">
          아래 주소로 로그인 링크를 보냈습니다.<br className="hidden sm:block" /> 메일에서 <strong className="text-[#172c4b]">청대 시그널 시작하기</strong>를 눌러주세요.
        </p>

        <div className="mt-7 flex items-center gap-3 rounded-2xl bg-[#edf2fb]/90 px-5 py-4 sm:mt-9 sm:px-7 sm:py-6">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold tracking-[0.08em] text-[#7188ab] sm:text-base">받는 주소</div>
            <div className="mt-1 break-all text-sm font-extrabold text-[#0e2748] sm:text-xl">{email}</div>
          </div>
          <button type="button" onClick={copyEmail} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-[#17355c] shadow-sm" aria-label="이메일 주소 복사">
            {copied ? <span className="text-[11px] font-bold">완료</span> : <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden><rect x="8" y="4" width="11" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M16 18v1a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1" stroke="currentColor" strokeWidth="1.8"/></svg>}
          </button>
        </div>

        <div className="mt-5 flex items-center rounded-2xl border border-[#f2d5e2] bg-[#fff7fa]/80 px-5 py-4 sm:mt-7 sm:px-7 sm:py-6">
          <span className="w-16 shrink-0 border-r border-[#efcadd] text-center text-xl font-black leading-7 text-[#e4629b] sm:w-24 sm:text-3xl sm:leading-9">15<br />분</span>
          <span className="pl-5 text-sm leading-6 text-[#6981a3] sm:pl-8 sm:text-lg sm:leading-8">링크는 한 번만 사용할 수 있어요.<br />메일이 없다면 스팸함도 확인해 주세요.</span>
        </div>

        <div className="relative mt-6 min-h-[82px] sm:mt-8 sm:min-h-[96px]">
          <div className={captchaToken ? "pointer-events-none absolute h-px w-px overflow-hidden opacity-0" : "flex min-h-[82px] items-center justify-center rounded-2xl border border-[#dce4ee] bg-white/70 px-3"}>
            <AuthCaptcha key={captchaKey} onToken={setCaptchaToken} />
          </div>
          {captchaToken && (
            <div className="flex min-h-[82px] items-center rounded-2xl border border-[#d7e2ee] bg-white/70 px-6 sm:min-h-[96px] sm:px-8">
              <span className="mr-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#13a359] text-white shadow-sm sm:h-14 sm:w-14">
                <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden><path d="m6 12.5 4 4L18.5 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
              <span className="text-xl font-extrabold text-[#132944] sm:text-2xl">성공!</span>
            </div>
          )}
        </div>

        <Button onClick={resend} disabled={resending || cooldown > 0 || !captchaToken} className="mt-6 h-16 w-full rounded-2xl border-0 bg-[linear-gradient(100deg,#78b8f6_0%,#b7a3ee_52%,#ef83bd_100%)] text-base font-bold text-white shadow-[0_12px_28px_rgba(114,132,210,.22)] hover:brightness-105 sm:mt-8 sm:h-[76px] sm:text-xl">
          {resent ? "새 링크를 보냈어요" : cooldown > 0 ? `다시 보내기 · ${cooldown}초` : <>로그인 링크 다시 보내기 <span className="ml-3 text-2xl font-light">→</span></>}
        </Button>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-center text-xs text-red-600">{error}</p>}
      </section>
    </main>
  );
}

export default function MagicLinkSent() {
  return (
    <Suspense fallback={null}>
      <SentInner />
    </Suspense>
  );
}
