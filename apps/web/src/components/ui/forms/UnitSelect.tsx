import { SelectHTMLAttributes } from "react";

interface UnitSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export function UnitSelect({ label, className = "", ...props }: UnitSelectProps) {
  // @shared/logic에서 정의한 단위들
  const units = ["개", "알", "포", "g", "kg", "ml", "L", "장", "박스", "권"];

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label className="text-sm font-bold text-gray-700">{label}</label>}
      <select
        className="w-full border border-gray-300 p-3 rounded-xl bg-white font-bold text-center outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        {...props}
      >
        {units.map((u) => (
          <option key={u} value={u}>{u}</option>
        ))}
      </select>
    </div>
  );
}
