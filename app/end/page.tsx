"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function EndPage() {
  const router = useRouter();

  useEffect(() => {
    void fetch("/api/auth/logout", {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });

    const checkSession = async () => {
      try {
        const response = await fetch("/api/session", { cache: "no-store" });
        if (!response.ok) return;

        const session = (await response.json()) as { in_postsession?: boolean };
        if (session.in_postsession === false) {
          router.replace("/");
        }
      } catch {
        // 네트워크 오류는 다음 주기에 다시 확인한다.
      }
    };

    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void checkSession();
      }
    };

    void checkSession();
    const intervalId = window.setInterval(checkSession, 5_000);
    window.addEventListener("focus", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-gray-900 text-white">
      <h1 className="text-2xl font-bold mb-3">청대 시그널이 종료됐어요</h1>
      <p className="text-sm text-gray-300 text-center max-w-sm">
        모든 매칭이 종료됐어요.<br />
        곧 모든 데이터가 폐기될 예정이에요.
      </p>
      <Link
        href="/"
        className="mt-6 rounded bg-gray-700 px-4 py-2 text-xs font-semibold"
      >
        다시 로그인하기
      </Link>
      <p className="mt-2 text-[10px] text-gray-500">
        운영 시간이 연장되면 로그인 화면으로 자동 이동합니다.
      </p>
      <p className="text-xs text-gray-500 mt-8">고생 많으셨습니다.</p>
    </main>
  );
}
