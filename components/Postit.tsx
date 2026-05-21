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
    md: "w-24 h-24 text-xs p-3",
    lg: "w-32 h-32 text-sm p-4",
  };
  const rot = rotation ?? ((Math.random() * 4) - 2);
  return (
    <div
      onClick={onClick}
      style={{
        background: POSTIT_COLOR_HEX[color],
        transform: `rotate(${rot}deg)`,
        boxShadow: "1px 2px 4px rgba(0,0,0,0.15)",
      }}
      className={`${sizes[size]} font-semibold text-gray-800 flex items-center justify-center text-center break-keep ${onClick ? "cursor-pointer hover:scale-105 transition" : ""} ${className}`}
    >
      {text}
    </div>
  );
}
