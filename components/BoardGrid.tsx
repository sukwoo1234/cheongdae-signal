"use client";

import { useEffect, useState } from "react";
import { PetalCard } from "@/components/PetalCard";
import { PostitColor } from "@/lib/constants";

interface BoardCard {
  id: string;
  one_liner: string;
  color: PostitColor;
}

interface Props {
  onCardClick: (card: BoardCard) => void;
  reloadKey?: number;
}

export function BoardGrid({ onCardClick, reloadKey }: Props) {
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/board")
      .then((r) => r.json())
      .then((d) => {
        setCards(d.cards ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [reloadKey]);

  if (loading) return <p className="py-20 text-center text-sm text-[#8390a2]">카드를 불러오는 중…</p>;
  if (cards.length === 0) {
    return <p className="py-20 text-center text-sm text-[#8390a2]">아직 공개된 카드가 없어요.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-x-0 gap-y-3 overflow-hidden px-0 py-8 sm:grid-cols-3 sm:gap-x-3 sm:px-5 md:grid-cols-4 lg:grid-cols-5">
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
