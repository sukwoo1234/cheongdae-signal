"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";

function SentInner() {
  const params = useSearchParams();
  const email = params.get("email") || "";
  const [cooldown, setCooldown] = useState(60);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
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
        : "발송에 실패했어요. 잠시 후 다시 시도해주세요"
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#faf6e8]">
      <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mb-6 text-3xl">
        ✉
      </div>
      <h1 className="text-2xl font-bold text-gray-800">메일을 확인해주세요</h1>
      <p className="text-sm text-gray-600 mt-3 text-center max-w-sm">
        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">{email}</span><br />
        으로 매직링크를 보냈어요.<br />
        <strong>15분 안에</strong> 클릭해주세요.
      </p>
      <p className="text-xs text-gray-500 mt-6">메일이 안 오면 스팸함도 확인해주세요</p>

      <Button
        variant="secondary"
        onClick={resend}
        disabled={resending || cooldown > 0}
        className="mt-4 text-xs"
      >
        {resent ? "다시 보냈어요" : cooldown > 0 ? `다시 보내기 (${cooldown}s)` : "다시 보내기"}
      </Button>
      {error && <p className="text-red-600 text-xs text-center mt-3">{error}</p>}
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
