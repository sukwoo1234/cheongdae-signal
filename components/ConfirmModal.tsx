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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#17304f]/60 px-5 py-8 backdrop-blur-[5px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-card-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onCancel();
      }}
    >
      <div className="relative w-full max-w-[390px] rounded-[30px] border border-white/90 bg-white/95 px-5 pb-6 pt-7 text-center shadow-[0_28px_90px_rgba(12,34,61,.32)] sm:px-8 sm:pb-8">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          aria-label="닫기"
          className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full text-[#778aa3] transition hover:bg-[#f1f5fa] hover:text-[#263d5a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8fe3] disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden>
            <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>

        <div className="mb-5 mt-3 flex justify-center">
          <div className="relative">
            <PetalCard text={card.one_liner} color={card.color} size="lg" rotation={-2} />
            <span aria-hidden className="absolute -right-3 top-3 h-1.5 w-5 rotate-[62deg] rounded-full bg-[#f08bab]" />
            <span aria-hidden className="absolute -right-5 top-8 h-1.5 w-5 rotate-[12deg] rounded-full bg-[#f08bab]" />
            <span aria-hidden className="absolute right-1 -top-1 h-1.5 w-5 rotate-[105deg] rounded-full bg-[#f08bab]" />
          </div>
        </div>
        <h2 id="confirm-card-title" className="text-[22px] font-black tracking-[-0.04em] text-[#0c2748]">
          이 카드가 마음에 드나요?
        </h2>
        <p className="mx-auto mt-3 max-w-[290px] text-[13px] leading-6 text-[#71839d]">
          확인하면 상대의 인스타그램 ID가 공개되고<br className="hidden min-[350px]:block" /> 선택 기회 1회가 사용됩니다.
        </p>
        <div className="mt-7 flex gap-2.5">
          <Button variant="secondary" onClick={onCancel} disabled={loading} className="h-14 flex-1 rounded-2xl text-base">취소</Button>
          <Button onClick={onConfirm} disabled={loading} className="h-14 flex-[1.1] rounded-2xl bg-[linear-gradient(135deg,#0b2b4c,#00213e)] text-base shadow-[0_10px_28px_rgba(5,34,61,.24)]">
            {loading ? "확인 중..." : "확인하기"}
          </Button>
        </div>
      </div>
    </div>
  );
}
