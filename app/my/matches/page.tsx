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

  if (!matches) return <main className="min-h-screen flex items-center justify-center">불러오는 중...</main>;

  return (
    <main className="min-h-screen bg-[#eef3ff] px-4 py-6">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-bold text-gray-800">내가 본 카드 ({matches.length})</h1>
          <Link href="/board" className="text-xs text-gray-600">← 보드</Link>
        </div>

        {matches.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-10">아직 본 카드가 없어요</p>
        )}

        {matches.map((m) => (
          <div key={m.match_id} className="bg-white rounded-xl p-4 mb-3 shadow-sm flex items-center gap-3">
            <Postit text={m.one_liner} color={m.color} size="sm" rotation={1} />
            <div className="flex-1">
              <div className="text-[10px] text-gray-500 mb-1">인스타그램</div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold">@{m.instagram_id}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(m.instagram_id);
                    setCopiedId(m.match_id);
                    setTimeout(() => setCopiedId(null), 2000);
                  }}
                  className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded font-semibold"
                >
                  {copiedId === m.match_id ? "복사됨" : "복사"}
                </button>
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                {new Date(m.created_at).toLocaleString("ko-KR")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
