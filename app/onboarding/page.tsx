"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { CampusShell } from "@/components/CampusShell";

export default function Onboarding() {
  const [gender, setGender] = useState<"M" | "F" | null>(null);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const canSubmit = gender && terms && privacy && !loading;

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users/onboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ gender, terms, privacy }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.replace("/card/new");
        return;
      }

      const messages: Record<string, string> = {
        INVALID_GENDER: "성별을 다시 선택해주세요.",
        TERMS_REQUIRED: "필수 약관에 모두 동의해주세요.",
        GENDER_ALREADY_SET: "이미 다른 성별로 등록되어 있어요. 다시 로그인해주세요.",
        UNAUTHENTICATED: "로그인 연결이 만료됐어요. 첫 화면에서 다시 로그인해주세요.",
        SESSION_INVALID: "로그인 연결이 만료됐어요. 첫 화면에서 다시 로그인해주세요.",
        DOMAIN_NOT_ALLOWED: "청주대학교 이메일 계정만 참여할 수 있어요.",
        BANNED: "이용이 제한된 계정이에요.",
        CSRF_FAILED: "페이지 연결이 만료됐어요. 새로고침 후 다시 시도해주세요.",
        DB_ERROR: "저장 중 일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
      };
      setError(messages[data.error] ?? "저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    } catch {
      setError("네트워크 연결이 불안정해요. 연결을 확인하고 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <CampusShell className="min-h-[900px] sm:min-h-screen">
      <section className="relative mx-auto mt-8 w-full max-w-[560px] rounded-[32px] border border-white/90 bg-white/90 px-6 pb-7 pt-16 shadow-[0_28px_80px_rgba(54,90,139,.18)] backdrop-blur-xl sm:px-10 sm:pb-10">
        <div className="absolute -top-10 left-1/2 flex h-20 w-20 -translate-x-1/2 items-center justify-center rounded-full border-[8px] border-white bg-gradient-to-br from-[#e4e6ff] to-[#f7e9ff] text-[#6d7ee8] shadow-sm">
          <svg viewBox="0 0 24 24" fill="none" className="h-9 w-9" aria-hidden><path d="m3 9 9-4 9 4-9 4-9-4Z" fill="currentColor" opacity=".8"/><path d="M7 11.2v4.1c2.8 2.2 7.2 2.2 10 0v-4.1" stroke="currentColor" strokeWidth="1.6"/><path d="M21 9v5" stroke="currentColor" strokeWidth="1.6"/></svg>
        </div>
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black tracking-[-0.045em] text-[#10243f]">시작하기 전에</h1>
          <p className="mt-2 text-sm text-[#7083a0]">더 좋은 매칭을 위해 몇 가지만 알려주세요.</p>
        </div>

        <div className="mb-4">
          <label className="mb-2.5 block text-sm font-bold text-[#3f5677]">성별 <span className="font-normal text-[#8395ad]">(변경 불가)</span></label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setGender("M")}
              className={`min-h-16 flex-1 rounded-xl border py-2 text-base font-bold transition ${
                gender === "M" ? "border-[#78a9ef] bg-blue-50 text-[#2f72d3] shadow-sm ring-2 ring-blue-100" : "border-[#bfd4f3] bg-[#f7faff] text-[#3d78cd] hover:bg-blue-50"
              }`}
            >
              <span className="mr-2 text-xl" aria-hidden>●</span> 남자
            </button>
            <button
              type="button"
              onClick={() => setGender("F")}
              className={`min-h-16 flex-1 rounded-xl border py-2 text-base font-bold transition ${
                gender === "F" ? "border-[#eca8c2] bg-pink-50 text-[#d65e8a] shadow-sm ring-2 ring-pink-100" : "border-[#f1c5d5] bg-[#fff9fb] text-[#d36a92] hover:bg-pink-50"
              }`}
            >
              <span className="mr-2 text-xl" aria-hidden>●</span> 여자
            </button>
          </div>
        </div>

        <div className="mb-2">
          <label className="mb-2.5 mt-6 block text-sm font-bold text-[#3f5677]">약관 동의 <span className="font-normal text-[#8395ad]">(필수)</span></label>
          <label className="mb-2 flex cursor-pointer items-center gap-3 rounded-xl border border-[#dce4ef] bg-white px-4 py-3.5 transition hover:bg-[#f8fbff]">
            <input className="h-5 w-5 accent-[#4a86dc]" type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            <span className="flex flex-1 items-center justify-between text-sm text-[#263c5b]">
              <span><Link href="/terms" target="_blank" className="font-semibold text-[#3274d1] underline underline-offset-2">이용약관</Link> 동의</span><span className="text-xl text-[#92a1b6]">›</span>
            </span>
          </label>
          <label className="mb-6 flex cursor-pointer items-center gap-3 rounded-xl border border-[#dce4ef] bg-white px-4 py-3.5 transition hover:bg-[#f8fbff]">
            <input className="h-5 w-5 accent-[#4a86dc]" type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
            <span className="flex flex-1 items-center justify-between text-sm text-[#263c5b]">
              <span><Link href="/privacy" target="_blank" className="font-semibold text-[#3274d1] underline underline-offset-2">개인정보 처리방침</Link> 동의</span><span className="text-xl text-[#92a1b6]">›</span>
            </span>
          </label>
        </div>

        <Button onClick={submit} disabled={!canSubmit} className="h-14 w-full bg-gradient-to-r from-[#5d8fe0] to-[#91a5dc] text-base shadow-[0_12px_28px_rgba(75,112,174,.22)]">
          {loading ? "저장 중…" : "다음  →"}
        </Button>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-center text-xs text-red-600">{error}</p>}
      </section>
    </CampusShell>
  );
}
