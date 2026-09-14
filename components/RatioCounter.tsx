"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

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

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px] sm:text-xs">
      <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 font-bold text-blue-600">남 {male}</span>
      <span className="rounded-full border border-pink-100 bg-pink-50 px-2.5 py-1 font-bold text-pink-600">여 {female}</span>
    </div>
  );
}
