"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { RATIO_WARN_THRESHOLD, RATIO_CRITICAL_THRESHOLD } from "@/lib/constants";

interface Props {
  initialMale: number;
  initialFemale: number;
}

export function RatioCounter({ initialMale, initialFemale }: Props) {
  const [male, setMale] = useState(initialMale);
  const [female, setFemale] = useState(initialFemale);

  useEffect(() => {
    const sb = createClient();
    const ch = sb
      .channel("users-counter")
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, async () => {
        const res = await fetch("/api/session");
        if (res.ok) {
          const data = await res.json();
          setMale(data.counts.male);
          setFemale(data.counts.female);
        }
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);

  const total = male + female;
  let level: "good" | "warn" | "critical" = "good";
  if (total > 0) {
    const dominantRatio = Math.max(male, female) / total;
    if (dominantRatio >= RATIO_CRITICAL_THRESHOLD) level = "critical";
    else if (dominantRatio >= RATIO_WARN_THRESHOLD) level = "warn";
  }

  const dot = { good: "text-green-500", warn: "text-yellow-500", critical: "text-red-500" }[level];
  const label = { good: "균형 양호", warn: "비율 불균형", critical: "심각 불균형" }[level];

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="bg-blue-50 text-blue-600 font-bold px-2 py-1 rounded-full">남 {male}</span>
      <span className="bg-pink-50 text-pink-600 font-bold px-2 py-1 rounded-full">여 {female}</span>
      <span className={`${dot}`}>● {label}</span>
    </div>
  );
}
