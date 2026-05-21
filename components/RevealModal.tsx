"use client";

import { useState } from "react";
import { Postit } from "@/components/Postit";
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl p-6 max-w-xs w-full text-center shadow-xl">
        <div className="flex justify-center mb-3">
          <Postit text={card.one_liner} color={card.color} size="sm" rotation={1} />
        </div>
        <div className="text-xs text-gray-500 mb-1">인스타그램 ID</div>
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="font-mono text-lg font-bold text-gray-800">@{instagramId}</span>
          <button onClick={copy} className="bg-blue-600 text-white text-xs px-3 py-1 rounded font-semibold">
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
        <p className="text-[10px] text-gray-500 mb-4">인스타 앱에서 직접 검색해서 팔로우 해주세요</p>
        <button onClick={onClose} className="text-xs text-gray-500 underline">닫기</button>
      </div>
    </div>
  );
}
