"use client";

import { useEffect } from "react";

export default function EndPage() {
  useEffect(() => {
    fetch("/api/auth/logout", { method: "POST" });
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-gray-900 text-white">
      <h1 className="text-2xl font-bold mb-3">청대 시그널이 종료됐어요</h1>
      <p className="text-sm text-gray-300 text-center max-w-sm">
        모든 매칭이 종료됐어요.<br />
        곧 모든 데이터가 폐기될 예정이에요.
      </p>
      <p className="text-xs text-gray-500 mt-8">고생 많으셨습니다.</p>
    </main>
  );
}
