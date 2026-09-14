"use client";

import { POSTIT_COLORS, PostitColor } from "@/lib/constants";
import { PetalArtwork } from "@/components/PetalArtwork";

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
          className={`flex h-12 w-12 items-center justify-center rounded-full transition hover:-translate-y-0.5 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3975c6] focus-visible:ring-offset-2 ${selected === c ? "ring-[3px] ring-[#102c4e] ring-offset-1" : ""}`}
          aria-label={`${c} 색상`}
          aria-pressed={selected === c}
        >
          <PetalArtwork color={c} className="h-11 w-11 rotate-[-12deg] drop-shadow-[0_5px_9px_rgba(49,75,108,.1)]" />
        </button>
      ))}
    </div>
  );
}
