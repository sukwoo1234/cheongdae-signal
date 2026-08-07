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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ one_liner: oneLiner, instagram_id: instaId, color }),
    });
    setSaving(false);
  }

  async function toggleHide() {
    const next = !hidden;
    setHidden(next);
    await fetch("/api/cards/me/toggle-hide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: next }),
    });
  }

  async function deleteAccount() {
    if (!confirm("정말로 계정과 모든 데이터를 삭제할까요? 되돌릴 수 없어요.")) return;
    await fetch("/api/users/me", { method: "DELETE" });
    router.push("/");
  }

  if (!card) return <main className="min-h-screen flex items-center justify-center">불러오는 중...</main>;

  return (
    <main className="min-h-screen bg-[#eef3ff] px-4 py-6">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-bold text-gray-800">내 카드 관리</h1>
          <Link href="/board" className="text-xs text-gray-600">← 보드</Link>
        </div>

        <div className="flex justify-center mb-4">
          <Postit text={oneLiner || "한 줄 소개"} color={color} size="md" rotation={-1} />
        </div>

        <label className="text-xs text-gray-600 block mb-1">한 줄 소개</label>
        <Input
          value={oneLiner}
          onChange={(e) => {
            const v = e.target.value;
            if ([...v].length <= ONELINER_MAX_LENGTH) setOneLiner(v);
          }}
        />
        <label className="text-xs text-gray-600 block mt-3 mb-1">인스타 ID</label>
        <Input value={instaId} onChange={(e) => setInstaId(e.target.value)} />
        <label className="text-xs text-gray-600 block mt-3 mb-2">색</label>
        <ColorPicker selected={color} onChange={setColor} />

        <Button onClick={save} disabled={saving} className="w-full mt-4">
          {saving ? "저장 중..." : "저장"}
        </Button>

        <div className="border-t my-6"></div>

        <button
          onClick={toggleHide}
          className={`w-full text-xs font-semibold px-3 py-2 rounded border ${hidden ? "border-green-500 text-green-600" : "border-red-500 text-red-600"}`}
        >
          {hidden ? "다시 보드에 올리기" : "카드 내리기 (킬 스위치)"}
        </button>
        <p className="text-[10px] text-gray-500 mt-1 text-center">
          이미 본 사람의 인스타 ID는 회수되지 않아요.
        </p>

        <div className="border-t my-6"></div>

        <button onClick={deleteAccount} className="w-full text-xs text-red-600 underline">
          계정과 모든 데이터 즉시 삭제
        </button>
      </div>
    </main>
  );
}
