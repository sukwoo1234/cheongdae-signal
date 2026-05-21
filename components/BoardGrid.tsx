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

  if (loading) return <p className="text-center text-gray-500 py-10 text-sm">불러오는 중...</p>;
  if (cards.length === 0) {
    return <p className="text-center text-gray-500 py-10 text-sm">아직 카드가 없어요. 잠시만요.</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 bg-[#faf6e8] p-4 rounded-xl">
      {cards.map((c) => (
        <div key={c.id} className="flex justify-center">
          <Postit text={c.one_liner} color={c.color} size="md" onClick={() => onCardClick(c)} />
        </div>
      ))}
    </div>
  );
}
