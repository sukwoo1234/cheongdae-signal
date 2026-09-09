"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PetalCard } from "@/components/PetalCard";
import { ColorPicker } from "@/components/ColorPicker";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CampusShell } from "@/components/CampusShell";
import { ONELINER_MAX_LENGTH, PostitColor, POSTIT_COLORS } from "@/lib/constants";

export default function NewCard() {
  const [oneLiner, setOneLiner] = useState("");
  const [instaId, setInstaId] = useState("");
  const [color, setColor] = useState<PostitColor>(POSTIT_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const canSubmit = useMemo(
    () => oneLiner.trim().length > 0 && instaId.trim().length > 0 && !submitting,
    [oneLiner, instaId, submitting]
  );

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/cards", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        one_liner: oneLiner.trim(),
        instagram_id: instaId.trim(),
        color,
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
        INVALID_INSTAGRAM_ID: "인스타 ID 형식이 잘못됐어요 (영문/숫자/_/. 만 가능, 30자 이내)",
        INVALID_COLOR: "색상이 잘못됐어요",
        ALREADY_HAS_CARD: "이미 카드를 만들었어요",
      };
      setError(msgs[data.error] || "오류가 발생했어요");
      setSubmitting(false);
    }
  }

  return (
    <CampusShell className="min-h-[1020px] sm:min-h-screen">
      <section className="relative mx-auto mt-8 w-full max-w-[560px] rounded-[32px] border border-white/90 bg-white/90 px-6 pb-7 pt-16 shadow-[0_28px_80px_rgba(54,90,139,.18)] backdrop-blur-xl sm:px-10 sm:pb-10">
        <div className="absolute -top-10 left-1/2 flex h-20 w-20 -translate-x-1/2 items-center justify-center rounded-full border-[8px] border-white bg-gradient-to-br from-[#8875ed] via-[#e267bc] to-[#ffc986] shadow-sm">
          <svg viewBox="0 0 24 24" fill="none" className="h-9 w-9 text-white" aria-hidden><rect x="5" y="5" width="14" height="14" rx="4" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8"/><circle cx="16.8" cy="7.4" r="1" fill="currentColor"/></svg>
        </div>
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

        <label className="mb-2 mt-5 block text-sm font-bold text-[#3f5677]">♙ &nbsp;인스타그램 ID</label>
        <Input
          placeholder="@ 없이 입력"
          className="h-14 text-base"
          value={instaId}
          onChange={(e) => setInstaId(e.target.value)}
        />

        <label className="mb-3 mt-6 block text-sm font-bold text-[#3f5677]">◉ &nbsp;카드 색상</label>
        <ColorPicker selected={color} onChange={setColor} />

        <div className="mt-7 rounded-[24px] border border-white/90 bg-[linear-gradient(135deg,rgba(239,246,255,.82),rgba(255,243,249,.82))] px-4 py-5 shadow-inner">
          <div className="mb-4 text-center text-xs font-bold text-[#536c8e]">◉ &nbsp;미리보기</div>
          <div className="flex justify-center">
            <div className="relative">
              <PetalCard text={oneLiner || "한 줄 소개"} color={color} size="lg" rotation={-2} />
              <span aria-hidden className="absolute -right-3 top-3 h-1.5 w-5 rotate-[62deg] rounded-full bg-[#f08bab]" />
              <span aria-hidden className="absolute -right-5 top-8 h-1.5 w-5 rotate-[12deg] rounded-full bg-[#f08bab]" />
            </div>
          </div>
        </div>

        <Button onClick={submit} disabled={!canSubmit} className="mt-6 h-14 w-full bg-gradient-to-r from-[#3e86ea] via-[#668fe9] to-[#aa74e9] text-base shadow-[0_12px_28px_rgba(64,126,212,.24)]">
          {submitting ? "카드 올리는 중…" : "보드에 올리기  →"}
        </Button>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-center text-xs text-red-600">{error}</p>}
      </section>
    </CampusShell>
  );
}
