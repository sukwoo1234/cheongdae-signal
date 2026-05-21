"use client";

import { POSTIT_COLORS, POSTIT_COLOR_HEX, PostitColor } from "@/lib/constants";

interface Props {
  selected: PostitColor;
  onChange: (c: PostitColor) => void;
}

export function ColorPicker({ selected, onChange }: Props) {
  return (
    <div className="flex gap-2">
      {POSTIT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          style={{ background: POSTIT_COLOR_HEX[c] }}
          className={`w-7 h-7 rounded ${selected === c ? "ring-2 ring-gray-800" : ""}`}
          aria-label={c}
        />
      ))}
    </div>
  );
}
