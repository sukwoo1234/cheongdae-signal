"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BoardGrid } from "@/components/BoardGrid";
import { RatioCounter } from "@/components/RatioCounter";
import { ConfirmModal } from "@/components/ConfirmModal";
import { RevealModal } from "@/components/RevealModal";
import { CountdownBanner } from "@/components/CountdownBanner";
import { SignalLoading } from "@/components/SignalLoading";
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

  const loadSession = useCallback(async () => {
    const response = await fetch("/api/session");
    if (!response.ok) {
      setLoadFailed(true);
      return false;
    }

    setSessionState((await response.json()) as SessionState);
    setLoadFailed(false);
    return true;
  }, []);

  const loadAll = useCallback(async () => {
    const [sRes, mc, mm] = await Promise.all([
      fetch("/api/session"),
      fetch("/api/cards/me").then((r) => (r.ok ? r.json() : { card: null })),
      fetch("/api/matches/me").then((r) => (r.ok ? r.json() : { matches: [], slot: null })),
    ]);
    if (!sRes.ok) {
      // 예전에는 에러 응답 객체를 그대로 state에 넣어서, 렌더 중
      // state.config.threshold_male 접근이 TypeError로 터졌다.
      setLoadFailed(true);
      return;
    }
    const s: SessionState = await sRes.json();
    setLoadFailed(false);
    setSessionState(s);
    setMyCard(mc.card ?? null);
    setHasUsedSlot(mm.slot ? mm.slot.remaining <= 0 : ((mm.matches ?? []) as MyMatch[]).length > 0);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // 세션 상태는 보드가 열린 뒤에도 계속 바뀐다. 임계점 충족뿐 아니라 종료 시각과
  // 관리자의 강제 잠금도 새로고침 없이 반영해야 한다. 카드·매칭까지 매번 읽으면
  // 참가자가 많을 때 요청량이 커지므로 가벼운 /api/session만 폴링한다.
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadSession();
    };
    const t = setInterval(refreshWhenVisible, 5000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadSession]);

  useEffect(() => {
    if (sessionState?.in_postsession) router.replace("/end");
  }, [sessionState?.in_postsession, router]);

  async function confirmReveal() {
    if (!pending) return;
    setRevealing(true);
    setError(null);
    const res = await fetch("/api/matches", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
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
        CARD_FULL: "이 카드는 마감됐어요. 다른 카드를 골라주세요",
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
    return <SignalLoading message="보드의 새로운 카드들을 준비하고 있어요." />;
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
    <main
      className="relative min-h-screen bg-[#edf5ff] bg-cover bg-center bg-fixed"
      style={{ backgroundImage: "url('/hero-campus.webp')" }}
    >
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(180deg,rgba(237,246,255,.72),rgba(255,255,255,.88)_45%,rgba(255,247,249,.68))]" />
      <CountdownBanner endsAt={sessionState.config.ends_at} />
      <header className="sticky top-0 z-10 border-b border-white/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/board" className="hidden items-center gap-2 text-xs font-extrabold text-[#071b33] sm:flex"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#071b33] text-[10px] text-white">S</span>청대 시그널</Link>
            <RatioCounter initialMale={sessionState.counts.male} initialFemale={sessionState.counts.female} />
          </div>
          <nav className="flex shrink-0 gap-1 text-xs font-semibold">
            <Link href="/my/matches" className="rounded-lg bg-[#071b33] px-3 py-2 text-white">내 매칭</Link>
            <Link href="/my/card" className="rounded-lg px-3 py-2 text-[#526176] hover:bg-[#eef2f6]">내 카드</Link>
          </nav>
        </div>
      </header>

      <div className="relative mx-auto max-w-6xl px-3 py-5 sm:px-5 sm:py-7">
        <div className="mb-4 px-1 text-center sm:text-left">
          <p className="text-xs text-[#7186a3]">카드를 열면 선택 기회가 사용되고 상대의 인스타그램 ID가 공개됩니다.</p>
          <h1 className="mt-7 text-3xl font-semibold leading-snug tracking-[-0.045em] text-[#4e6f9b] sm:text-4xl" style={{ fontFamily: "'Segoe Print', 'Apple SD Gothic Neo', sans-serif" }}>
            좋은 인연이<br className="sm:hidden" /> 기다리고 있어요 ♡
          </h1>
          <p className="mt-2 text-[9px] font-semibold tracking-[0.28em] text-[#7187a7]">CHEONGJU UNIVERSITY</p>
        </div>
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
          role="alert"
          className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 cursor-pointer rounded-xl bg-[#c93648] px-4 py-3 text-center text-xs font-semibold text-white shadow-xl"
          onClick={() => setError(null)}
        >
          {error}
        </div>
      )}
    </main>
  );
}
