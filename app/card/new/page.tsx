"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Postit } from "@/components/Postit";
import { ColorPicker } from "@/components/ColorPicker";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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
      headers: { "Content-Type": "application/json" },
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
    <main className="min-h-screen flex flex-col items-center px-6 py-8 bg-[#faf6e8]">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6">
        <h1 className="text-lg font-bold text-center mb-6">내 카드 만들기</h1>

        <label className="text-xs text-gray-600 block mb-1">한 줄 소개</label>
        {/* maxLength(UTF-16 단위) 대신 코드포인트로 센다. 서버·DB의 20자 기준과 맞춘다. */}
        <Input
          placeholder="예: 강동원 닮은꼴"
          value={oneLiner}
          onChange={(e) => {
            const v = e.target.value;
            if ([...v].length <= ONELINER_MAX_LENGTH) setOneLiner(v);
          }}
        />
        <div className="text-right text-xs text-gray-400 mt-0.5">
          {[...oneLiner].length}/{ONELINER_MAX_LENGTH}
        </div>

        <label className="text-xs text-gray-600 block mt-3 mb-1">인스타그램 ID</label>
        <Input
          placeholder="@my_insta_id"
          value={instaId}
          onChange={(e) => setInstaId(e.target.value)}
        />

        <label className="text-xs text-gray-600 block mt-4 mb-2">포스트잇 색</label>
        <ColorPicker selected={color} onChange={setColor} />

        <div className="mt-6 text-xs text-gray-500 mb-2 text-center">미리보기</div>
        <div className="flex justify-center mb-6">
          <Postit text={oneLiner || "한 줄 소개"} color={color} size="md" rotation={-1.5} />
        </div>

        <Button onClick={submit} disabled={!canSubmit} className="w-full">
          {submitting ? "올리는 중..." : "보드에 올리기"}
        </Button>
        {error && <p className="text-red-600 text-xs text-center mt-3">{error}</p>}
      </div>
    </main>
  );
}
