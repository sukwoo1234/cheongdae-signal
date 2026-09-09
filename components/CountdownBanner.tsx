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

  // 운영자가 종료 시각을 변경하면 이미 열린 화면의 카운트다운도 즉시 재동기화한다.
  useEffect(() => {
    setSecondsLeft(Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000)));
  }, [endsAt]);

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
    <div className={`px-4 py-2.5 text-center text-[11px] font-medium ${critical ? "bg-[#c93648] text-white" : "border-b border-[#dce4ee] bg-[#eef8f6] text-[#176d62]"}`}>
      <strong>종료까지 {hours}시간 {minutes}분 {seconds}초</strong>
      <span className="mx-2 opacity-40">·</span>
      <Link href="/my/matches" className="font-bold underline underline-offset-2">매칭 백업하기</Link>
    </div>
  );
}
