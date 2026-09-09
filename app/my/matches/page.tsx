"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Postit } from "@/components/Postit";
import { CampusShell } from "@/components/CampusShell";
import type { PostitColor } from "@/lib/constants";

interface MatchRow {
  match_id: string;
  card_id: string;
  one_liner: string;
  color: PostitColor;
  instagram_id: string;
  created_at: string;
}

export default function MyMatchesPage() {
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/matches/me")
      .then((r) => r.json())
      .then((d) => setMatches(d.matches ?? []));
  }, []);

  if (!matches) return <main className="flex min-h-screen items-center justify-center bg-[#edf5ff] text-sm text-[#8390a2]">매칭을 불러오는 중…</main>;

  return (
    <CampusShell className="min-h-[1080px] sm:min-h-screen">
      <div className="mx-auto mt-4 max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#718be4]">Saved signals</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.045em] text-[#0c2748]">내 매칭 <span className="text-[#22aa9c]">{matches.length}</span></h1>
            <p className="mt-2 text-sm text-[#7085a2]">좋은 인연이, 여기 있어요 ♡</p>
          </div>
          <Link href="/board" className="rounded-xl bg-white/90 px-5 py-3 text-sm font-bold text-[#526176] shadow-[0_8px_24px_rgba(39,68,103,.12)] ring-1 ring-[#dce4ee]">보드로</Link>
        </div>

        {matches.length === 0 && (
          <div className="rounded-[24px] border border-dashed border-[#ccd6e2] bg-white/75 px-6 py-16 text-center backdrop-blur"><p className="text-sm font-semibold text-[#526176]">아직 선택한 카드가 없어요.</p><p className="mt-1 text-xs text-[#8390a2]">보드에서 마음 가는 카드 한 장을 골라보세요.</p></div>
        )}

        {matches.map((m) => (
          <div key={m.match_id} className="mb-4 flex items-center gap-4 rounded-[24px] border border-[#ffdbe6] bg-white/88 p-5 shadow-[0_16px_42px_rgba(57,85,121,.12)] backdrop-blur-xl">
            <Postit text={m.one_liner} color={m.color} size="sm" rotation={1} />
            <div className="flex-1">
              <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#8390a2]">Instagram</div>
              <div className="flex items-center gap-2">
                <span className="min-w-0 break-all font-mono text-sm font-bold text-[#071b33]">@{m.instagram_id}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(m.instagram_id);
                    setCopiedId(m.match_id);
                    setTimeout(() => setCopiedId(null), 2000);
                  }}
                  className="shrink-0 rounded-lg bg-[#071b33] px-2.5 py-1.5 text-[10px] font-semibold text-white"
                >
                  {copiedId === m.match_id ? "복사됨" : "복사"}
                </button>
              </div>
              <div className="mt-1.5 text-[10px] text-[#9aa6b5]">
                {new Date(m.created_at).toLocaleString("ko-KR")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </CampusShell>
  );
}
