// shared/src/ui/SearchBar.tsx
import { InputHTMLAttributes } from "react";
import { InkIcon } from "./InkIcon";

export function SearchBar({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`relative ${className}`}>
      {/* 고양이 돋보기 아이콘 적용 */}
      <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-stone-400">
        <InkIcon type="search" size={18} />
      </span>
      <input
        type="text"
        className="w-full py-3 pl-11 pr-4 bg-stone-50 border border-stone-200 rounded-2xl text-sm 
                   focus:bg-white focus:border-stone-400 outline-none transition-all duration-300"
        placeholder="물품 이름, 태그, 위치 검색..."
        {...props}
      />
    </div>
  );
}
