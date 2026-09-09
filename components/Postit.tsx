import { POSTIT_COLOR_HEX, PostitColor } from "@/lib/constants";

interface Props {
  text: string;
  color: PostitColor;
  size?: "sm" | "md" | "lg";
  rotation?: number;
  className?: string;
  onClick?: () => void;
}

export function Postit({ text, color, size = "md", rotation, className = "", onClick }: Props) {
  const sizes = {
    sm: "w-16 h-16 text-[10px] p-2",
    md: "w-28 h-28 text-[13px] p-3.5",
    lg: "w-36 h-36 text-sm p-4",
  };
  const stableRotation = [...text].reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0) % 5 - 2;
  const rot = rotation ?? stableRotation;
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      style={{
        background: POSTIT_COLOR_HEX[color],
        transform: `rotate(${rot}deg)`,
        boxShadow: "0 10px 24px rgba(21,35,51,0.10), 0 1px 2px rgba(21,35,51,0.12)",
      }}
      className={`${sizes[size]} relative flex items-center justify-center overflow-hidden rounded-[3px] border border-black/[0.04] text-center font-semibold leading-relaxed text-[#17263b] disabled:opacity-100 ${onClick ? "cursor-pointer transition duration-200 hover:z-[1] hover:-translate-y-1 hover:scale-[1.03] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15bfa9] focus-visible:ring-offset-4" : "cursor-default"} ${className}`}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-white/70" />
      {text}
    </button>
  );
}
