"use client";

import { POSTIT_COLORS, POSTIT_COLOR_HEX, PostitColor } from "@/lib/constants";

interface Props {
  selected: PostitColor;
  onChange: (c: PostitColor) => void;
}

export function ColorPicker({ selected, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {POSTIT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          style={{ background: POSTIT_COLOR_HEX[c] }}
          className={`h-9 w-9 rounded-full border border-black/5 transition hover:scale-105 ${selected === c ? "ring-2 ring-[#071b33] ring-offset-2" : ""}`}
          aria-label={`${c} 색상`}
        />
      ))}
    </div>
  );
}
