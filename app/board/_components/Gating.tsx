"use client";

import { useEffect, useState } from "react";
import { Postit } from "@/components/Postit";
import type { PostitColor } from "@/lib/constants";
import type { SessionState } from "@/lib/types";

interface Props {
  myCard: { one_liner: string; color: PostitColor } | null;
}

export function Gating({ myCard }: Props) {
  const [state, setState] = useState<SessionState | null>(null);

  useEffect(() => {
    const fetchState = () => fetch("/api/session").then((r) => r.json()).then(setState);
    fetchState();
    const interval = setInterval(fetchState, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!state) return <main className="min-h-screen flex items-center justify-center">불러오는 중...</main>;

  const oppositeIsFemale = state.counts.male > state.counts.female;
  const oppositeCount = oppositeIsFemale ? state.counts.female : state.counts.male;
  const threshold = oppositeIsFemale ? state.config.threshold_female : state.config.threshold_male;
  const needed = Math.max(0, threshold - oppositeCount);

  return (
    <main className="min-h-screen px-6 py-8 bg-[#fffbf2]">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow p-6">
        <div className="bg-orange-50 border-l-4 border-orange-400 rounded p-3 mb-4">
          <div className="text-xs font-bold text-orange-600 mb-1">⏳ 보드 준비 중</div>
          <p className="text-xs text-gray-700">
            {needed > 0
              ? `${oppositeIsFemale ? "여학생" : "남학생"} ${needed}명 더 등록되면 오픈돼요`
              : "곧 시작됩니다"}
          </p>
        </div>

        <div className="text-xs text-gray-600 mb-2">실시간 등록 현황</div>
        <div className="flex gap-2 mb-4">
          <div className="flex-1 bg-blue-50 p-3 rounded text-center">
            <div className="text-[10px] text-gray-600">남자</div>
            <div className="text-xl font-bold text-blue-600">{state.counts.male}</div>
          </div>
          <div className="flex-1 bg-pink-50 p-3 rounded text-center">
            <div className="text-[10px] text-gray-600">여자</div>
            <div className="text-xl font-bold text-pink-500">{state.counts.female}</div>
          </div>
        </div>

        {myCard && (
          <>
            <div className="text-xs text-gray-600 mb-2">내 카드 (등록 완료)</div>
            <div className="flex justify-center mb-4">
              <Postit text={myCard.one_liner} color={myCard.color} rotation={-2} size="md" />
            </div>
          </>
        )}

        <p className="text-[10px] text-gray-500 text-center">자동으로 새로고침돼요</p>
      </div>
    </main>
  );
}
