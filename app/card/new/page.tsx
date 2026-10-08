"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PetalCard } from "@/components/PetalCard";
import { ColorPicker } from "@/components/ColorPicker";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CampusShell } from "@/components/CampusShell";
import { GraduationCapBadge } from "@/components/GraduationCapBadge";
import { PaletteIcon } from "@/components/FieldIcons";
import { ContactMethodTabs } from "@/components/ContactMethodTabs";
import { seasonAudienceLabel, seasonEndLabel } from "@/lib/season-consent";
import type { SeasonState } from "@/lib/types";
import { ONELINER_MAX_LENGTH, PostitColor, POSTIT_COLORS } from "@/lib/constants";
import type { ContactType } from "@/lib/validation/contact";

export default function NewCard() {
  const [oneLiner, setOneLiner] = useState("");
  const [contactValue, setContactValue] = useState("");
  const [contactType, setContactType] = useState<ContactType>("instagram");
  const [color, setColor] = useState<PostitColor>(POSTIT_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<SeasonState | null>(null);
  const router = useRouter();

  const loadSeason = useCallback(async () => {
    setSeason(null);
    try {
      const res = await fetch("/api/season", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) { router.replace("/"); return; }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSeason(data.season);
    } catch { setError("운영 안내를 불러오지 못했어요. 새로고침 후 다시 시도해주세요."); }
  }, [router]);
  useEffect(() => { void loadSeason(); }, [loadSeason]);
  const ended = !!season && new Date(season.ends_at).getTime() <= Date.now();

  const canSubmit = useMemo(
    () => oneLiner.trim().length > 0 && contactValue.trim().length > 0 && !submitting && !!season && !ended,
    [oneLiner, contactValue, submitting, season, ended]
  );

  async function submit() {
    if (!canSubmit || !season) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          one_liner: oneLiner.trim(),
          instagram_id: contactValue.trim(),
          contact_type: contactType,
          color,
          ...(season.continuous_mode ? { season_consent: {
            accepted: true, event_id: season.event_id, ends_at: season.ends_at, board_mode: season.board_mode,
          } } : {}),
        }),
      });
      if (res.ok) {
        router.push("/board");
      } else {
        const data = await res.json().catch(() => ({}));
        const msgs: Record<string, string> = {
          INVALID_ONELINER: "한 줄 소개는 1~20자",
          PROFANITY_DETECTED: "비속어가 포함되어 있어요",
          PHONE_DETECTED: "전화번호는 적을 수 없어요",
          INVALID_CONTACT: "인스타그램 ID, 카톡 ID 또는 휴대전화 번호 형식을 확인해주세요",
          INVALID_CONTACT_TYPE: "연락 방법을 다시 선택해주세요",
          INVALID_COLOR: "색상이 잘못됐어요",
          ALREADY_HAS_CARD: "이미 카드를 만들었어요",
          SEASON_CONSENT_REQUIRED: "운영 안내를 확인한 뒤 다시 등록해주세요",
          SEASON_CHANGED: "운영 안내가 갱신됐어요. 내용을 확인한 뒤 다시 등록해주세요",
          SEASON_UNAVAILABLE: "운영 정보를 확인하지 못했어요. 잠시 후 다시 시도해주세요",
          SESSION_ENDED: "이번 운영이 종료됐어요",
        };
        if (data.error === "SEASON_CHANGED") await loadSeason();
        setError(msgs[data.error] || "오류가 발생했어요");
      }
    } catch {
      setError("카드를 등록하지 못했어요. 연결을 확인한 뒤 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CampusShell className="min-h-[1020px] sm:min-h-screen">
      <section className="relative mx-auto mt-8 w-full max-w-[560px] rounded-[32px] border border-white/90 bg-white/90 px-6 pb-7 pt-16 shadow-[0_28px_80px_rgba(54,90,139,.18)] backdrop-blur-xl sm:px-10 sm:pb-10">
        <GraduationCapBadge />
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black tracking-[-0.045em] text-[#10243f]">내 <span className="text-[#3d7bd2]">카드</span> 만들기</h1>
          <p className="mt-2 text-sm text-[#7083a0]">나만의 한 줄 소개로 새로운 인연을 시작해보세요.</p>
        </div>

        <label className="mb-2 block text-sm font-bold text-[#3f5677]">✎ &nbsp;한 줄 소개</label>
        {/* maxLength(UTF-16 단위) 대신 코드포인트로 센다. 서버·DB의 20자 기준과 맞춘다. */}
        <Input
          placeholder="예: 산책과 야구를 좋아해요"
          className="h-14 text-base"
          value={oneLiner}
          onChange={(e) => {
            const v = e.target.value;
            if ([...v].length <= ONELINER_MAX_LENGTH) setOneLiner(v);
          }}
        />
        <div className="mt-1 text-right text-[10px] font-medium text-[#9aa6b5]">
          {[...oneLiner].length}/{ONELINER_MAX_LENGTH}
        </div>

        <ContactMethodTabs
          type={contactType}
          value={contactValue}
          onTypeChange={setContactType}
          onValueChange={setContactValue}
        />

        <label className="mb-3 mt-6 flex items-center gap-2 text-sm font-bold text-[#3f5677]"><PaletteIcon />카드 색상</label>
        <ColorPicker selected={color} onChange={setColor} />

        <div className="mt-7 rounded-[24px] border border-white/90 bg-[linear-gradient(135deg,rgba(239,246,255,.82),rgba(255,243,249,.82))] px-4 py-5 shadow-inner">
          <div className="mb-4 text-center text-xs font-bold text-[#536c8e]">미리보기</div>
          <div className="flex justify-center">
            <PetalCard text={oneLiner || "한 줄 소개"} color={color} size="lg" rotation={-2} />
          </div>
        </div>

        {season?.continuous_mode && (
          <div className="mt-6 rounded-xl bg-[#f3f7fd] p-4 text-xs leading-5 text-[#526783]">
            <p>카드를 <strong>{seasonEndLabel(season.ends_at)} (한국시간)</strong>까지 유지하고, <strong>{seasonAudienceLabel(season.board_mode)} 공개</strong>합니다.</p>
            <p className="mt-2">연락처는 내 카드를 선택한 참가자에게만 공개되며, 카드·연락처·선택 기록은 운영 종료 후 7일 이내 폐기합니다.</p>
            <p className="mt-2">아래 버튼을 누르면 이 안내에 동의하고 카드를 등록합니다. <Link className="underline" href="/terms">이용약관</Link> · <Link className="underline" href="/privacy">개인정보 처리방침</Link></p>
          </div>
        )}
        {ended && <p className="mt-4 text-center text-sm text-[#526783]">이번 운영이 종료됐어요.</p>}
        <Button onClick={submit} disabled={!canSubmit} className="mt-6 h-14 w-full bg-gradient-to-r from-[#3e86ea] via-[#668fe9] to-[#aa74e9] text-base shadow-[0_12px_28px_rgba(64,126,212,.24)]">
          {submitting ? "카드 올리는 중…" : season?.continuous_mode ? "동의하고 보드에 올리기  →" : "보드에 올리기  →"}
        </Button>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-center text-xs text-red-600">{error}</p>}
      </section>
    </CampusShell>
  );
}
