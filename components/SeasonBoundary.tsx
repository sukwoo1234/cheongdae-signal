"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CampusShell } from "./CampusShell";
import { SignalLoading } from "./SignalLoading";
import type { SeasonState } from "@/lib/types";
import { needsSeasonTransition, seasonAudienceLabel, seasonEndLabel } from "@/lib/season-consent";

export function SeasonBoundary({ children }: { children: ReactNode }) {
  const [season, setSeason] = useState<SeasonState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/season", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) { router.replace("/"); return; }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSeason(data.season);
      setError("");
    } catch { setError("운영 정보를 불러오지 못했어요. 다시 시도해주세요."); }
  }, [router]);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);

  // New participants agree in their card form, not in a second interstitial.
  const needsCardRegistration = !!season && season.continuous_mode && !season.accepted
    && !needsSeasonTransition(season) && new Date(season.ends_at).getTime() > Date.now();
  useEffect(() => {
    if (needsCardRegistration) router.replace("/card/new");
  }, [needsCardRegistration, router]);

  async function accept() {
    if (!season || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/season", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ accepted: true, event_id: season.event_id,
          ends_at: season.ends_at, board_mode: season.board_mode }),
      });
      if (!res.ok) {
        await load();
        setError("운영 정보가 바뀌었거나 동의 저장에 실패했어요. 내용을 확인하고 다시 시도해주세요.");
      } else { await load(); }
    } catch { setError("동의를 저장하지 못했어요. 다시 시도해주세요."); }
    finally { setBusy(false); }
  }

  if (season && (!season.continuous_mode || season.accepted)) return <>{children}</>;
  if (season && new Date(season.ends_at).getTime() <= Date.now()) {
    return <CampusShell><p className="mt-12 text-center">이번 운영이 종료됐어요. <Link className="underline" href="/end">종료 안내</Link></p></CampusShell>;
  }
  if (needsCardRegistration) return <SignalLoading message="카드 작성 화면으로 이동하고 있어요." />;
  if (!season && !error) return <SignalLoading message="이번 운영 정보를 확인하고 있어요." />;
  return (
    <CampusShell>
      <section className="mx-auto mt-8 max-w-lg rounded-3xl border border-white bg-white/95 p-6 text-sm leading-6 text-[#526783] shadow-xl sm:p-8">
        <h1 className="mb-4 text-xl font-black text-[#10243f]">운영 방식이 달라졌어요</h1>
        {season && <>
          <p>기존 카드를 <strong>{seasonEndLabel(season.ends_at)} (한국시간)</strong>까지 유지하고, <strong>{seasonAudienceLabel(season.board_mode)} 공개</strong>합니다.</p>
          <p className="mt-3 text-xs">연락처는 내 카드를 선택한 참가자에게만 공개되며, 카드·연락처·선택 기록은 운영 종료 후 7일 이내 폐기합니다. 숨긴 카드는 계속 숨김 상태로 유지됩니다.</p>
          <p className="mt-3 text-xs"><Link className="underline" href="/terms">이용약관</Link> · <Link className="underline" href="/privacy">개인정보 처리방침</Link></p>
          <button type="button" disabled={busy} onClick={accept} className="mt-4 w-full rounded-xl bg-[#243f63] py-3 font-bold text-white disabled:opacity-40">{busy ? "확인 중…" : "동의하고 계속 참여"}</button>
          <Link className="mt-4 block text-center text-xs underline" href="/my/card">나중에 · 내 카드 관리</Link>
        </>}
        {error && <p role="alert" className="mt-4 text-red-700">{error} <button className="underline" onClick={load}>다시 확인</button></p>}
      </section>
    </CampusShell>
  );
}
