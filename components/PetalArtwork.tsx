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

/** 시안의 벚꽃잎 실루엣을 모든 카드와 색상 선택기에 공통 적용한다. */
export function PetalArtwork({ color, className = "", style }: Props) {
  const palette = PETAL_PALETTES[color];
  const maskStyle: CSSProperties = {
    backgroundImage: [
      "radial-gradient(circle at 35% 38%, rgba(255,255,255,.7), transparent 42%)",
      `linear-gradient(135deg, ${palette.from} 5%, ${palette.to} 92%)`,
    ].join(", "),
    WebkitMaskImage: "url('/petal-silhouette.png')",
    maskImage: "url('/petal-silhouette.png')",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
    maskSize: "contain",
    ...style,
  };

  return <span aria-hidden className={`block ${className}`} style={maskStyle} />;
}
