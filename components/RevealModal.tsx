"use client";

import { useState } from "react";
import { PetalCard } from "@/components/PetalCard";
import { PostitColor } from "@/lib/constants";

interface Props {
  card: { one_liner: string; color: PostitColor };
  instagramId: string;
  onClose: () => void;
}

export function RevealModal({ card, instagramId, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(instagramId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#071b33]/55 px-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-t-[28px] bg-white p-6 text-center shadow-2xl sm:rounded-[28px] sm:p-8">
        <div className="flex justify-center mb-3">
          <PetalCard text={card.one_liner} color={card.color} size="sm" rotation={1} />
        </div>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8390a2]">Instagram</div>
        <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl bg-[#f1f5f9] px-3 py-3">
          <span className="break-all font-mono text-base font-bold text-[#071b33]">@{instagramId}</span>
          <button onClick={copy} className="shrink-0 rounded-lg bg-[#071b33] px-3 py-1.5 text-xs font-semibold text-white">
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
        <p className="mb-5 text-[11px] text-[#637083]">인스타그램 앱에서 검색해 대화를 시작해보세요.</p>
        <button onClick={onClose} className="min-h-10 w-full rounded-xl border border-[#d8e1eb] text-xs font-semibold text-[#526176] hover:bg-[#f7f9fc]">보드로 돌아가기</button>
      </div>
    </div>
  );
}
