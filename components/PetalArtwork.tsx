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

/** 사용자가 제공한 벚꽃잎 PNG를 모든 카드와 색상 선택기에 공통 적용한다. */
export function PetalArtwork({ color, className = "", style }: Props) {
  return (
    <Image
      aria-hidden
      alt=""
      src="/petal-silhouette.png"
      width={431}
      height={331}
      unoptimized
      draggable={false}
      data-petal-color={color}
      className={`object-contain ${className}`}
      style={style}
    />
  );
}
