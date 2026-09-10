"use client";

import { useEffect, useMemo, useState } from "react";
import type { SessionConfig } from "@/lib/types";

interface Stats {
  male: number;
  female: number;
  matches: number;
  config: SessionConfig;
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
  allowance: number;
  used: number;
  remaining: number;
  viewed_card_oneliner: string | null;
}

interface SessionDraft {
  startsAt: string;
  endsAt: string;
  thresholdMale: number;
  thresholdFemale: number;
  maxViews: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function toLocalInput(iso: string) {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(localValue: string) {
  return new Date(localValue).toISOString();
}

function draftFromConfig(config: SessionConfig): SessionDraft {
  return {
    startsAt: toLocalInput(config.starts_at),
    endsAt: toLocalInput(config.ends_at),
    thresholdMale: config.threshold_male,
    thresholdFemale: config.threshold_female,
    maxViews: config.max_views_per_card?.toString() ?? "",
  };
}

function shiftLocal(value: string, minutes: number) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() + minutes);
  return toLocalInput(date.toISOString());
}

function nowLocal() {
  return toLocalInput(new Date().toISOString());
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function AdminConsole() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CardRow[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const [userEmail, setUserEmail] = useState("");
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [userMessage, setUserMessage] = useState("");
  const [loadingUser, setLoadingUser] = useState(false);

  async function loadStats(syncDraft = false) {
    const response = await fetch("/api/admin/stats", { cache: "no-store" });
    if (!response.ok) return;
    const next = (await response.json()) as Stats;
    setStats(next);
    setDraft((current) => (syncDraft || !current ? draftFromConfig(next.config) : current));
    setLastUpdated(new Date());
  }

  useEffect(() => {
    void loadStats();
    const timer = window.setInterval(() => void loadStats(false), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const dirty = useMemo(() => {
    if (!stats || !draft) return false;
    const original = draftFromConfig(stats.config);
    return JSON.stringify(original) !== JSON.stringify(draft);
  }, [stats, draft]);

  async function saveConfig() {
    if (!draft) return;
    const maxViews = draft.maxViews.trim() === "" ? null : Number(draft.maxViews);
    if (maxViews !== null && !Number.isInteger(maxViews)) {
      setSaveState("error");
      setSaveMessage("카드 열람 상한은 1 이상의 정수로 입력해주세요.");
      return;
    }
    if (maxViews !== null && maxViews < 1) {
      setSaveState("error");
      setSaveMessage("카드 열람 상한은 1 이상이어야 합니다.");
      return;
    }

    setSaveState("saving");
    setSaveMessage("");
    const response = await fetch("/api/admin/session-config", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        starts_at: toIso(draft.startsAt),
        ends_at: toIso(draft.endsAt),
        threshold_male: draft.thresholdMale,
        threshold_female: draft.thresholdFemale,
        max_views_per_card: maxViews,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      const messages: Record<string, string> = {
        ENDS_BEFORE_STARTS: "종료 시각은 시작 시각보다 뒤여야 합니다.",
        INVALID_TIMESTAMP: "날짜와 시간을 다시 확인해주세요.",
        INVALID_THRESHOLD: "필요 인원은 1명 이상이어야 합니다.",
        INVALID_MAX_VIEWS: "카드 열람 상한을 다시 확인해주세요.",
      };
      setSaveState("error");
      setSaveMessage(messages[data.error ?? ""] ?? "저장하지 못했습니다. 다시 시도해주세요.");
      return;
    }

    await loadStats(true);
    setSaveState("saved");
    setSaveMessage("변경사항이 프로덕션에 반영됐습니다.");
    window.setTimeout(() => setSaveState("idle"), 2500);
  }

  async function updateLock(next: boolean) {
    const response = await fetch("/api/admin/session-config", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ force_locked: next }),
    });
    if (response.ok) await loadStats(false);
  }

  async function doSearch() {
    setSearching(true);
    setHasSearched(true);
    const response = await fetch(`/api/admin/cards?q=${encodeURIComponent(search)}`);
    if (response.ok) setSearchResults(((await response.json()) as { cards?: CardRow[] }).cards ?? []);
    setSearching(false);
  }

  async function hideCard(id: string) {
    await fetch(`/api/admin/cards/${id}/hide`, {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    await doSearch();
  }

  async function removeCard(id: string) {
    if (!confirm("이 카드만 삭제할까요? 사용자는 차단되지 않으며 새 카드를 만들 수 있습니다. 기존 매칭 목록에서는 카드가 사라지지만 이미 사용한 선택 기회는 복구되지 않습니다.")) return;
    const response = await fetch(`/api/admin/cards/${id}/remove`, {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!response.ok) {
      alert("카드를 삭제하지 못했습니다. 다시 시도해주세요.");
      return;
    }
    await doSearch();
    await loadStats(false);
  }

  async function deleteAndBanCard(id: string) {
    if (!confirm("이 카드를 삭제하고 해당 사용자를 차단할까요?")) return;
    const response = await fetch(`/api/admin/cards/${id}/delete`, {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!response.ok) {
      alert("카드 삭제·차단을 완료하지 못했습니다. 다시 확인해주세요.");
      return;
    }
    await doSearch();
    await loadStats(false);
  }

  async function loadUser() {
    setLoadingUser(true);
    setUserMessage("");
    setUserInfo(null);
    const response = await fetch(`/api/admin/users/${encodeURIComponent(userEmail.trim())}`);
    if (response.ok) {
      setUserInfo((await response.json()) as UserInfo);
    } else {
      setUserMessage("일치하는 사용자를 찾지 못했습니다.");
    }
    setLoadingUser(false);
  }

  async function grantSlot(userId: string) {
    const response = await fetch(`/api/admin/users/${userId}/grant-slot`, {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    setUserMessage(response.ok ? "추가 선택 기회 1회를 부여했습니다." : "처리하지 못했습니다.");
    if (response.ok) await loadUser();
  }

  async function banUser(userId: string) {
    if (!confirm("이 사용자를 차단할까요?")) return;
    const response = await fetch(`/api/admin/users/${userId}/ban`, {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    setUserMessage(response.ok ? "사용자를 차단했습니다." : "처리하지 못했습니다.");
    if (response.ok) await loadUser();
  }

  async function wipeData() {
    const confirmation = prompt("모든 데이터를 영구 폐기하려면 WIPE를 입력하세요.");
    if (confirmation !== "WIPE") return;
    const response = await fetch("/api/admin/wipe-data", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ confirm: "WIPE" }),
    });
    const data = await response.json().catch(() => null);
    if (!data) {
      alert("응답을 읽지 못했습니다. 폐기 여부를 직접 확인하세요.");
      return;
    }
    const summary =
      `삭제 — 매칭 ${data.deleted?.matches ?? 0} · 카드 ${data.deleted?.cards ?? 0} · ` +
      `사용자 ${data.deleted?.users ?? 0} · 계정 ${data.deleted?.authUsers ?? 0} · ` +
      `차단목록 ${data.deleted?.bannedEmails ?? 0}`;
    if (data.ok) {
      alert(`폐기 완료\n\n${summary}\n\n남은 데이터 없음.`);
    } else {
      const left = data.remaining
        ? `\n남은 것 — 매칭 ${data.remaining.matches} · 카드 ${data.remaining.cards} · 사용자 ${data.remaining.users} · 계정 ${data.remaining.authUsers}`
        : "";
      alert(`폐기가 완전히 끝나지 않았습니다.\n\n${summary}${left}\n\n오류:\n${(data.errors ?? ["(없음)"]).join("\n")}\n\n다시 실행하세요.`);
    }
    await loadStats(true);
  }

  if (!stats || !draft) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#08090b] text-sm text-[#85858f]">
        관리자 워크스페이스를 불러오는 중…
      </main>
    );
  }

  const now = Date.now();
  const starts = new Date(stats.config.starts_at).getTime();
  const ends = new Date(stats.config.ends_at).getTime();
  const phase = stats.config.force_locked
    ? { label: "강제 잠금", tone: "text-[#ff7185]", dot: "bg-[#ff5c73]" }
    : now < starts
      ? { label: "시작 전", tone: "text-[#e8b85b]", dot: "bg-[#e8b85b]" }
      : now >= ends
        ? { label: "종료됨", tone: "text-[#85858f]", dot: "bg-[#666670]" }
        : { label: "운영 중", tone: "text-[#5dd6b9]", dot: "bg-[#4fd1b2]" };

  return (
    <main className="min-h-screen bg-[#08090b] text-[#e8e8ec]">
      <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#08090b]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1380px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#7c6ff0] text-[10px] font-black text-white">S</span>
            <div>
              <h1 className="text-[13px] font-semibold tracking-[-0.01em]">청대 시그널</h1>
              <p className="text-[9px] text-[#666670]">Operations</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-[#777781]">
            <span className={`flex items-center gap-1.5 font-medium ${phase.tone}`}><span className={`h-1.5 w-1.5 rounded-full ${phase.dot}`} />{phase.label}</span>
            <span className="hidden sm:inline">최근 동기화 {lastUpdated?.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1380px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#777781]">Overview</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-white">운영 대시보드</h2>
          <p className="mt-1 text-xs text-[#777781]">{formatTime(stats.config.starts_at)} — {formatTime(stats.config.ends_at)}</p>
        </div>

        <section className="mb-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Metric label="남자 등록" value={stats.male} meta={`목표 ${stats.config.threshold_male}명`} accent="text-[#77a7ff]" />
          <Metric label="여자 등록" value={stats.female} meta={`목표 ${stats.config.threshold_female}명`} accent="text-[#f28db2]" />
          <Metric label="누적 매칭" value={stats.matches} meta="선택 완료" accent="text-[#e8e8ec]" />
          <Metric label="보드 상태" value={phase.label} meta={stats.config.force_locked ? "관리자가 잠금" : "자동 제어"} accent={phase.tone} />
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.75fr)]">
          <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111216]">
            <SectionHeader eyebrow="Session" title="행사 설정" description="날짜와 운영 조건을 편집한 뒤 한 번에 저장하세요." />
            <div className="space-y-6 p-4 sm:p-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <DateField
                  label="시작 시각"
                  value={draft.startsAt}
                  onChange={(value) => { setDraft({ ...draft, startsAt: value }); setSaveState("idle"); }}
                  actions={[
                    { label: "지금", onClick: () => setDraft({ ...draft, startsAt: nowLocal() }) },
                    { label: "+30분", onClick: () => setDraft({ ...draft, startsAt: shiftLocal(draft.startsAt, 30) }) },
                  ]}
                />
                <DateField
                  label="종료 시각"
                  value={draft.endsAt}
                  onChange={(value) => { setDraft({ ...draft, endsAt: value }); setSaveState("idle"); }}
                  actions={[
                    { label: "+30분", onClick: () => setDraft({ ...draft, endsAt: shiftLocal(draft.endsAt, 30) }) },
                    { label: "+1시간", onClick: () => setDraft({ ...draft, endsAt: shiftLocal(draft.endsAt, 60) }) },
                  ]}
                />
              </div>

              <div className="border-t border-white/[0.07]" />

              <div className="grid gap-4 lg:grid-cols-3">
                <Stepper label="남자 필요 인원" value={draft.thresholdMale} onChange={(value) => setDraft({ ...draft, thresholdMale: value })} />
                <Stepper label="여자 필요 인원" value={draft.thresholdFemale} onChange={(value) => setDraft({ ...draft, thresholdFemale: value })} />
                <label className="block">
                  <span className="mb-2 block text-[11px] font-medium text-[#a4a4ad]">카드당 최대 열람</span>
                  <input
                    type="number"
                    min={1}
                    value={draft.maxViews}
                    onChange={(event) => setDraft({ ...draft, maxViews: event.target.value })}
                    placeholder="무제한"
                    className="h-10 w-full rounded-lg border border-white/[0.09] bg-[#0c0d10] px-3 text-xs text-[#e8e8ec] outline-none transition placeholder:text-[#55555e] focus:border-[#7c6ff0] focus:ring-2 focus:ring-[#7c6ff0]/15"
                  />
                  <span className="mt-1.5 block text-[9px] leading-4 text-[#666670]">비워두면 제한하지 않습니다.</span>
                </label>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-white/[0.07] bg-[#0c0d10] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className={`text-[11px] font-medium ${saveState === "error" ? "text-[#ff7185]" : saveState === "saved" ? "text-[#5dd6b9]" : "text-[#85858f]"}`}>
                    {saveMessage || (dirty ? "저장하지 않은 변경사항이 있습니다." : "모든 변경사항이 저장됐습니다.")}
                  </p>
                </div>
                <button
                  onClick={saveConfig}
                  disabled={!dirty || saveState === "saving"}
                  className="h-9 rounded-lg bg-[#7c6ff0] px-4 text-[11px] font-semibold text-white transition hover:bg-[#8b7ef5] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {saveState === "saving" ? "저장 중…" : "변경사항 저장"}
                </button>
              </div>
            </div>
          </section>

          <div className="space-y-5">
            <section className="rounded-xl border border-white/[0.08] bg-[#111216]">
              <SectionHeader eyebrow="Control" title="보드 제어" description="긴급 상황에서 즉시 접근을 제어합니다." />
              <div className="p-4 sm:p-5">
                <div className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-[#0c0d10] p-3.5">
                  <div>
                    <p className="text-xs font-medium text-[#d4d4d9]">강제 잠금</p>
                    <p className="mt-1 text-[9px] text-[#666670]">설정 시간과 관계없이 보드를 닫습니다.</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={stats.config.force_locked}
                    onClick={() => void updateLock(!stats.config.force_locked)}
                    className={`relative h-6 w-11 rounded-full transition ${stats.config.force_locked ? "bg-[#ff5c73]" : "bg-[#34343c]"}`}
                  >
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${stats.config.force_locked ? "left-6" : "left-1"}`} />
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-[#522831] bg-[#1a1114]">
              <SectionHeader eyebrow="Danger zone" title="데이터 폐기" description="행사 종료와 검증이 끝난 뒤에만 실행하세요." danger />
              <div className="p-4 sm:p-5">
                <button onClick={wipeData} className="h-10 w-full rounded-lg border border-[#713340] bg-[#2a151a] text-[11px] font-semibold text-[#ff8495] transition hover:bg-[#35191f]">
                  전체 데이터 영구 폐기
                </button>
                <p className="mt-2 text-center text-[9px] leading-4 text-[#8e5962]">매칭·카드·사용자·인증 계정을 삭제하며 되돌릴 수 없습니다.</p>
              </div>
            </section>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111216]">
            <SectionHeader eyebrow="Moderation" title="카드 관리" description="소개 문구로 검색해 숨기거나 삭제·차단합니다." />
            <div className="p-4 sm:p-5">
              <SearchBar value={search} onChange={setSearch} onSubmit={() => void doSearch()} placeholder="소개 문구 검색" buttonLabel={searching ? "검색 중…" : "검색"} />
              <div className="admin-scrollbar mt-4 max-h-80 space-y-2 overflow-auto">
                {hasSearched && searchResults.length === 0 && <EmptyState>검색 결과가 없습니다.</EmptyState>}
                {searchResults.map((card) => (
                  <div key={card.id} className="rounded-lg border border-white/[0.07] bg-[#0c0d10] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-[#e1e1e6]">{card.one_liner}</p>
                        <p className="mt-1 truncate text-[9px] text-[#666670]">{card.gender} · {card.email} · <span className="font-mono">@{card.instagram_id}</span></p>
                      </div>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-medium ${card.hidden_by_admin ? "bg-[#30261a] text-[#d9a84f]" : "bg-[#183029] text-[#58c9ad]"}`}>{card.hidden_by_admin ? "숨김" : "공개"}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => void hideCard(card.id)} className="rounded-md border border-white/[0.08] px-2.5 py-1.5 text-[9px] font-medium text-[#a4a4ad] hover:bg-white/[0.04]">{card.hidden_by_admin ? "다시 공개" : "숨기기"}</button>
                      <button onClick={() => void removeCard(card.id)} className="rounded-md border border-[#4e4230] px-2.5 py-1.5 text-[9px] font-medium text-[#e0b86d] hover:bg-[#221d14]">삭제만</button>
                      <button onClick={() => void deleteAndBanCard(card.id)} className="rounded-md border border-[#51252e] px-2.5 py-1.5 text-[9px] font-medium text-[#ff7185] hover:bg-[#251216]">삭제 + 차단</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111216]">
            <SectionHeader eyebrow="Users" title="사용자 조회" description="학교 이메일 전체를 정확히 입력하세요." />
            <div className="p-4 sm:p-5">
              <SearchBar value={userEmail} onChange={setUserEmail} onSubmit={() => void loadUser()} placeholder="student@cju.ac.kr" buttonLabel={loadingUser ? "조회 중…" : "조회"} />
              {userMessage && <p className="mt-3 text-[10px] text-[#a4a4ad]">{userMessage}</p>}
              {userInfo && (
                <div className="mt-4 rounded-lg border border-white/[0.07] bg-[#0c0d10] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-xs font-medium text-white">{userInfo.email}</p><p className="mt-1 text-[9px] text-[#666670]">{userInfo.gender ?? "미설정"} · 선택 기회 {userInfo.remaining}회 남음 ({userInfo.used}/{userInfo.allowance} 사용)</p></div>
                    <span className={`rounded px-1.5 py-0.5 text-[8px] font-medium ${userInfo.banned ? "bg-[#35191f] text-[#ff7185]" : "bg-[#183029] text-[#58c9ad]"}`}>{userInfo.banned ? "차단됨" : "정상"}</span>
                  </div>
                  <div className="mt-3 rounded-md bg-white/[0.035] px-3 py-2 text-[9px] text-[#85858f]">열람 카드 · {userInfo.viewed_card_oneliner ?? "없음"}</div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => void grantSlot(userInfo.id)} className="rounded-md border border-[#3e376f] bg-[#19172a] px-2.5 py-1.5 text-[9px] font-medium text-[#afa5ff]">선택 기회 +1</button>
                    <button onClick={() => void banUser(userInfo.id)} className="rounded-md border border-[#51252e] px-2.5 py-1.5 text-[9px] font-medium text-[#ff7185]">사용자 차단</button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value, meta, accent }: { label: string; value: string | number; meta: string; accent: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#111216] p-4">
      <p className="text-[10px] font-medium text-[#777781]">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-[-0.035em] ${accent}`}>{value}</p>
      <p className="mt-1 text-[9px] text-[#55555e]">{meta}</p>
    </div>
  );
}

function SectionHeader({ eyebrow, title, description, danger = false }: { eyebrow: string; title: string; description: string; danger?: boolean }) {
  return (
    <div className="border-b border-white/[0.07] px-4 py-3.5 sm:px-5">
      <p className={`text-[8px] font-semibold uppercase tracking-[0.14em] ${danger ? "text-[#b85a68]" : "text-[#686872]"}`}>{eyebrow}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <h3 className={`text-[13px] font-semibold ${danger ? "text-[#ff8495]" : "text-[#e8e8ec]"}`}>{title}</h3>
        <p className={`text-[9px] ${danger ? "text-[#8e5962]" : "text-[#666670]"}`}>{description}</p>
      </div>
    </div>
  );
}

function DateField({ label, value, onChange, actions }: { label: string; value: string; onChange: (value: string) => void; actions: Array<{ label: string; onClick: () => void }> }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-medium text-[#a4a4ad]">{label}</span>
      <input type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-white/[0.09] bg-[#0c0d10] px-3 text-xs text-[#e8e8ec] [color-scheme:dark] outline-none transition focus:border-[#7c6ff0] focus:ring-2 focus:ring-[#7c6ff0]/15" />
      <div className="mt-2 flex gap-1.5">
        {actions.map((action) => <button key={action.label} type="button" onClick={action.onClick} className="rounded-md border border-white/[0.08] bg-white/[0.025] px-2 py-1 text-[9px] font-medium text-[#85858f] hover:bg-white/[0.05] hover:text-[#d4d4d9]">{action.label}</button>)}
      </div>
    </label>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <span className="mb-2 block text-[11px] font-medium text-[#a4a4ad]">{label}</span>
      <div className="flex h-10 overflow-hidden rounded-lg border border-white/[0.09] bg-[#0c0d10]">
        <button type="button" onClick={() => onChange(Math.max(1, value - 1))} className="w-10 border-r border-white/[0.08] text-sm text-[#85858f] hover:bg-white/[0.04] hover:text-white" aria-label={`${label} 1명 줄이기`}>−</button>
        <input type="number" min={1} value={value} onChange={(event) => onChange(Math.max(1, Number(event.target.value) || 1))} className="min-w-0 flex-1 bg-transparent text-center text-xs font-semibold text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
        <button type="button" onClick={() => onChange(value + 1)} className="w-10 border-l border-white/[0.08] text-sm text-[#85858f] hover:bg-white/[0.04] hover:text-white" aria-label={`${label} 1명 늘리기`}>+</button>
      </div>
    </div>
  );
}

function SearchBar({ value, onChange, onSubmit, placeholder, buttonLabel }: { value: string; onChange: (value: string) => void; onSubmit: () => void; placeholder: string; buttonLabel: string }) {
  return (
    <div className="flex gap-2">
      <input value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSubmit(); }} placeholder={placeholder} className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.09] bg-[#0c0d10] px-3 text-xs text-white outline-none transition placeholder:text-[#55555e] focus:border-[#7c6ff0] focus:ring-2 focus:ring-[#7c6ff0]/15" />
      <button onClick={onSubmit} className="h-10 shrink-0 rounded-lg border border-white/[0.09] bg-white/[0.04] px-4 text-[10px] font-medium text-[#d4d4d9] hover:bg-white/[0.07]">{buttonLabel}</button>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-white/[0.09] py-10 text-center text-[10px] text-[#666670]">{children}</div>;
}
