"use client";

import { useEffect, useState } from "react";

interface Stats {
  male: number;
  female: number;
  matches: number;
  config: {
    starts_at: string;
    ends_at: string;
    force_locked: boolean;
    threshold_male: number;
    threshold_female: number;
  };
}

interface CardRow {
  id: string;
  one_liner: string;
  instagram_id: string;
  color: string;
  email: string;
  gender: string;
  hidden_by_admin: boolean;
}

interface UserInfo {
  id: string;
  email: string;
  gender: string | null;
  banned: boolean;
  slot_used: boolean;
  viewed_card_oneliner: string | null;
}

export default function AdminConsole() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<CardRow[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  async function loadStats() {
    const r = await fetch("/api/admin/stats");
    if (r.ok) setStats(await r.json());
  }
  useEffect(() => {
    loadStats();
    const t = setInterval(loadStats, 10000);
    return () => clearInterval(t);
  }, []);

  async function doSearch() {
    const r = await fetch(`/api/admin/cards?q=${encodeURIComponent(search)}`);
    if (r.ok) setSearchResults((await r.json()).cards ?? []);
  }

  async function hide(id: string) {
    await fetch(`/api/admin/cards/${id}/hide`, { method: "POST" });
    doSearch();
  }
  async function del(id: string) {
    if (!confirm("이 카드를 삭제하고 사용자를 차단할까요?")) return;
    await fetch(`/api/admin/cards/${id}/delete`, { method: "POST" });
    doSearch();
  }

  async function loadUser() {
    const r = await fetch(`/api/admin/users/${encodeURIComponent(userEmail)}`);
    if (r.ok) setUserInfo(await r.json());
  }
  async function grantSlot(userId: string) {
    await fetch(`/api/admin/users/${userId}/grant-slot`, { method: "POST" });
    loadUser();
  }
  async function ban(userId: string) {
    if (!confirm("이 사용자를 차단할까요?")) return;
    await fetch(`/api/admin/users/${userId}/ban`, { method: "POST" });
    loadUser();
  }

  async function saveSession(field: string, value: unknown) {
    await fetch("/api/admin/session-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    loadStats();
  }

  async function toggleLock() {
    if (!stats) return;
    await saveSession("force_locked", !stats.config.force_locked);
  }

  async function wipeData() {
    const t = prompt("정말 모든 데이터를 폐기하려면 'WIPE'를 입력하세요");
    if (t !== "WIPE") return;
    const r = await fetch("/api/admin/wipe-data", { method: "POST" });
    if (r.ok) alert("폐기 완료");
    else alert("실패");
  }

  if (!stats) return <main className="p-8 text-sm">불러오는 중...</main>;

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <header className="flex justify-between items-center pb-3 border-b border-gray-700 mb-4">
        <h1 className="text-lg font-bold">청대 시그널 · 어드민 콘솔</h1>
        <span className="text-xs text-gray-500">⚡ 라이브</span>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="남자 등록" value={stats.male} color="text-blue-400" />
        <Stat label="여자 등록" value={stats.female} color="text-pink-400" />
        <Stat label="누적 매칭" value={stats.matches} color="text-white" />
        <Stat label="보드 잠금" value={stats.config.force_locked ? "잠김" : "오픈"} color={stats.config.force_locked ? "text-red-400" : "text-green-400"}>
          <button onClick={toggleLock} className="text-[10px] bg-gray-700 px-2 py-0.5 rounded mt-1">토글</button>
        </Stat>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-800 rounded p-3">
          <h2 className="text-xs font-bold mb-2">세션 설정</h2>
          <label className="text-[10px] text-gray-500 block">시작 시각</label>
          <input
            type="datetime-local"
            defaultValue={stats.config.starts_at.slice(0, 16)}
            onBlur={(e) => saveSession("starts_at", new Date(e.target.value).toISOString())}
            className="bg-gray-900 text-xs p-1 rounded w-full mb-2"
          />
          <label className="text-[10px] text-gray-500 block">종료 시각</label>
          <input
            type="datetime-local"
            defaultValue={stats.config.ends_at.slice(0, 16)}
            onBlur={(e) => saveSession("ends_at", new Date(e.target.value).toISOString())}
            className="bg-gray-900 text-xs p-1 rounded w-full"
          />
        </div>

        <div className="bg-red-900/30 border border-red-800 rounded p-3">
          <h2 className="text-xs font-bold text-red-300 mb-1">⚠ 위험 영역</h2>
          <p className="text-[10px] text-gray-400 mb-2">세션 종료 후에만 사용. 모든 데이터 영구 삭제, 되돌릴 수 없음.</p>
          <button onClick={wipeData} className="bg-red-700 text-white text-xs px-3 py-2 rounded font-bold w-full">
            세션 종료 + 데이터 폐기
          </button>
        </div>
      </section>

      <section className="bg-gray-800 rounded p-3 mb-4">
        <h2 className="text-xs font-bold mb-2">카드 검색 / 강제 숨김</h2>
        <div className="flex gap-2 mb-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="소개 텍스트로 검색"
            className="flex-1 bg-gray-900 text-xs p-2 rounded"
          />
          <button onClick={doSearch} className="bg-gray-700 text-xs px-3 rounded">검색</button>
        </div>
        <div className="max-h-60 overflow-auto space-y-1">
          {searchResults.map((c) => (
            <div key={c.id} className="bg-gray-900 p-2 rounded text-xs flex justify-between items-center">
              <div>
                <span className="bg-yellow-200 text-gray-800 px-2 py-0.5 rounded font-semibold">{c.one_liner}</span>
                <span className="ml-2 text-gray-500">{c.gender} · {c.email} · <span className="font-mono text-gray-300">@{c.instagram_id}</span></span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => hide(c.id)} className="bg-gray-700 px-2 py-1 rounded">숨김</button>
                <button onClick={() => del(c.id)} className="bg-red-900/50 text-red-400 px-2 py-1 rounded">삭제+차단</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-gray-800 rounded p-3">
        <h2 className="text-xs font-bold mb-2">사용자 조회</h2>
        <div className="flex gap-2 mb-2">
          <input
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            placeholder="이메일 (정확한 매치)"
            className="flex-1 bg-gray-900 text-xs p-2 rounded"
          />
          <button onClick={loadUser} className="bg-gray-700 text-xs px-3 rounded">조회</button>
        </div>
        {userInfo && (
          <div className="bg-gray-900 p-3 rounded text-xs">
            <div className="font-bold mb-1">{userInfo.email}</div>
            <div className="text-gray-500 mb-2">
              성별: {userInfo.gender ?? "-"} · 슬롯 사용: {userInfo.slot_used ? "✓" : "X"} ·
              본 카드: {userInfo.viewed_card_oneliner ?? "-"} · {userInfo.banned ? "차단됨" : "정상"}
            </div>
            <div className="flex gap-2">
              <button onClick={() => grantSlot(userInfo.id)} className="bg-blue-900 text-blue-300 px-2 py-1 rounded">슬롯 1회 부여</button>
              <button onClick={() => ban(userInfo.id)} className="bg-red-900 text-red-300 px-2 py-1 rounded">차단</button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  color,
  children,
}: {
  label: string;
  value: string | number;
  color: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-gray-800 rounded p-3">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {children}
    </div>
  );
}
