"use client";

import { Footprints, Moon, Cat, AlertCircle, Search } from 'lucide-react';

export type IconType = 'paw' | 'sleep' | 'face' | 'ears' | 'search';

export function InkIcon({ type, className = "", size = 20 }: { type: IconType; className?: string; size?: number }) {
  const icons: Record<IconType, React.ElementType> = {
    paw: Footprints,
    sleep: Moon,
    face: Cat,
    ears: AlertCircle,
    search: Search
  };

  const IconComponent = icons[type];
  // 우리 시스템의 메인 컬러인 stone-700을 기본으로 적용
  return <IconComponent size={size} className={`text-stone-700 ${className}`} />;
}
