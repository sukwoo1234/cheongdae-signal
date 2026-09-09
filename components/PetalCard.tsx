import { useId, type CSSProperties } from "react";
import type { PostitColor } from "@/lib/constants";

interface Props {
  text: string;
  color: PostitColor;
  size?: "sm" | "md" | "lg";
  rotation?: number;
  className?: string;
  onClick?: () => void;
}

const PALETTES: Record<PostitColor, { from: string; to: string; line: string }> = {
  yellow: { from: "#fffdf4", to: "#fff1bd", line: "#d2aa5e" },
  pink: { from: "#fff8fb", to: "#ffdce9", line: "#dc789b" },
  green: { from: "#f7fff9", to: "#d8f2df", line: "#5d9f75" },
  blue: { from: "#f6fbff", to: "#d9ebff", line: "#5e8fc8" },
  purple: { from: "#fbf8ff", to: "#eadcff", line: "#8b75bd" },
  orange: { from: "#fffaf7", to: "#ffe1d3", line: "#c98668" },
};

export function PetalCard({ text, color, size = "md", rotation, className = "", onClick }: Props) {
  const gradientId = useId().replaceAll(":", "");
  const hash = [...text].reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0);
  const rot = rotation ?? [-4, 2, -1, 4][hash % 4];
  const mirrored = hash % 2 === 0;
  const icon = ["♡", "♬", "☕", "✈", "♧", "☾"][hash % 6];
  const sizes = {
    sm: "h-[5.4rem] w-[6.8rem] text-[10px]",
    md: "h-[8.2rem] w-[10.4rem] text-[13px]",
    lg: "h-[9.4rem] w-[12rem] text-sm",
  };
  const palette = PALETTES[color];
  const wrapperStyle = { transform: `rotate(${rot}deg)` };
  const svgStyle: CSSProperties = {
    filter: "drop-shadow(0 14px 18px rgba(51,82,123,.13))",
    transform: mirrored ? "scaleX(-1)" : undefined,
    transformOrigin: "center",
  };

  return (
    <div className={`${sizes[size]} ${className}`} style={wrapperStyle}>
      <button
        type="button"
        disabled={!onClick}
        onClick={onClick}
        className={`group relative h-full w-full text-center font-semibold leading-relaxed text-[#263b59] disabled:opacity-100 ${onClick ? "cursor-pointer transition duration-200 hover:-translate-y-1 hover:scale-[1.035] active:scale-[.98] focus-visible:rounded-[42%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8fe3] focus-visible:ring-offset-4" : "cursor-default"}`}
        aria-label={onClick ? `${text} 카드 선택` : undefined}
      >
        <svg aria-hidden viewBox="0 0 180 140" className="absolute inset-0 h-full w-full" style={svgStyle}>
          <defs>
            <linearGradient id={gradientId} x1="18" y1="18" x2="154" y2="126" gradientUnits="userSpaceOnUse">
              <stop stopColor={palette.from} />
              <stop offset="1" stopColor={palette.to} />
            </linearGradient>
          </defs>
          <path d="M12 119C17 86 11 52 37 28C65 3 116 4 169 8C165 54 150 96 119 119C89 142 43 137 12 119Z" fill={`url(#${gradientId})`} stroke="rgba(255,255,255,.92)" strokeWidth="1.5" />
          <path d="M26 116C66 96 111 64 157 19" fill="none" stroke={palette.line} strokeOpacity=".12" strokeWidth="1.2" />
        </svg>
        <span className="absolute inset-x-[14%] top-[22%] bottom-[34%] flex items-center justify-center break-words leading-[1.6] [overflow-wrap:anywhere]">
          {text}
        </span>
        <span aria-hidden className="absolute bottom-[18%] left-[40%] text-lg font-normal opacity-65" style={{ color: palette.line }}>{icon}</span>
        {onClick && (
          <span
            aria-hidden
            className="absolute bottom-[16%] right-[15%] flex h-5 w-5 items-center justify-center rounded-full border bg-white/75 text-sm font-medium leading-none shadow-sm transition group-hover:bg-white"
            style={{ borderColor: `${palette.line}80`, color: palette.line }}
          >
            +
          </span>
        )}
      </button>
    </div>
  );
}
