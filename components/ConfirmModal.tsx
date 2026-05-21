"use client";

import { Postit } from "@/components/Postit";
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl p-6 max-w-xs w-full text-center shadow-xl">
        <div className="flex justify-center mb-4">
          <Postit text={card.one_liner} color={card.color} size="md" rotation={1} />
        </div>
        <p className="text-sm text-gray-700 mb-1">이 카드의 인스타를 확인할까요?</p>
        <p className="text-xs text-gray-500 mb-5">슬롯은 한 번만 사용 가능해요</p>
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
