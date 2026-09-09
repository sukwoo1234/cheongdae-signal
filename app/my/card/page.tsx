"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Postit } from "@/components/Postit";
import { ColorPicker } from "@/components/ColorPicker";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ONELINER_MAX_LENGTH, PostitColor } from "@/lib/constants";
import type { MyCard } from "@/lib/types";

export default function MyCardPage() {
  const [card, setCard] = useState<MyCard | null>(null);
  const [oneLiner, setOneLiner] = useState("");
  const [instaId, setInstaId] = useState("");
  const [color, setColor] = useState<PostitColor>("yellow");
  const [saving, setSaving] = useState(false);
  const [hidden, setHidden] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/cards/me")
      .then((r) => r.json())
      .then((d) => {
        setCard(d.card);
        if (d.card) {
          setOneLiner(d.card.one_liner);
          setInstaId(d.card.instagram_id);
          setColor(d.card.color);
          setHidden(d.card.hidden_by_user);
        }
      });
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/cards/me", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ one_liner: oneLiner, instagram_id: instaId, color }),
    });
    setSaving(false);
  }

  async function toggleHide() {
    const next = !hidden;
    setHidden(next);
    await fetch("/api/cards/me/toggle-hide", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ hidden: next }),
    });
  }

  async function deleteAccount() {
    if (!confirm("계정·카드·매칭 정보를 삭제할까요? 행사 내 중복 이용 방지 기록은 행사 폐기 시 함께 삭제됩니다.")) return;
    const res = await fetch("/api/users/me", {
      method: "DELETE",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!res.ok) return;
    router.push("/");
  }

  if (!card) return <main className="flex min-h-screen items-center justify-center bg-[#f4f7fb] text-sm text-[#8390a2]">카드를 불러오는 중…</main>;

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-5 py-8 sm:py-12">
      <div className="signal-enter mx-auto max-w-md rounded-[28px] border border-[#dce4ee] bg-white p-6 shadow-[0_24px_70px_rgba(24,46,76,0.10)] sm:p-8">
        <div className="mb-6 flex items-start justify-between">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#0ca18e]">Profile card</p><h1 className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-[#071b33]">내 카드 관리</h1></div>
          <Link href="/board" className="rounded-lg px-2.5 py-2 text-xs font-semibold text-[#526176] hover:bg-[#f1f5f9]">보드로</Link>
        </div>

        <div className="mb-6 flex justify-center rounded-2xl border border-dashed border-[#d8e1eb] bg-[#f8fafc] py-6">
          <Postit text={oneLiner || "한 줄 소개"} color={color} size="md" rotation={-1} />
        </div>

        <label className="mb-1.5 block text-xs font-semibold text-[#34445a]">한 줄 소개</label>
        <Input
          value={oneLiner}
          onChange={(e) => {
            const v = e.target.value;
            if ([...v].length <= ONELINER_MAX_LENGTH) setOneLiner(v);
          }}
        />
        <label className="mb-1.5 mt-4 block text-xs font-semibold text-[#34445a]">인스타그램 ID</label>
        <Input value={instaId} onChange={(e) => setInstaId(e.target.value)} />
        <label className="mb-2 mt-4 block text-xs font-semibold text-[#34445a]">카드 색상</label>
        <ColorPicker selected={color} onChange={setColor} />

        <Button onClick={save} disabled={saving} className="w-full mt-4">
          {saving ? "저장 중..." : "저장"}
        </Button>

        <div className="my-7 border-t border-[#e5ebf2]"></div>

        <button
          onClick={toggleHide}
          className={`min-h-11 w-full rounded-xl border px-3 py-2 text-xs font-semibold transition ${hidden ? "border-[#9cddd4] bg-[#eefaf8] text-[#0b8f7e]" : "border-[#f0c7cd] bg-[#fff7f8] text-[#bd3344]"}`}
        >
          {hidden ? "다시 보드에 올리기" : "카드 내리기 (킬 스위치)"}
        </button>
        <p className="mt-2 text-center text-[10px] text-[#8390a2]">
          이미 본 사람의 인스타 ID는 회수되지 않아요.
        </p>

        <div className="my-7 border-t border-[#e5ebf2]"></div>

        <button onClick={deleteAccount} className="w-full text-xs font-semibold text-[#bd3344] underline decoration-[#e8aeb7] underline-offset-4">
          계정과 카드 정보 삭제
        </button>
      </div>
    </main>
  );
}
