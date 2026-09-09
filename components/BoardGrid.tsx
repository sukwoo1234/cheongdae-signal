"use client";

import { useEffect, useState } from "react";
import { Postit } from "@/components/Postit";
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
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 rounded-[24px] border border-[#e0e7ef] bg-[radial-gradient(circle_at_top,#ffffff_0%,#f5f8fb_75%)] px-3 py-8 sm:grid-cols-3 sm:px-6 md:grid-cols-4 lg:grid-cols-5">
      {cards.map((c) => (
        <div key={c.id} className="flex justify-center">
          <Postit text={c.one_liner} color={c.color} size="md" onClick={() => onCardClick(c)} />
        </div>
      ))}
    </div>
  );
}
