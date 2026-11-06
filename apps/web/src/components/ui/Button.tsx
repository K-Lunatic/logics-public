import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function Button({ children, variant = "primary", size = "md", className = "", ...props }: ButtonProps) {
  const baseStyle = "inline-flex items-center justify-center font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-gray-900 text-white hover:bg-gray-800 shadow-md",
    secondary: "bg-gray-100 text-gray-800 hover:bg-gray-200",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-100",
    ghost: "bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-6 py-3 text-base w-full",
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}
