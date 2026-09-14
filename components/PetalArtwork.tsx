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

const PETAL_FILTERS: Record<PostitColor, string> = {
  yellow: "hue-rotate(75deg) saturate(.85) brightness(1.02)",
  pink: "",
  green: "hue-rotate(140deg) saturate(.65) brightness(1.02)",
  blue: "hue-rotate(225deg) saturate(.7) brightness(1.03)",
  purple: "hue-rotate(300deg) saturate(.65) brightness(1.02)",
  orange: "hue-rotate(40deg) saturate(.75) brightness(1.01)",
};

interface Props {
  color: PostitColor;
  className?: string;
  style?: CSSProperties;
}

/** 사용자가 제공한 벚꽃잎 PNG를 모든 카드와 색상 선택기에 공통 적용한다. */
export function PetalArtwork({ color, className = "", style }: Props) {
  const { filter: extraFilter, ...restStyle } = style ?? {};
  const artworkStyle: CSSProperties = {
    backgroundImage: "url('/petal-silhouette.png')",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "contain",
    filter: [PETAL_FILTERS[color], extraFilter].filter(Boolean).join(" "),
    ...restStyle,
  };

  return <span aria-hidden className={`block ${className}`} style={artworkStyle} />;
}
