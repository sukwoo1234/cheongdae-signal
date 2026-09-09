import { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}

export function Button({ variant = "primary", className = "", ...rest }: Props) {
  const variants = {
    primary: "bg-[#071b33] hover:bg-[#102b4a] text-white shadow-[0_8px_24px_rgba(7,27,51,0.16)]",
    secondary: "border border-[#d8e1eb] bg-white hover:bg-[#f7f9fc] text-[#203149]",
    danger: "bg-[#dc3545] hover:bg-[#c62d3c] text-white shadow-[0_8px_20px_rgba(220,53,69,0.18)]",
    ghost: "bg-transparent hover:bg-black/[0.04] text-[#526176]",
  };
  return (
    <button
      {...rest}
      className={`min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15bfa9] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${className}`}
    />
  );
}
