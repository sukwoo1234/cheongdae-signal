interface Props {
  compact?: boolean;
  className?: string;
  tone?: "light" | "dark";
}

export function SignalBrand({ compact = false, className = "", tone = "light" }: Props) {
  return (
    <span
      className={`inline-flex items-center font-extrabold ${tone === "dark" ? "text-white" : "text-[#071b33]"} ${
        compact ? "gap-2 text-xs" : "gap-3 text-[15px]"
      } ${className}`}
    >
      <span className={`flex shrink-0 items-center justify-center bg-[#071b33] font-extrabold text-white ${compact ? "h-7 w-7 rounded-lg text-[10px]" : "h-[34px] w-[34px] rounded-[10px] text-[13px]"}`}>
        S
      </span>
      청대 시그널
    </span>
  );
}
