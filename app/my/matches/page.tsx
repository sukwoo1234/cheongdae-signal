"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Postit } from "@/components/Postit";
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

  if (!matches) return <main className="flex min-h-screen items-center justify-center bg-[#f4f7fb] text-sm text-[#8390a2]">매칭을 불러오는 중…</main>;

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-5 py-8 sm:py-12">
      <div className="signal-enter mx-auto max-w-md">
        <div className="mb-6 flex items-start justify-between">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#0ca18e]">Saved signals</p><h1 className="mt-1 text-2xl font-extrabold tracking-[-0.035em] text-[#071b33]">내 매칭 <span className="text-[#15bfa9]">{matches.length}</span></h1></div>
          <Link href="/board" className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#526176] shadow-sm ring-1 ring-[#dce4ee]">보드로</Link>
        </div>

        {matches.length === 0 && (
          <div className="rounded-[24px] border border-dashed border-[#ccd6e2] bg-white/60 px-6 py-16 text-center"><p className="text-sm font-semibold text-[#526176]">아직 선택한 카드가 없어요.</p><p className="mt-1 text-xs text-[#8390a2]">보드에서 마음 가는 카드 한 장을 골라보세요.</p></div>
        )}

        {matches.map((m) => (
          <div key={m.match_id} className="mb-3 flex items-center gap-4 rounded-[20px] border border-[#dce4ee] bg-white p-4 shadow-[0_10px_30px_rgba(24,46,76,0.06)]">
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
    </main>
  );
}
