"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BoardGrid } from "@/components/BoardGrid";
import { RatioCounter } from "@/components/RatioCounter";
import { ConfirmModal } from "@/components/ConfirmModal";
import { RevealModal } from "@/components/RevealModal";
import { CountdownBanner } from "@/components/CountdownBanner";
import { Gating } from "./_components/Gating";
import type { PostitColor } from "@/lib/constants";
import type { SessionState, Card } from "@/lib/types";

interface BoardCard {
  id: string;
  one_liner: string;
  color: PostitColor;
}

export default function BoardPage() {
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [myCard, setMyCard] = useState<Card | null>(null);
  const [pending, setPending] = useState<BoardCard | null>(null);
  const [revealed, setRevealed] = useState<{ card: BoardCard; instagramId: string } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [hasUsedSlot, setHasUsedSlot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const router = useRouter();

  async function loadAll() {
    const [s, mc, mm] = await Promise.all([
      fetch("/api/session").then((r) => r.json()),
      fetch("/api/cards/me").then((r) => (r.ok ? r.json() : { card: null })),
      fetch("/api/matches/me").then((r) => (r.ok ? r.json() : { matches: [] })),
    ]);
    setSessionState(s);
    setMyCard(mc.card);
    setHasUsedSlot((mm.matches ?? []).filter((m: { bonus: boolean }) => !m.bonus).length > 0);
  }

  useEffect(() => { loadAll(); }, []);

  async function confirmReveal() {
    if (!pending) return;
    setRevealing(true);
    setError(null);
    const res = await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_id: pending.id }),
    });
    const data = await res.json();
    if (res.ok) {
      setRevealed({ card: pending, instagramId: data.instagram_id });
      setPending(null);
      setHasUsedSlot(true);
    } else {
      const msgs: Record<string, string> = {
        SLOT_ALREADY_USED: "이미 슬롯을 사용했어요",
        BOARD_CLOSED: "보드가 닫혀있어요",
        CARD_HIDDEN: "이 카드는 더 이상 볼 수 없어요",
      };
      setError(msgs[data.error] || "확인 실패");
    }
    setRevealing(false);
  }

  if (!sessionState) return <main className="min-h-screen flex items-center justify-center">불러오는 중...</main>;
  if (sessionState.in_postsession) {
    router.push("/end");
    return null;
  }
  if (sessionState.in_pregating || !sessionState.board_open) {
    return <Gating myCard={myCard ? { one_liner: myCard.one_liner, color: myCard.color } : null} />;
  }

  return (
    <main className="min-h-screen bg-white">
      <CountdownBanner endsAt={sessionState.config.ends_at} />
      <header className="border-b px-4 py-3 flex items-center justify-between sticky top-0 bg-white z-10">
        <RatioCounter initialMale={sessionState.counts.male} initialFemale={sessionState.counts.female} />
        <nav className="flex gap-3 text-xs">
          <Link href="/my/matches" className="text-blue-600 font-semibold">내 매칭</Link>
          <Link href="/my/card" className="text-gray-600">내 카드</Link>
        </nav>
      </header>

      <div className="p-3">
        <BoardGrid
          reloadKey={reloadKey}
          onCardClick={(c) => {
            if (hasUsedSlot) {
              setError("슬롯을 이미 사용했어요. '내 매칭'에서 확인하세요.");
              return;
            }
            setPending(c);
          }}
        />
      </div>

      <ConfirmModal card={pending} onConfirm={confirmReveal} onCancel={() => setPending(null)} loading={revealing} />
      {revealed && (
        <RevealModal
          card={revealed.card}
          instagramId={revealed.instagramId}
          onClose={() => {
            setRevealed(null);
            setReloadKey((k) => k + 1);
            loadAll();
          }}
        />
      )}

      {error && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs px-4 py-2 rounded-full shadow cursor-pointer"
          onClick={() => setError(null)}
        >
          {error}
        </div>
      )}
    </main>
  );
}
