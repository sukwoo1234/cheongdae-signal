"use client";

import { CampusShell } from "@/components/CampusShell";
import { PetalCard } from "@/components/PetalCard";
import type { PostitColor } from "@/lib/constants";
import type { SessionState } from "@/lib/types";

interface Props {
  /** 폴링은 부모(BoardPage)가 담당한다. 여기서 따로 fetch하면 부모의 분기가
   *  갱신되지 않아 임계점이 채워져도 보드로 넘어가지 못했다. */
  state: SessionState;
  myCard: { one_liner: string; color: PostitColor } | null;
}

export function Gating({ state, myCard }: Props) {
  const notStarted = new Date(state.config.starts_at).getTime() > Date.now();

  return (
    <CampusShell className="min-h-[960px] sm:min-h-screen">
      <section className="relative mx-auto mt-7 max-w-[560px] rounded-[32px] border border-white/90 bg-white/90 px-6 pb-8 pt-14 shadow-[0_28px_80px_rgba(54,90,139,.18)] backdrop-blur-xl sm:px-10 sm:pb-10">
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-full border-[6px] border-white bg-[#edf2ff] px-5 py-2 text-xs font-extrabold text-[#356ed1] shadow-sm">✦ &nbsp;보드 준비 중</div>
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-black leading-[1.35] tracking-[-0.04em] text-[#10243f] sm:text-3xl">보드가 열리면,<br /><span className="text-[#326fd0]">더 많은 인연</span>을 만날 수 있어요!</h1>
          <p className="mt-3 text-sm leading-6 text-[#6d81a0]">참가 인원을 확인한 뒤 보드가 열립니다.</p>
        </div>
        <div className="mb-5 rounded-2xl bg-[linear-gradient(135deg,#f3f8ff,#fff6fb)] px-5 py-5 text-center sm:py-6">
          <p className="text-sm font-extrabold text-[#3f5677]"><span className="mr-2 text-[#43c99d]">●</span>보드 오픈 준비 중</p>
          <p className="mt-2 text-xs leading-5 text-[#6d81a0]">
            {notStarted
              ? `${new Date(state.config.starts_at).toLocaleString("ko-KR")}부터 확인하실 수 있어요.`
              : "준비가 완료되면 자동으로 보드가 열립니다."}
          </p>
        </div>

        {myCard && (
          <>
            <div className="mb-3 text-sm font-extrabold text-[#3f5677]">▣ &nbsp;내 카드 <span className="font-medium text-[#8293aa]">(등록 완료)</span></div>
            <div className="mb-5 flex justify-center rounded-2xl bg-white py-4">
              <PetalCard text={myCard.one_liner} color={myCard.color} rotation={-2} size="md" />
            </div>
          </>
        )}

        <div className="rounded-2xl bg-[linear-gradient(90deg,#eef5ff,#fff1f6)] px-4 py-4 text-center text-xs leading-5 text-[#627b9d]">조금만 더 기다려주세요!<br /><strong className="text-[#3e5e89]">좋은 인연이 곧 시작될 거예요.</strong></div>
        <p className="mt-4 text-center text-[10px] font-medium text-[#8395ad]">조건이 충족되면 자동으로 새로고침됩니다.</p>
      </section>
    </CampusShell>
  );
}
