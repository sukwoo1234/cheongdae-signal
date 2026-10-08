"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CampusShell } from "./CampusShell";
import { SignalLoading } from "./SignalLoading";
import type { SeasonState } from "@/lib/types";

export function SeasonBoundary({ children }: { children: ReactNode }) {
  const [season, setSeason] = useState<SeasonState | null>(null);
  const [checked, setChecked] = useState(false);
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

  async function accept() {
    if (!checked || !season || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/season", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ accepted: true, event_id: season.event_id,
          ends_at: season.ends_at, board_mode: season.board_mode }),
      });
      if (!res.ok) {
        setChecked(false);
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
  if (!season && !error) return <SignalLoading message="이번 운영 정보를 확인하고 있어요." />;
  return (
    <CampusShell>
      <section className="mx-auto mt-8 max-w-lg rounded-3xl border border-white bg-white/95 p-6 text-sm leading-6 text-[#526783] shadow-xl sm:p-8">
        <h1 className="mb-4 text-2xl font-black text-[#10243f]">이제 매주 다시 등록하지 않아도 돼요</h1>
        {season && <>
          <p>이번 운영은 <strong>{new Date(season.ends_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} (한국시간)</strong>까지 이어집니다.</p>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>{season.board_mode === "selectable" ? "남성·여성 탭을 자유롭게 오갈 수 있어요. 내 카드도 성별과 관계없이 다른 참가자에게 표시됩니다." : "본인과 다른 성별의 참가자에게 카드가 표시됩니다."}</li>
            <li>두 보드 합쳐 기본 선택권 {season.base_allowance}회. 매주 월요일 0시에 남은 기본 선택권이 {season.base_allowance}회로 갱신됩니다. 사용하지 않은 기본 기회는 쌓이지 않으며, 관리자 추가 기회는 별도로 유지됩니다.</li>
            <li>기존 카드와 선택 기록은 유지해요. 내 카드는 언제든 수정하거나 숨기고 다시 공개할 수 있어요.</li>
            <li>카드·연락처·선택 기록은 이번 운영 종료 후 7일 이내 폐기합니다. 연락처는 내 카드를 선택한 참가자에게만 공개됩니다.</li>
          </ul>
          <p className="mb-4 text-xs">기존 참가자는 동의하기 전까지 새 보드에 노출되지 않습니다. 연장에 동의하지 않은 기존 참여 정보는 기존 종료일로부터 7일 이내에 정리됩니다. 인증 계정 보유 기간은 기존 동의에 따릅니다.</p>
          <p className="mb-4 text-xs"><Link className="underline" href="/terms">이용약관</Link> · <Link className="underline" href="/privacy">개인정보 처리방침</Link></p>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-[#f0f5fd] p-4 text-[#243f63]">
            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>변경된 공개 대상·운영 기간·개인정보 보유 기간을 확인했으며, 이번 운영 참여에 동의합니다.</span>
          </label>
          <button type="button" disabled={!checked || busy} onClick={accept} className="mt-4 w-full rounded-xl bg-[#243f63] py-3 font-bold text-white disabled:opacity-40">{busy ? "확인 중…" : "동의하고 참여하기"}</button>
          <Link className="mt-4 block text-center text-xs underline" href="/my/card">동의하지 않고 내 카드 관리·삭제하기</Link>
        </>}
        {error && <p role="alert" className="mt-4 text-red-700">{error} <button className="underline" onClick={load}>다시 확인</button></p>}
      </section>
    </CampusShell>
  );
}
