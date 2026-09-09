import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...rest }, ref) => (
    <input
      ref={ref}
      {...rest}
      className={`min-h-12 w-full rounded-xl border border-[#d8e1eb] bg-white px-4 py-3 text-sm text-[#10233e] outline-none transition placeholder:text-[#9aa6b5] hover:border-[#bdc9d7] focus:border-[#15bfa9] focus:ring-4 focus:ring-[#15bfa9]/10 ${className}`}
    />
  )
);
Input.displayName = "Input";
