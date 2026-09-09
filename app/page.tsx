"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthCaptcha } from "@/components/AuthCaptcha";

export default function Landing() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ email, captcha_token: captchaToken }),
    });
    setCaptchaToken("");
    setCaptchaKey((key) => key + 1);
    if (res.ok) {
      router.push(`/auth/sent?email=${encodeURIComponent(email)}`);
    } else {
      const data = await res.json().catch(() => ({ error: "UNKNOWN" }));
      const msgs: Record<string, string> = {
        DOMAIN_NOT_ALLOWED: "청주대학교 이메일 (@cju.ac.kr)만 가능해요",
        INVALID_EMAIL: "이메일 형식이 잘못됐어요",
        RATE_LIMITED: "너무 자주 요청했어요. 1분 뒤에 다시 시도해주세요",
        SEND_FAILED: "메일 발송 실패. 잠시 후 다시 시도해주세요",
        CAPTCHA_REQUIRED: "자동화 방지 인증을 완료해주세요",
        CAPTCHA_FAILED: "자동화 방지 인증이 만료됐어요. 다시 확인해주세요",
      };
      setError(msgs[data.error] || "오류가 발생했어요");
      setLoading(false);
    }
  }

  return (
    <main
      className="relative min-h-[920px] overflow-hidden bg-[#edf5ff] bg-cover bg-center px-5 py-8 sm:min-h-[980px] sm:py-12"
      style={{ backgroundImage: "url('/hero-campus.webp')" }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(242,248,255,.25)_0%,rgba(255,248,246,.58)_52%,rgba(252,245,248,.22)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-[70%] bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,.92),rgba(255,255,255,.32)_58%,transparent_78%)]" />

      <div className="signal-enter relative mx-auto flex w-full max-w-2xl flex-col items-center">
        <div className="flex items-center gap-2 rounded-full border border-white/80 bg-white/65 px-4 py-2 text-xs font-extrabold text-[#285b9f] shadow-sm backdrop-blur-md">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#3169b5] text-[10px] text-white">S</span>
          청대 시그널
        </div>

        <div className="mt-8 text-center sm:mt-10">
          <p className="text-[10px] font-bold tracking-[0.34em] text-[#6681a6]">SAME CAMPUS · NEW CONNECTIONS</p>
          <h1 className="mt-4 text-[40px] font-black leading-[1.12] tracking-[-0.055em] text-[#10243f] sm:text-[58px]">
            한 줄로 시작하는<br />
            <span className="bg-gradient-to-r from-[#326fc4] via-[#7c63e8] to-[#e75ca9] bg-clip-text text-transparent">인스타</span> 매칭
          </h1>
          <p className="mt-4 text-base font-bold text-[#263c59] sm:text-lg">청주대학교 학생 전용</p>
          <p className="mt-1.5 text-xs text-[#6c7f99] sm:text-sm">같은 캠퍼스, 새로운 인연이 시작되는 곳</p>
        </div>

        <form onSubmit={submit} className="mt-7 w-full max-w-[500px] rounded-[26px] border border-white/90 bg-white/75 p-4 shadow-[0_24px_70px_rgba(47,74,117,0.18)] backdrop-blur-xl sm:mt-9 sm:p-5">
          <label htmlFor="school-email" className="sr-only">청주대학교 이메일 주소</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8c9aae]">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden><path d="M4 6.5h16v11H4z" stroke="currentColor" strokeWidth="1.7"/><path d="m5 7.5 7 5 7-5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>
            </span>
            <Input
              id="school-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="학교 이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-14 border-white bg-white/90 pl-12 text-base shadow-sm"
              required
            />
          </div>
          <p className="mt-2 px-1 text-[11px] font-medium text-[#687d99]">
            청주대학교 이메일(@cju.ac.kr)을 입력해주세요.
          </p>
          <div className="mt-3 overflow-hidden rounded-xl"><AuthCaptcha key={captchaKey} onToken={setCaptchaToken} /></div>
          <Button type="submit" disabled={loading || !email} className="mt-3 h-14 w-full bg-gradient-to-r from-[#3169b5] via-[#7467dc] to-[#d85dac] text-base shadow-[0_12px_28px_rgba(93,94,201,.28)] hover:brightness-105">
            {loading ? "로그인 링크 보내는 중…" : "매직링크 받기  →"}
          </Button>
          {error && <p role="alert" className="mt-3 rounded-xl bg-red-50/90 px-3 py-2 text-center text-xs font-medium text-red-600">{error}</p>}
        </form>

        <p className="mt-3 text-center text-xs font-medium text-[#536985]">비밀번호 없이 이메일 링크 한 번이면 끝!</p>

        <div className="mt-48 grid w-full max-w-[620px] grid-cols-3 divide-x divide-[#cbd7e7] rounded-[24px] border border-white/80 bg-white/75 px-2 py-5 text-center shadow-[0_18px_50px_rgba(47,74,117,0.13)] backdrop-blur-xl sm:mt-56">
          <Feature value="같은 학교" label="더 가까운 소통" />
          <Feature value="청대생 전용" label="안전한 매칭" />
          <Feature value="간편하게" label="비밀번호 없이" />
        </div>
      </div>
    </main>
  );
}

function Feature({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[11px] font-extrabold text-[#183454] sm:text-sm">{value}</div>
      <div className="mt-1 text-[9px] text-[#74859c] sm:text-[10px]">{label}</div>
    </div>
  );
}
