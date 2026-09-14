import Image from "next/image";
import type { CSSProperties } from "react";
import type { PostitColor } from "@/lib/constants";

export const PETAL_PALETTES: Record<PostitColor, { from: string; to: string; line: string }> = {
  yellow: { from: "#fffdf4", to: "#fff1bd", line: "#d2aa5e" },
  pink: { from: "#fff8fb", to: "#ffdce9", line: "#dc789b" },
  green: { from: "#f7fff9", to: "#d8f2df", line: "#5d9f75" },
  blue: { from: "#f6fbff", to: "#d9ebff", line: "#5e8fc8" },
  purple: { from: "#fbf8ff", to: "#eadcff", line: "#8b75bd" },
  orange: { from: "#fffaf7", to: "#ffe1d3", line: "#c98668" },
};

interface Props {
  color: PostitColor;
  className?: string;
  style?: CSSProperties;
}

/** 사용자가 제공한 PNG 원본을 그대로 표시하고 그 위에 선택 색상만 입힌다. */
export function PetalArtwork({ color, className = "", style }: Props) {
  const palette = PETAL_PALETTES[color];

  return (
    <span
      aria-hidden
      data-petal-color={color}
      className={`relative block overflow-visible ${className}`}
      style={style}
    >
      <Image
        alt=""
        src="/petal-silhouette.png"
        width={431}
        height={331}
        unoptimized
        draggable={false}
        className="absolute inset-0 h-full w-full scale-[1.32] object-contain"
      />
      {color !== "pink" && (
        <span
          className="absolute inset-0 scale-[1.32]"
          style={{
            backgroundColor: palette.to,
            mixBlendMode: "color",
            opacity: 0.92,
            WebkitMaskImage: "url('/petal-silhouette.png')",
            maskImage: "url('/petal-silhouette.png')",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
            WebkitMaskSize: "contain",
            maskSize: "contain",
          }}
        />
      )}
    </span>
  );
}
