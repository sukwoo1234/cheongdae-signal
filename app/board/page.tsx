"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BoardGrid } from "@/components/BoardGrid";
import { RatioCounter } from "@/components/RatioCounter";
import { ConfirmModal } from "@/components/ConfirmModal";
import { RevealModal } from "@/components/RevealModal";
import { CountdownBanner } from "@/components/CountdownBanner";
import { Gating } from "./_components/Gating";
import type { PostitColor } from "@/lib/constants";
import type { SessionState, MyCard, MyMatch } from "@/lib/types";

interface BoardCard {
  id: string;
  one_liner: string;
  color: PostitColor;
}

export default function BoardPage() {
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [myCard, setMyCard] = useState<MyCard | null>(null);
  const [pending, setPending] = useState<BoardCard | null>(null);
  const [revealed, setRevealed] = useState<{ card: BoardCard; instagramId: string } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [hasUsedSlot, setHasUsedSlot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const router = useRouter();

  const loadAll = useCallback(async () => {
    const sRes = await fetch("/api/session");
    if (!sRes.ok) {
      // 예전에는 에러 응답 객체를 그대로 state에 넣어서, 렌더 중
      // state.config.threshold_male 접근이 TypeError로 터졌다.
      setLoadFailed(true);
      return;
    }
    const s: SessionState = await sRes.json();
    const [mc, mm] = await Promise.all([
      fetch("/api/cards/me").then((r) => (r.ok ? r.json() : { card: null })),
      fetch("/api/matches/me").then((r) => (r.ok ? r.json() : { matches: [] })),
    ]);
    setLoadFailed(false);
    setSessionState(s);
    setMyCard(mc.card ?? null);
    setHasUsedSlot(((mm.matches ?? []) as MyMatch[]).filter((m) => !m.bonus).length > 0);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // 게이팅 중에는 5초마다 다시 확인해서 임계점이 채워지는 즉시 보드로 넘어간다.
  // 예전에는 폴링이 자식 Gating 안에만 있어서 결과가 부모에 전달되지 않았고,
  // "자동으로 새로고침돼요" 문구와 달리 수동 새로고침 전까지 넘어가지 않았다.
  const boardOpen = sessionState?.board_open ?? false;
  useEffect(() => {
    if (boardOpen) return;
    const t = setInterval(loadAll, 5000);
    return () => clearInterval(t);
  }, [boardOpen, loadAll]);

  useEffect(() => {
    if (sessionState?.in_postsession) router.replace("/end");
  }, [sessionState?.in_postsession, router]);

  async function confirmReveal() {
    if (!pending) return;
    setRevealing(true);
    setError(null);
    const res = await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_id: pending.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setRevealed({ card: pending, instagramId: data.instagram_id });
      setPending(null);
      setHasUsedSlot(true);
    } else {
      const msgs: Record<string, string> = {
        SLOT_ALREADY_USED: "이미 슬롯을 사용했어요",
        BOARD_CLOSED: "보드가 닫혀있어요",
        CARD_HIDDEN: "이 카드는 더 이상 볼 수 없어요",
        SAME_GENDER: "이 카드는 열 수 없어요",
        CANNOT_VIEW_OWN_CARD: "내 카드는 열 수 없어요",
        NO_CARD: "먼저 내 카드를 등록해야 슬롯이 생겨요",
        BANNED: "이용이 제한된 계정이에요",
      };
      setError(msgs[data.error] || "확인 실패");
    }
    setRevealing(false);
  }

  if (loadFailed) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-gray-700">지금은 정보를 불러올 수 없어요.</p>
        <button
          onClick={() => { setLoadFailed(false); loadAll(); }}
          className="text-xs font-semibold text-blue-600 underline"
        >
          다시 시도
        </button>
      </main>
    );
  }

  if (!sessionState) {
    return <main className="min-h-screen flex items-center justify-center">불러오는 중...</main>;
  }
  if (sessionState.in_postsession) return null;

  if (!sessionState.board_open) {
    return (
      <Gating
        state={sessionState}
        myCard={myCard ? { one_liner: myCard.one_liner, color: myCard.color } : null}
      />
    );
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
