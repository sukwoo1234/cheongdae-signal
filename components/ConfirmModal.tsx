"use client";

import { PetalCard } from "@/components/PetalCard";
import { Button } from "@/components/ui/Button";
import { PostitColor } from "@/lib/constants";

interface Props {
  card: { id: string; one_liner: string; color: PostitColor } | null;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmModal({ card, onConfirm, onCancel, loading }: Props) {
  if (!card) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#071b33]/55 px-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-t-[28px] bg-white p-6 text-center shadow-2xl sm:rounded-[28px] sm:p-8">
        <div className="flex justify-center mb-4">
          <PetalCard text={card.one_liner} color={card.color} size="md" rotation={1} />
        </div>
        <h2 className="mb-1 text-lg font-extrabold tracking-[-0.025em] text-[#071b33]">이 카드가 마음에 드나요?</h2>
        <p className="mb-6 text-xs leading-5 text-[#637083]">확인하면 상대의 인스타그램 ID가 공개되고<br />선택 기회 1회가 사용됩니다.</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel} className="flex-1">취소</Button>
          <Button onClick={onConfirm} disabled={loading} className="flex-[1.5]">
            {loading ? "확인 중..." : "확인하기"}
          </Button>
        </div>
      </div>
    </div>
  );
}
