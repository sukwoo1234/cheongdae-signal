"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function Landing() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      router.push(`/auth/sent?email=${encodeURIComponent(email)}`);
    } else {
      const data = await res.json().catch(() => ({ error: "UNKNOWN" }));
      const msgs: Record<string, string> = {
        DOMAIN_NOT_ALLOWED: "청주대학교 이메일 (@cju.ac.kr)만 가능해요",
        INVALID_EMAIL: "이메일 형식이 잘못됐어요",
        RATE_LIMITED: "너무 자주 요청했어요. 1분 뒤에 다시 시도해주세요",
        SEND_FAILED: "메일 발송 실패. 잠시 후 다시 시도해주세요",
      };
      setError(msgs[data.error] || "오류가 발생했어요");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-br from-[#faf6e8] via-[#fff3b0] to-[#ffd6e0]">
      <div className="text-xs font-bold tracking-widest text-gray-500 mb-2">청대 시그널</div>
      <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-800 text-center leading-tight">
        한 줄로 시작하는<br />인스타 매칭
      </h1>
      <p className="text-sm text-gray-600 mt-3">청주대학교 학생 전용</p>

      <form onSubmit={submit} className="mt-8 w-full max-w-sm flex flex-col gap-3">
        <Input
          type="email"
          placeholder="이름@cju.ac.kr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button type="submit" disabled={loading || !email}>
          {loading ? "보내는 중..." : "매직링크 받기"}
        </Button>
        {error && <p className="text-red-600 text-sm text-center">{error}</p>}
        <p className="text-xs text-gray-500 text-center mt-2">
          비밀번호 없이 이메일 한 번 클릭이면 끝
        </p>
      </form>
    </main>
  );
}
