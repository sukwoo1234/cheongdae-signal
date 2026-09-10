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
        const response = await fetch("/api/session/status", { cache: "no-store" });
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
    <main className="min-h-screen bg-[#071b33] px-5 py-16 text-white">
      <section className="signal-enter mx-auto flex w-full max-w-md flex-col items-center rounded-[28px] border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl backdrop-blur sm:p-10">
      <span className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#15bfa9] text-lg font-black text-[#071b33]">S</span>
      <p className="text-xs font-bold tracking-[0.12em] text-[#69dfcf]">SESSION CLOSED</p>
      <h1 className="mb-3 mt-2 text-2xl font-extrabold tracking-[-0.035em]">오늘의 시그널이 종료됐어요.</h1>
      <p className="max-w-sm text-center text-sm leading-6 text-slate-300">
        모든 매칭이 종료됐어요.<br />
        곧 모든 데이터가 폐기될 예정이에요.
      </p>
      <Link
        href="/"
        className="mt-7 min-h-11 rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-xs font-semibold transition hover:bg-white/15"
      >
        다시 로그인하기
      </Link>
      <p className="mt-3 text-[10px] text-slate-500">
        운영 시간이 연장되면 로그인 화면으로 자동 이동합니다.
      </p>
      <p className="mt-8 text-xs text-slate-500">참여해주셔서 감사합니다.</p>
      </section>
    </main>
  );
}
