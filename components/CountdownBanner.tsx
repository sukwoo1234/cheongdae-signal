"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Props {
  endsAt: string;
}

export function CountdownBanner({ endsAt }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  if (secondsLeft > 24 * 3600 || secondsLeft <= 0) return null;

  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;
  const critical = secondsLeft <= 3600;

  return (
    <div className={`text-center text-xs px-3 py-2 ${critical ? "bg-red-600 text-white" : "bg-yellow-100 text-yellow-800"}`}>
      <strong>행사 종료 {hours}시간 {minutes}분 {seconds}초 남음.</strong>{" "}
      <Link href="/my/matches" className="underline">내 매칭</Link>에서 인스타 ID 백업해두세요.
    </div>
  );
}
