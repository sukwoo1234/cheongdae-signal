"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

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
    const res = await fetch("/api/users/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gender, terms, privacy }),
    });
    if (res.ok) {
      router.push("/card/new");
    } else {
      setError("저장 실패. 다시 시도해주세요.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#faf6e8]">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6">
        <h1 className="text-lg font-bold text-center mb-6">시작하기 전에</h1>

        <div className="mb-4">
          <label className="text-xs text-gray-600 block mb-2">성별 (변경 불가)</label>
          <div className="flex gap-2">
            <button
              onClick={() => setGender("M")}
              className={`flex-1 py-2 rounded-md text-sm font-semibold ${
                gender === "M" ? "bg-blue-600 text-white" : "bg-white border border-gray-300 text-gray-700"
              }`}
            >
              남자
            </button>
            <button
              onClick={() => setGender("F")}
              className={`flex-1 py-2 rounded-md text-sm font-semibold ${
                gender === "F" ? "bg-pink-500 text-white" : "bg-white border border-gray-300 text-gray-700"
              }`}
            >
              여자
            </button>
          </div>
        </div>

        <div className="mb-2">
          <label className="text-xs text-gray-600 block mb-2">약관 동의 (필수)</label>
          <label className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-2 mb-2 cursor-pointer">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            <span className="text-xs">
              <Link href="/terms" target="_blank" className="text-blue-600 underline">이용약관</Link> 동의
            </span>
          </label>
          <label className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-2 mb-4 cursor-pointer">
            <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
            <span className="text-xs">
              <Link href="/privacy" target="_blank" className="text-blue-600 underline">개인정보 처리방침</Link> 동의
            </span>
          </label>
        </div>

        <Button onClick={submit} disabled={!canSubmit} className="w-full">
          {loading ? "저장 중..." : "다음"}
        </Button>
        {error && <p className="text-red-600 text-xs text-center mt-3">{error}</p>}
      </div>
    </main>
  );
}
