interface Props {
  compact?: boolean;
  className?: string;
}

export function SignalBrand({ compact = false, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center font-extrabold text-[#285b9f] ${
        compact ? "gap-1.5 text-[11px]" : "gap-2 text-xs"
      } ${className}`}
    >
      <span className={`flex shrink-0 items-center justify-center rounded-full bg-[#3169b5] text-white ${compact ? "h-6 w-6 text-[9px]" : "h-6 w-6 text-[10px]"}`}>
        S
      </span>
      청대 시그널
    </span>
  );
}
