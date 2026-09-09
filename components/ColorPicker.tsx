"use client";

import { POSTIT_COLORS, POSTIT_COLOR_HEX, PostitColor } from "@/lib/constants";

interface Props {
  selected: PostitColor;
  onChange: (c: PostitColor) => void;
}

export function ColorPicker({ selected, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {POSTIT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          style={{ background: POSTIT_COLOR_HEX[c] }}
          className={`h-11 w-11 rotate-[-18deg] rounded-[72%_12%_70%_18%/72%_16%_68%_20%] border border-white/90 shadow-[0_5px_12px_rgba(49,75,108,.08)] transition hover:-translate-y-0.5 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3975c6] focus-visible:ring-offset-2 ${selected === c ? "ring-[3px] ring-[#102c4e] ring-offset-[3px]" : ""}`}
          aria-label={`${c} 색상`}
          aria-pressed={selected === c}
        />
      ))}
    </div>
  );
}
