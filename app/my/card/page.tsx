"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PetalCard } from "@/components/PetalCard";
import { ColorPicker } from "@/components/ColorPicker";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CampusShell } from "@/components/CampusShell";
import { SignalLoading } from "@/components/SignalLoading";
import { PaletteIcon } from "@/components/FieldIcons";
import { ContactMethodTabs } from "@/components/ContactMethodTabs";
import { ONELINER_MAX_LENGTH, PostitColor } from "@/lib/constants";
import type { MyCard } from "@/lib/types";
import type { ContactType } from "@/lib/validation/contact";

export default function MyCardPage() {
  const [card, setCard] = useState<MyCard | null>(null);
  const [oneLiner, setOneLiner] = useState("");
  const [contactValue, setContactValue] = useState("");
  const [contactType, setContactType] = useState<ContactType>("instagram");
  const [color, setColor] = useState<PostitColor>("yellow");
  const [saving, setSaving] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/cards/me")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => {
        setCard(d.card);
        if (d.card) {
          setOneLiner(d.card.one_liner);
          setContactValue(d.card.instagram_id);
          setContactType(d.card.contact_type);
          setColor(d.card.color);
          setHidden(d.card.hidden_by_user);
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/cards/me", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ one_liner: oneLiner, instagram_id: contactValue, contact_type: contactType, color }),
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
    if (!confirm("계정·카드·매칭 정보를 삭제할까요?")) return;
    const res = await fetch("/api/users/me", {
      method: "DELETE",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!res.ok) return;
    router.push("/");
  }

  if (!loaded) return <SignalLoading message="내 카드를 준비하고 있어요." />;
  if (!card) return (
    <CampusShell>
      <section className="mx-auto mt-8 max-w-md rounded-3xl bg-white p-6 text-center text-sm leading-7 text-[#526783]">
        <p>{loadError ? "카드를 불러오지 못했어요. 다시 접속해주세요." : "아직 등록한 카드가 없어요."}</p>
        <Link href="/board" className="block underline">운영 안내·보드로</Link>
        {!loadError && <Link href="/card/new" className="block underline">카드 만들기</Link>}
        <button onClick={deleteAccount} className="mt-4 text-red-600 underline">계정·참여 정보 삭제</button>
      </section>
    </CampusShell>
  );

  return (
    <CampusShell className="min-h-[1250px] sm:min-h-screen">
      <div className="mx-auto mt-4 max-w-md rounded-[30px] border border-white/90 bg-white/92 p-6 shadow-[0_28px_80px_rgba(54,90,139,.18)] backdrop-blur-xl sm:p-8">
        <div className="mb-6 flex items-start justify-between">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#27bfae]">Profile card</p><h1 className="mt-1 text-2xl font-extrabold tracking-[-0.04em] text-[#0c2748]">내 카드 관리</h1></div>
          <Link href="/board" className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-[#294665] shadow-sm ring-1 ring-[#dce4ee] hover:bg-[#f7f9fc]">보드로</Link>
        </div>

        <div className="mb-7 flex justify-center rounded-[24px] border border-dashed border-[#ccdaea] bg-[linear-gradient(135deg,#f5f9ff,#fff6fa)] py-7">
          <PetalCard text={oneLiner || "한 줄 소개"} color={color} size="lg" rotation={-2} />
        </div>

        <label className="mb-2 block text-sm font-bold text-[#183654]">✎ &nbsp;한 줄 소개</label>
        <Input
          className="h-14 text-base"
          value={oneLiner}
          onChange={(e) => {
            const v = e.target.value;
            if ([...v].length <= ONELINER_MAX_LENGTH) setOneLiner(v);
          }}
        />
        <ContactMethodTabs
          type={contactType}
          value={contactValue}
          onTypeChange={setContactType}
          onValueChange={setContactValue}
        />
        <label className="mb-3 mt-5 flex items-center gap-2 text-sm font-bold text-[#183654]"><PaletteIcon />카드 색상</label>
        <ColorPicker selected={color} onChange={setColor} />

        <Button onClick={save} disabled={saving} className="mt-6 h-14 w-full rounded-2xl bg-[linear-gradient(135deg,#0b2b4c,#00213e)] text-base">
          {saving ? "저장 중..." : "저장"}
        </Button>

        <div className="my-7 border-t border-[#e5ebf2]"></div>

        <button
          onClick={toggleHide}
          className={`min-h-13 w-full rounded-2xl border-2 px-3 py-3 text-sm font-bold transition ${hidden ? "border-[#9cddd4] bg-[#eefaf8] text-[#0b8f7e]" : "border-[#ffb8c5] bg-[#fffafb] text-[#e63d58]"}`}
        >
          {hidden ? "다시 보드에 올리기" : "카드 내리기 (숨기기)"}
        </button>
        <p className="mt-2 text-center text-[10px] text-[#8390a2]">
          이미 본 사람에게 공개된 연락처는 회수되지 않아요.
        </p>

        <div className="my-7 border-t border-[#e5ebf2]"></div>

        <button onClick={deleteAccount} className="w-full text-sm font-bold text-[#d92d49] underline decoration-[#e8aeb7] underline-offset-4">
          계정과 카드 정보 삭제
        </button>
      </div>
    </CampusShell>
  );
}
