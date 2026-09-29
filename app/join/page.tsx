"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CampusShell } from "@/components/CampusShell";
import { GraduationCapBadge } from "@/components/GraduationCapBadge";
import { Button } from "@/components/ui/Button";

export default function JoinCurrentEvent() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/events/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        // 기존 계정이 이전 방침에만 동의한 상태라면 이 버튼으로 보유 동의를 기록한다.
        body: JSON.stringify({ retention_consent: true }),
      });
      const data = (await response.json().catch(() => ({}))) as { next?: string; error?: string };
      if (response.ok && data.next) {
        router.replace(data.next);
        return;
      }
      const messages: Record<string, string> = {
        EVENT_ENDED: "이번 운영은 종료됐어요. 다음 회차를 기다려주세요.",
        PURGE_IN_PROGRESS: "행사 데이터를 정리하고 있어요. 잠시 후 다시 시도해주세요.",
        EVENT_CHANGED: "새 회차가 시작됐어요. 새로고침 후 다시 참여해주세요.",
        BANNED: "이용이 제한된 계정이에요.",
        UNAUTHENTICATED: "로그인 상태가 만료됐어요. 첫 화면에서 다시 로그인해주세요.",
        ACCOUNT_EXPIRED: "6개월 보유 기간이 끝났어요. 첫 화면에서 학교 이메일로 다시 인증해주세요.",
      };
      setError(messages[data.error ?? ""] ?? "참여 처리를 완료하지 못했어요. 잠시 후 다시 시도해주세요.");
    } catch {
      setError("네트워크 연결을 확인한 뒤 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteAccount() {
    if (!window.confirm("학교 인증 계정을 삭제할까요? 삭제하면 다음에 다시 이메일 인증을 해야 해요.")) return;
    setDeleting(true);
    setError(null);
    const response = await fetch("/api/users/me", {
      method: "DELETE",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    }).catch(() => null);
    if (response?.ok) {
      router.replace("/");
      router.refresh();
      return;
    }
    setError("계정을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.");
    setDeleting(false);
  }

  return (
    <CampusShell className="min-h-[760px] sm:min-h-screen">
      <section className="relative mx-auto mt-10 w-full max-w-[560px] rounded-[32px] border border-white/90 bg-white/90 px-6 pb-8 pt-16 shadow-[0_28px_80px_rgba(54,90,139,.18)] backdrop-blur-xl sm:px-10 sm:pb-10">
        <GraduationCapBadge />
        <div className="text-center">
          <p className="text-[11px] font-extrabold tracking-[0.18em] text-[#5a82bd]">WELCOME BACK</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.045em] text-[#10243f]">이번 회차에도 참여할까요?</h1>
          <p className="mt-3 break-keep text-sm leading-6 text-[#6f829d]">
            학교 인증은 유지되어 이메일 로그인을 다시 할 필요가 없어요.<br />
            이번 회차에 사용할 새 카드만 등록해주세요.
          </p>
        </div>

        <div className="mt-7 rounded-2xl border border-[#dce6f4] bg-[#f6f9fe] px-4 py-4 text-xs leading-5 text-[#5d718d]">
          <p>이전 회차의 한 줄 소개·연락처·매칭 정보는 폐기되며 이번 회차로 이어지지 않아요.</p>
          <p className="mt-2">이 버튼을 누르면 <Link href="/terms" className="font-bold text-[#3978cf] underline underline-offset-2">이용약관</Link>과{" "}<Link href="/privacy" className="font-bold text-[#3978cf] underline underline-offset-2">개인정보 처리방침</Link>에 동의하고 이번 회차에 참여합니다.</p>
        </div>

        <Button onClick={join} disabled={loading} className="mt-6 h-14 w-full bg-gradient-to-r from-[#5d8fe0] to-[#91a5dc] text-base shadow-[0_12px_28px_rgba(75,112,174,.22)]">
          {loading ? "참여 처리 중…" : "이번 회차 참여하기  →"}
        </Button>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-center text-xs text-red-600">{error}</p>}

        <p className="mt-5 text-center text-[11px] leading-5 text-[#8190a5]">
          계정은 마지막 참여일로부터 최대 6개월간 유지되며,<br />
          아래 버튼으로 언제든지 즉시 삭제할 수 있어요.
        </p>
        <button type="button" onClick={deleteAccount} disabled={loading || deleting} className="mx-auto mt-3 block text-[11px] text-[#8a98ab] underline underline-offset-2 disabled:opacity-50">
          {deleting ? "계정 삭제 중…" : "학교 인증 계정 삭제"}
        </button>
      </section>
    </CampusShell>
  );
}
