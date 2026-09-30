"use client";

import { useEffect, useMemo, useState } from "react";
import type { SessionConfig } from "@/lib/types";
import { contactTypeShortLabel, formatContactValue, type ContactType } from "@/lib/validation/contact";
import { SignalBrand } from "@/components/SignalBrand";

interface Stats {
  male: number;
  female: number;
  matches: number;
  users: { cumulative: number; completed: number; incomplete: number };
  board_open: boolean;
  config: SessionConfig;
}

interface CardRow {
  id: string;
  one_liner: string;
  instagram_id: string;
  contact_type: ContactType;
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
  viewed_cards: Array<{
    match_id: string;
    one_liner: string;
    target_email: string;
    target_gender: string | null;
    bonus: boolean;
    selection_number: number;
    created_at: string;
  }>;
}

interface MatchParty {
  id: string;
  email: string;
  gender: string | null;
}

interface SelectionRow {
  id: string;
  viewer: MatchParty;
  target: MatchParty & { one_liner: string };
  selection_number: number;
  bonus: boolean;
  created_at: string;
  mutual: boolean;
}

interface MutualMember extends MatchParty {
  one_liner: string;
  selection_number: number;
  bonus: boolean;
  selected_at: string;
}

interface MutualPair {
  pair_key: string;
  first: MutualMember;
  second: MutualMember;
  matched_at: string;
}

interface MatchOverview {
  selections: SelectionRow[];
  mutual_pairs: MutualPair[];
  total_selections: number;
  mutual_count: number;
}

interface PermanentBan {
  email: string;
  reason: string;
  created_at: string;
  expires_at: string;
}

interface SessionDraft {
  startsAt: string;
  endsAt: string;
  thresholdMale: number;
  thresholdFemale: number;
  maxViews: string;
  boardMode: "opposite" | "selectable";
  baseAllowance: 1 | 2;
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
    boardMode: config.board_mode,
    baseAllowance: config.base_selection_allowance,
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
  const [banEmail, setBanEmail] = useState("");
  const [banReason, setBanReason] = useState("");
  const [permanentBans, setPermanentBans] = useState<PermanentBan[]>([]);
  const [banMessage, setBanMessage] = useState("");
  const [banBusy, setBanBusy] = useState(false);
  const [matchOverview, setMatchOverview] = useState<MatchOverview>({ selections: [], mutual_pairs: [], total_selections: 0, mutual_count: 0 });
  const [matchView, setMatchView] = useState<"all" | "mutual">("all");
  const [matchSearch, setMatchSearch] = useState("");
  const [loadingMatches, setLoadingMatches] = useState(false);

  async function loadMatchOverview() {
    setLoadingMatches(true);
    const response = await fetch("/api/admin/matches", { cache: "no-store" });
    if (response.ok) setMatchOverview((await response.json()) as MatchOverview);
    setLoadingMatches(false);
  }

  async function loadPermanentBans() {
    const response = await fetch("/api/admin/permanent-bans", { cache: "no-store" });
    if (!response.ok) {
      setBanMessage("6개월 차단 목록을 불러오지 못했습니다.");
      return;
    }
    const data = (await response.json()) as { bans: PermanentBan[] };
    setPermanentBans(data.bans);
  }

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
    void loadPermanentBans();
    void loadMatchOverview();
    const timer = window.setInterval(() => void loadStats(false), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const dirty = useMemo(() => {
    if (!stats || !draft) return false;
    const original = draftFromConfig(stats.config);
    return JSON.stringify(original) !== JSON.stringify(draft);
  }, [stats, draft]);

  const normalizedMatchSearch = matchSearch.trim().toLowerCase();
  const visibleSelections = useMemo(() => matchOverview.selections.filter((row) => {
    if (!normalizedMatchSearch) return true;
    return row.viewer.email.toLowerCase().includes(normalizedMatchSearch)
      || row.target.email.toLowerCase().includes(normalizedMatchSearch)
      || row.target.one_liner.toLowerCase().includes(normalizedMatchSearch);
  }), [matchOverview.selections, normalizedMatchSearch]);
  const visibleMutualPairs = useMemo(() => matchOverview.mutual_pairs.filter((pair) => {
    if (!normalizedMatchSearch) return true;
    return [pair.first.email, pair.second.email, pair.first.one_liner, pair.second.one_liner]
      .some((value) => value.toLowerCase().includes(normalizedMatchSearch));
  }), [matchOverview.mutual_pairs, normalizedMatchSearch]);

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
        board_mode: draft.boardMode,
        base_selection_allowance: draft.baseAllowance,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      const messages: Record<string, string> = {
        ENDS_BEFORE_STARTS: "종료 시각은 시작 시각보다 뒤여야 합니다.",
        INVALID_TIMESTAMP: "날짜와 시간을 다시 확인해주세요.",
        INVALID_THRESHOLD: "필요 인원은 1명 이상이어야 합니다.",
        INVALID_MAX_VIEWS: "카드 열람 상한을 다시 확인해주세요.",
        INVALID_BOARD_MODE: "보드 모드를 다시 선택해주세요.",
        INVALID_BASE_ALLOWANCE: "기본 선택 기회를 다시 선택해주세요.",
        EVENT_RULES_LOCKED: "행사가 시작되어 보드 모드와 기본 선택 기회는 변경할 수 없습니다.",
      };
      setSaveState("error");
      setSaveMessage(messages[data.error ?? ""] ?? "저장하지 못했습니다. 다시 시도해주세요.");
      return;
    }

    await loadStats(true);
    setSaveState("saved");
    setSaveMessage("변경사항이 반영됐습니다.");
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

  async function hideCard(id: string, hidden: boolean) {
    const response = await fetch(`/api/admin/cards/${id}/hide`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ hidden }),
    });
    if (!response.ok) {
      alert(hidden ? "카드를 숨기지 못했습니다." : "카드를 다시 공개하지 못했습니다.");
      return;
    }
    await doSearch();
  }

  async function removeCard(id: string) {
    if (!confirm("이 사용자를 삭제해 내보낼까요? 같은 이메일로 이번 이벤트에 다시 참여할 수 있지만 이미 사용한 선택 기회는 초기화되지 않습니다.")) return;
    const response = await fetch(`/api/admin/cards/${id}/remove`, {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!response.ok) {
      alert("사용자를 삭제하지 못했습니다. 다시 시도해주세요.");
      return;
    }
    await doSearch();
    await loadStats(false);
  }

  async function banAndDeleteCard(id: string) {
    if (!confirm("이 사용자를 삭제하고 이번 이벤트에서 재가입할 수 없게 차단할까요?")) return;
    const response = await fetch(`/api/admin/cards/${id}/delete`, {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!response.ok) {
      alert("사용자 차단을 완료하지 못했습니다. 다시 확인해주세요.");
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
    if (!confirm("이 사용자를 삭제하고 이번 이벤트에서 재가입할 수 없게 차단할까요?")) return;
    const response = await fetch(`/api/admin/users/${userId}/ban`, {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (response.ok) {
      setUserInfo(null);
      setUserMessage("사용자를 삭제하고 이번 이벤트에서 재가입할 수 없게 차단했습니다.");
    } else {
      setUserMessage("처리하지 못했습니다.");
    }
  }

  async function addPermanentBan() {
    const email = banEmail.trim().toLowerCase();
    const reason = banReason.trim();
    if (!email || !reason) {
      setBanMessage("학교 이메일과 차단 사유를 모두 입력해주세요.");
      return;
    }
    if (!confirm(`${email}을 6개월간 차단할까요? 현재 계정은 삭제되고 이번 행사도 차단됩니다.`)) return;
    setBanBusy(true);
    const response = await fetch("/api/admin/permanent-bans", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ email, reason }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBanMessage(response.ok ? "6개월 차단했습니다." : data.error === "AUTH_DELETE_FAILED"
      ? "DB 차단은 적용됐지만 계정 삭제에 실패했습니다. 같은 이메일로 다시 차단을 실행해주세요."
      : "차단하지 못했습니다. 이메일과 서버 상태를 확인해주세요.");
    if (response.ok) { setBanEmail(""); setBanReason(""); setUserInfo(null); }
    await loadPermanentBans();
    setBanBusy(false);
  }

  async function releasePermanentBan(email: string) {
    if (!confirm(`${email}의 6개월 차단만 해제할까요? 이번 행사 차단과 삭제된 계정은 복구되지 않습니다.`)) return;
    setBanBusy(true);
    const response = await fetch("/api/admin/permanent-bans", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ email }),
    });
    setBanMessage(response.ok ? "6개월 차단을 해제했습니다. 이번 행사 차단은 유지됩니다." : "차단을 해제하지 못했습니다.");
    await loadPermanentBans();
    setBanBusy(false);
  }

  async function wipeData() {
    const confirmation = prompt("행사 데이터를 영구 폐기하려면 WIPE를 입력하세요. 6개월 차단 목록은 만료 전까지 유지됩니다.");
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
      `회차 참가자 ${data.deleted?.participants ?? 0} · 만료·미동의 계정 ${data.deleted?.authUsers ?? 0} · ` +
      `차단목록 ${data.deleted?.bannedEmails ?? 0}`;
    if (data.ok) {
      alert(`폐기 완료\n\n${summary}\n\n보유 중인 인증 계정 ${data.remaining?.users ?? 0}건.`);
    } else {
      const left = data.remaining
        ? `\n남은 것 — 매칭 ${data.remaining.matches} · 카드 ${data.remaining.cards} · 사용자 ${data.remaining.users} · 계정 ${data.remaining.authUsers}`
        : "";
      alert(`폐기가 완전히 끝나지 않았습니다.\n\n${summary}${left}\n\n오류:\n${(data.errors ?? ["(없음)"]).join("\n")}\n\n다시 실행하세요.`);
    }
    await loadStats(true);
    await loadMatchOverview();
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
        : !stats.board_open
          ? { label: "준비 중", tone: "text-[#e8b85b]", dot: "bg-[#e8b85b]" }
          : { label: "운영 중", tone: "text-[#5dd6b9]", dot: "bg-[#4fd1b2]" };
  const eventRulesLocked = now >= starts;

  return (
    <main className="min-h-screen bg-[#08090b] text-[#e8e8ec]">
      <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#08090b]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1380px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div>
              <SignalBrand compact tone="dark" />
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

        <section className="mb-5 grid grid-cols-2 gap-2.5 lg:grid-cols-5">
          <Metric label="남자 카드" value={stats.male} meta={`목표 ${stats.config.threshold_male}장`} accent="text-[#77a7ff]" />
          <Metric label="여자 카드" value={stats.female} meta={`목표 ${stats.config.threshold_female}장`} accent="text-[#f28db2]" />
          <Metric label="참여 현황" value={`${stats.users.cumulative} / (${stats.users.completed} / ${stats.users.incomplete})`} meta="누적 / (완료 / 미완료)" accent="text-[#5dd6b9]" />
          <Metric label="누적 매칭" value={stats.matches} meta="선택 완료" accent="text-[#e8e8ec]" />
          <Metric label="보드 상태" value={phase.label} meta={stats.config.force_locked ? "관리자가 잠금" : "자동 제어"} accent={phase.tone} />
        </section>

        <section className="mb-5 overflow-hidden rounded-xl border border-white/[0.08] bg-[#111216]">
          <div className="flex flex-col gap-3 border-b border-white/[0.07] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#686872]">Connections</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <h3 className="text-[13px] font-semibold text-[#e8e8ec]">선택·맞매칭 현황</h3>
                <p className="text-[9px] text-[#666670]">누가 누구를 선택했는지와 서로 선택한 조합을 확인합니다.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadMatchOverview()}
              disabled={loadingMatches}
              className="h-8 self-start rounded-md border border-white/[0.1] px-3 text-[9px] font-medium text-[#a4a4ad] disabled:opacity-40 sm:self-auto"
            >
              {loadingMatches ? "새로고침 중…" : "새로고침"}
            </button>
          </div>
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/[0.07] bg-[#0c0d10] p-1">
                <button
                  type="button"
                  onClick={() => setMatchView("all")}
                  className={`rounded-md px-3 py-2 text-[10px] font-semibold ${matchView === "all" ? "bg-[#29243f] text-[#c5bdff]" : "text-[#777781]"}`}
                >
                  전체 선택 {matchOverview.total_selections}
                </button>
                <button
                  type="button"
                  onClick={() => setMatchView("mutual")}
                  className={`rounded-md px-3 py-2 text-[10px] font-semibold ${matchView === "mutual" ? "bg-[#17352d] text-[#6ee0c2]" : "text-[#777781]"}`}
                >
                  맞매칭 {matchOverview.mutual_count}쌍
                </button>
              </div>
              <input
                value={matchSearch}
                onChange={(event) => setMatchSearch(event.target.value)}
                placeholder="이메일 또는 한 줄 소개 검색"
                aria-label="선택 내역 검색"
                className="h-9 min-w-0 rounded-lg border border-white/[0.09] bg-[#0c0d10] px-3 text-[10px] text-white outline-none placeholder:text-[#55555e] sm:w-72"
              />
            </div>

            <div className="admin-scrollbar max-h-[430px] space-y-2 overflow-auto">
              {matchView === "all" && visibleSelections.length === 0 && <EmptyState>선택 내역이 없습니다.</EmptyState>}
              {matchView === "all" && visibleSelections.map((row) => (
                <div key={row.id} className="rounded-lg border border-white/[0.07] bg-[#0c0d10] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[8px] font-semibold ${row.mutual ? "bg-[#17352d] text-[#6ee0c2]" : "bg-[#27272d] text-[#9a9aa4]"}`}>
                      {row.mutual ? "맞매칭" : "단방향"}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[8px] font-semibold ${row.bonus ? "bg-[#2a2346] text-[#b8adff]" : "bg-[#1b293d] text-[#8fb9f5]"}`}>
                      선택 {row.selection_number}{row.bonus ? " · 추가 기회" : ""}
                    </span>
                    <span className="ml-auto text-[8px] text-[#55555e]">{formatTime(row.created_at)}</span>
                  </div>
                  <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-[10px]">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[#e1e1e6]">{row.viewer.email}</p>
                      <p className="text-[8px] text-[#666670]">선택한 사람 · {row.viewer.gender ?? "미설정"}</p>
                    </div>
                    <span className={`text-sm ${row.mutual ? "text-[#6ee0c2]" : "text-[#777781]"}`}>{row.mutual ? "↔" : "→"}</span>
                    <div className="min-w-0 text-right">
                      <p className="truncate font-medium text-[#e1e1e6]">{row.target.email}</p>
                      <p className="truncate text-[8px] text-[#777781]">{row.target.one_liner}</p>
                    </div>
                  </div>
                </div>
              ))}

              {matchView === "mutual" && visibleMutualPairs.length === 0 && <EmptyState>아직 맞매칭된 조합이 없습니다.</EmptyState>}
              {matchView === "mutual" && visibleMutualPairs.map((pair) => (
                <div key={pair.pair_key} className="rounded-lg border border-[#285044] bg-[#0d1715] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="rounded bg-[#17352d] px-1.5 py-0.5 text-[8px] font-semibold text-[#6ee0c2]">맞매칭</span>
                    <span className="text-[8px] text-[#55766d]">성사 {formatTime(pair.matched_at)}</span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                    <MutualMemberView member={pair.first} />
                    <span className="text-lg text-[#6ee0c2]">↔</span>
                    <MutualMemberView member={pair.second} align="right" />
                  </div>
                </div>
              ))}
            </div>
          </div>
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

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <span className="mb-2 block text-[11px] font-medium text-[#a4a4ad]">보드 모드</span>
                  <div className="grid grid-cols-2 gap-2">
                    {([[
                      "opposite",
                      "이성 보드",
                    ], ["selectable", "선택형 보드"]] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        disabled={eventRulesLocked}
                        onClick={() => { setDraft({ ...draft, boardMode: value }); setSaveState("idle"); }}
                        className={`h-10 rounded-lg border text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${draft.boardMode === value ? "border-[#7c6ff0] bg-[#211d3c] text-[#c2baff]" : "border-white/[0.09] bg-[#0c0d10] text-[#85858f]"}`}
                      >{label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="mb-2 block text-[11px] font-medium text-[#a4a4ad]">기본 선택 기회</span>
                  <div className="grid grid-cols-2 gap-2">
                    {([1, 2] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        disabled={eventRulesLocked}
                        onClick={() => { setDraft({ ...draft, baseAllowance: value }); setSaveState("idle"); }}
                        className={`h-10 rounded-lg border text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${draft.baseAllowance === value ? "border-[#7c6ff0] bg-[#211d3c] text-[#c2baff]" : "border-white/[0.09] bg-[#0c0d10] text-[#85858f]"}`}
                      >{value}회</button>
                    ))}
                  </div>
                  <span className="mt-1.5 block text-[9px] leading-4 text-[#666670]">행사 시작 후에는 두 설정이 고정됩니다.</span>
                </div>
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
                  행사 데이터 영구 폐기
                </button>
                <p className="mt-2 text-center text-[9px] leading-4 text-[#8e5962]">매칭·카드·연락처·회차 원장은 삭제합니다. 동의한 학교 인증 계정은 마지막 참여 후 최대 6개월 유지됩니다.</p>
              </div>
            </section>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111216]">
            <SectionHeader eyebrow="Moderation" title="카드 관리" description="숨기기, 재가입 가능한 삭제, 이번 이벤트 차단을 구분해 처리합니다." />
            <div className="p-4 sm:p-5">
              <SearchBar value={search} onChange={setSearch} onSubmit={() => void doSearch()} placeholder="소개 문구 검색" buttonLabel={searching ? "검색 중…" : "검색"} />
              <div className="admin-scrollbar mt-4 max-h-80 space-y-2 overflow-auto">
                {hasSearched && searchResults.length === 0 && <EmptyState>검색 결과가 없습니다.</EmptyState>}
                {searchResults.map((card) => (
                  <div key={card.id} className="rounded-lg border border-white/[0.07] bg-[#0c0d10] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-[#e1e1e6]">{card.one_liner}</p>
                        <p className="mt-1 truncate text-[9px] text-[#666670]">{card.gender} · {card.email} · {contactTypeShortLabel(card.contact_type)} <span className="font-mono">{formatContactValue(card.instagram_id, card.contact_type)}</span></p>
                      </div>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-medium ${card.hidden_by_admin ? "bg-[#30261a] text-[#d9a84f]" : "bg-[#183029] text-[#58c9ad]"}`}>{card.hidden_by_admin ? "숨김" : "공개"}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => void hideCard(card.id, !card.hidden_by_admin)} className="rounded-md border border-white/[0.08] px-2.5 py-1.5 text-[9px] font-medium text-[#a4a4ad] hover:bg-white/[0.04]">{card.hidden_by_admin ? "다시 공개" : "숨기기"}</button>
                      <button onClick={() => void removeCard(card.id)} className="rounded-md border border-[#4e4230] px-2.5 py-1.5 text-[9px] font-medium text-[#e0b86d] hover:bg-[#221d14]">삭제</button>
                      <button onClick={() => void banAndDeleteCard(card.id)} className="rounded-md border border-[#51252e] px-2.5 py-1.5 text-[9px] font-medium text-[#ff7185] hover:bg-[#251216]">차단</button>
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
                  <div className="mt-3 rounded-md bg-white/[0.035] px-3 py-2.5">
                    <p className="text-[9px] font-medium text-[#85858f]">열람 카드 · {userInfo.viewed_cards.length}건</p>
                    {userInfo.viewed_cards.length === 0 ? (
                      <p className="mt-2 text-[9px] text-[#666670]">아직 열람한 카드가 없습니다.</p>
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        {userInfo.viewed_cards.map((card) => (
                          <div key={card.match_id} className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-black/10 px-2.5 py-2">
                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-semibold ${card.bonus ? "bg-[#2a2346] text-[#b8adff]" : "bg-[#183029] text-[#58c9ad]"}`}>
                              선택 {card.selection_number}{card.bonus ? " · 관리자 추가" : ""}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[10px] text-[#d4d4d9]">{card.target_email}</span>
                              <span className="block truncate text-[8px] text-[#666670]">{card.target_gender ?? "미설정"} · {card.one_liner}</span>
                            </span>
                            <span className="shrink-0 text-[8px] text-[#55555e]">{formatTime(card.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => void grantSlot(userInfo.id)} className="rounded-md border border-[#3e376f] bg-[#19172a] px-2.5 py-1.5 text-[9px] font-medium text-[#afa5ff]">선택 기회 +1</button>
                    <button onClick={() => void banUser(userInfo.id)} className="rounded-md border border-[#51252e] px-2.5 py-1.5 text-[9px] font-medium text-[#ff7185]">사용자 차단</button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="mt-5 overflow-hidden rounded-xl border border-[#522831] bg-[#1a1114]">
          <SectionHeader eyebrow="Last resort" title="이메일 6개월 차단" description="행사 차단과 별개로 6개월간 유지됩니다. 확인된 악용에만 사용하세요." danger />
          <div className="space-y-3 p-4 sm:p-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={banEmail} onChange={(event) => setBanEmail(event.target.value)} placeholder="student@cju.ac.kr" aria-label="6개월 차단할 학교 이메일" className="h-10 rounded-lg border border-white/[0.09] bg-[#0c0d10] px-3 text-xs text-white outline-none" />
              <input value={banReason} onChange={(event) => setBanReason(event.target.value)} maxLength={500} placeholder="차단 사유" aria-label="6개월 차단 사유" className="h-10 rounded-lg border border-white/[0.09] bg-[#0c0d10] px-3 text-xs text-white outline-none" />
            </div>
            <button onClick={() => void addPermanentBan()} disabled={banBusy} className="rounded-lg border border-[#713340] bg-[#2a151a] px-4 py-2 text-xs font-semibold text-[#ff8495] disabled:opacity-40">6개월 차단</button>
            {banMessage && <p role="status" className="text-[10px] text-[#ff9aa9]">{banMessage}</p>}
            <p className="text-[10px] text-[#8e5962]">6개월 뒤 자동 만료됩니다. 수동 해제해도 이번 행사 차단과 삭제된 계정·카드는 복구되지 않습니다.</p>
            <div className="space-y-2">
              {permanentBans.length === 0 && <p className="text-[10px] text-[#8e5962]">6개월 차단된 이메일이 없습니다.</p>}
              {permanentBans.map((ban) => (
                <div key={ban.email} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-[#0c0d10] p-3">
                  <div className="min-w-0"><p className="break-all text-xs text-white">{ban.email}</p><p className="mt-1 text-[10px] text-[#a4a4ad]">{ban.reason} · {formatTime(ban.expires_at)} 만료</p></div>
                  <button onClick={() => void releasePermanentBan(ban.email)} disabled={banBusy} className="rounded-md border border-white/[0.12] px-3 py-1.5 text-[10px] text-[#d4d4d9] disabled:opacity-40">차단 해제</button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function MutualMemberView({ member, align = "left" }: { member: MutualMember; align?: "left" | "right" }) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      <p className="truncate text-[10px] font-medium text-white">{member.email}</p>
      <p className="mt-0.5 truncate text-[9px] text-[#86a49c]">{member.one_liner}</p>
      <p className="mt-1 text-[8px] text-[#55766d]">
        {member.gender ?? "미설정"} · 선택 {member.selection_number}{member.bonus ? " · 추가 기회" : ""}
      </p>
    </div>
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
