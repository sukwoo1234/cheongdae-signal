import type { PostitColor } from "@/lib/constants";
import { PetalArtwork, PETAL_PALETTES } from "@/components/PetalArtwork";

interface Props {
  text: string;
  color: PostitColor;
  size?: "sm" | "md" | "lg";
  rotation?: number;
  className?: string;
  onClick?: () => void;
}

export function PetalCard({ text, color, size = "md", rotation, className = "", onClick }: Props) {
  const hash = [...text].reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0);
  const rot = rotation ?? [-4, 2, -1, 4][hash % 4];
  const icon = ["♡", "♬", "☕", "✈", "♧", "☾"][hash % 6];
  const sizes = {
    sm: "h-[5.8rem] w-[6.7rem] text-[10px]",
    md: "h-[8.8rem] w-[10.1rem] text-[13px]",
    lg: "h-[10.2rem] w-[11.7rem] text-sm",
  };
  const palette = PETAL_PALETTES[color];
  const wrapperStyle = { transform: `rotate(${rot}deg)` };

  return (
    <div className={`${sizes[size]} ${className}`} style={wrapperStyle}>
      <button
        type="button"
        disabled={!onClick}
        onClick={onClick}
        className={`group relative h-full w-full text-center font-semibold leading-relaxed text-[#263b59] disabled:opacity-100 ${onClick ? "cursor-pointer transition duration-200 hover:-translate-y-1 hover:scale-[1.035] active:scale-[.98] focus-visible:rounded-[42%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8fe3] focus-visible:ring-offset-4" : "cursor-default"}`}
        aria-label={onClick ? `${text} 카드 선택` : undefined}
      >
        <PetalArtwork color={color} className="absolute inset-0 h-full w-full" style={{ filter: "drop-shadow(0 14px 18px rgba(51,82,123,.13))" }} />
        <span className="signal-handwriting absolute inset-x-[14%] top-[24%] bottom-[34%] flex items-center justify-center break-words text-[1.35em] font-normal leading-[1.25] [overflow-wrap:anywhere]">
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
