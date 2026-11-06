import { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, className = "", ...props }: InputProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-sm font-bold text-gray-700">{label}</label>
      <input
        className={`w-full border p-3 rounded-xl outline-none transition-all focus:ring-2 
          ${error ? "border-red-500 focus:ring-red-200 bg-red-50" : "border-gray-300 focus:border-blue-500 focus:ring-blue-100"}`}
        {...props}
      />
      {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
    </div>
  );
}
