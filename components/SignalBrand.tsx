interface Props {
  compact?: boolean;
  className?: string;
}

export function SignalBrand({ compact = false, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-white/85 bg-white/70 font-extrabold text-[#285b9f] shadow-sm backdrop-blur-md ${
        compact ? "gap-1.5 px-2.5 py-1.5 text-[11px]" : "gap-2 px-4 py-2 text-xs"
      } ${className}`}
    >
      <span className={`flex shrink-0 items-center justify-center rounded-full bg-[#3169b5] text-white ${compact ? "h-6 w-6 text-[9px]" : "h-6 w-6 text-[10px]"}`}>
        S
      </span>
      청대 시그널
    </span>
  );
}
