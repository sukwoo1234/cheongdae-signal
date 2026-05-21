import { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
}

export function Button({ variant = "primary", className = "", ...rest }: Props) {
  const variants = {
    primary: "bg-gray-900 hover:bg-gray-800 text-white",
    secondary: "bg-gray-200 hover:bg-gray-300 text-gray-800",
    danger: "bg-red-500 hover:bg-red-600 text-white",
  };
  return (
    <button
      {...rest}
      className={`px-4 py-2 rounded-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition ${variants[variant]} ${className}`}
    />
  );
}
