"use client";

import { useEffect, useState } from "react";
import { PetalCard } from "@/components/PetalCard";
import type { BoardCard, BoardSort, Gender } from "@/lib/types";

interface Props {
  onCardClick: (card: BoardCard) => void;
  reloadKey?: number;
  targetGender?: Gender;
}

export function BoardGrid({ onCardClick, reloadKey, targetGender }: Props) {
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState<BoardSort>("random");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ sort });
    if (targetGender) params.set("gender", targetGender);
    fetch(`/api/board?${params}`, { signal: controller.signal, cache: "no-store" })
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
  }, [reloadKey, targetGender, sort]);

  return (
    <section aria-label="공개 카드">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-between">
        <div role="group" aria-label="카드 정렬" className="inline-flex rounded-xl border border-white bg-white/85 p-1 shadow-sm">
          {([ ["random", "무작위"], ["newest", "최신순"] ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={sort === value}
              onClick={() => setSort(value)}
              className={`min-h-10 rounded-lg px-4 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#45658e] ${sort === value ? "bg-[#0b2b4c] text-white" : "text-[#526783] hover:bg-[#eef2f6]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[#526783]">최근 7일 등록한 카드에 ‘새 카드’가 표시돼요.</p>
      </div>
      <div aria-busy={loading}>
        {loading ? (
          <p role="status" className="py-20 text-center text-sm text-[#8390a2]">카드를 불러오는 중…</p>
        ) : error ? (
          <p role="alert" className="py-20 text-center text-sm text-[#8390a2]">카드를 불러오지 못했어요. 새로고침해 다시 확인해주세요.</p>
        ) : cards.length === 0 ? (
          <p className="py-20 text-center text-sm text-[#8390a2]">아직 공개된 카드가 없어요.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-0 gap-y-3 overflow-x-clip overflow-y-visible px-0 pb-14 pt-8 sm:grid-cols-3 sm:gap-x-3 sm:px-5 md:grid-cols-4 lg:grid-cols-5">
            {cards.map((c, index) => (
              <div key={c.id} className={`flex justify-center ${index % 4 === 0 || index % 4 === 3 ? "translate-y-5" : "-translate-y-1"}`}>
                <PetalCard text={c.one_liner} color={c.color} size="md" isNew={c.is_new} onClick={() => onCardClick(c)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
