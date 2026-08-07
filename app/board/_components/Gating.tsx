"use client";

import { Postit } from "@/components/Postit";
import type { PostitColor } from "@/lib/constants";
import type { SessionState } from "@/lib/types";

interface Props {
  /** 폴링은 부모(BoardPage)가 담당한다. 여기서 따로 fetch하면 부모의 분기가
   *  갱신되지 않아 임계점이 채워져도 보드로 넘어가지 못했다. */
  state: SessionState;
  myCard: { one_liner: string; color: PostitColor } | null;
}

export function Gating({ state, myCard }: Props) {
  const maleNeeded = Math.max(0, state.config.threshold_male - state.counts.male);
  const femaleNeeded = Math.max(0, state.config.threshold_female - state.counts.female);
  const allMet = maleNeeded === 0 && femaleNeeded === 0;
  const notStarted = new Date(state.config.starts_at).getTime() > Date.now();

  return (
    <main className="min-h-screen px-6 py-8 bg-[#fffbf2]">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow p-6">
        <div className="bg-orange-50 border-l-4 border-orange-400 rounded p-3 mb-4">
          <div className="text-xs font-bold text-orange-600 mb-1">⏳ 보드 준비 중</div>
          <p className="text-xs text-gray-700">
            {notStarted ? (
              <>
                {new Date(state.config.starts_at).toLocaleString("ko-KR")}에 열려요.
              </>
            ) : allMet ? (
              "곧 시작됩니다"
            ) : (
              <>
                남녀가 각각 일정 인원 이상 모여야 보드가 열려요.{" "}
                {maleNeeded > 0 && <span>남학생 <strong>{maleNeeded}명</strong></span>}
                {maleNeeded > 0 && femaleNeeded > 0 && ", "}
                {femaleNeeded > 0 && <span>여학생 <strong>{femaleNeeded}명</strong></span>}
                {" 더 필요해요."}
              </>
            )}
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
