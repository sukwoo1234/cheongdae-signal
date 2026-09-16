"use client";

import { useRouter } from "next/navigation";

interface Props {
  className?: string;
}

export function LegalBackButton({ className = "" }: Props) {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  return (
    <button type="button" onClick={goBack} className={className}>
      ← 이전으로
    </button>
  );
}
