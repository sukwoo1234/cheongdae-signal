"use client";

import { useEffect, useState } from "react";
import { PetalCard } from "@/components/PetalCard";
import { PostitColor } from "@/lib/constants";
import type { Gender } from "@/lib/types";

interface BoardCard {
  id: string;
  one_liner: string;
  color: PostitColor;
  gender: Gender;
}

interface Props {
  onCardClick: (card: BoardCard) => void;
  reloadKey?: number;
  targetGender?: Gender;
}

export function BoardGrid({ onCardClick, reloadKey, targetGender }: Props) {
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    const query = targetGender ? `?gender=${targetGender}` : "";
    fetch(`/api/board${query}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => {
        if (controller.signal.aborted) return;
        setCards(d.cards ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
        setError(true);
      });
    return () => controller.abort();
  }, [reloadKey, targetGender]);

  if (loading) return <p className="py-20 text-center text-sm text-[#8390a2]">카드를 불러오는 중…</p>;
  if (error) return <p role="alert" className="py-20 text-center text-sm text-[#8390a2]">카드를 불러오지 못했어요. 새로고침해 다시 확인해주세요.</p>;
  if (cards.length === 0) {
    return <p className="py-20 text-center text-sm text-[#8390a2]">아직 공개된 카드가 없어요.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-x-0 gap-y-3 overflow-x-clip overflow-y-visible px-0 pb-14 pt-8 sm:grid-cols-3 sm:gap-x-3 sm:px-5 md:grid-cols-4 lg:grid-cols-5">
      {cards.map((c, index) => (
        <div
          key={c.id}
          className={`flex justify-center ${index % 4 === 0 || index % 4 === 3 ? "translate-y-5" : "-translate-y-1"}`}
        >
          <PetalCard text={c.one_liner} color={c.color} size="md" onClick={() => onCardClick(c)} />
        </div>
      ))}
    </div>
  );
}
