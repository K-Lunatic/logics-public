"use client";

import { useState } from "react";

export type TabType =
  | "HOME"
  | "INVENTORY"
  | "TIME"
  | "FINANCE"
  | "HEALTH"
  | "SHARE";

interface NavigationTabProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const TABS: {
  id: TabType;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
}[] = [
  { id: "HOME", label: "홈", shortLabel: "홈", description: "오늘 한눈에", icon: "🏠" },
  { id: "INVENTORY", label: "물품 & 공간", shortLabel: "물품", description: "찾고 기록하기", icon: "📦" },
  { id: "TIME", label: "캘린더", shortLabel: "일정", description: "계획하고 실행하기", icon: "⏳" },
  { id: "FINANCE", label: "재무", shortLabel: "재무", description: "지출과 자산 보기", icon: "💳" },
  { id: "HEALTH", label: "건강", shortLabel: "건강", description: "복용과 건강 기록", icon: "💊" },
  { id: "SHARE", label: "공유", shortLabel: "공유", description: "공개 범위 관리", icon: "👥" },
];

const MOBILE_TABS = TABS.slice(0, 4);
const MORE_TABS = TABS.slice(4);

export function NavigationTab({ activeTab, onTabChange }: NavigationTabProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const isMoreActive = MORE_TABS.some(({ id }) => id === activeTab);

  const selectTab = (tab: TabType) => {
    onTabChange(tab);
    setIsMoreOpen(false);
  };

  return (
    <>
      <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] flex-col rounded-[28px] bg-stone-950 p-3 text-white shadow-xl lg:flex">
        <div className="px-3 pb-7 pt-4">
          <p className="text-xl font-black tracking-tight">Blank</p>
          <p className="mt-1 text-xs font-medium text-stone-400">일상을 가볍게 정리해요.</p>
        </div>
        <nav aria-label="주요 기능" className="space-y-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors ${
                  isActive
                    ? "bg-white text-stone-950"
                    : "text-stone-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="text-xl" aria-hidden="true">{tab.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-black">{tab.label}</span>
                  <span className={`block truncate text-[11px] ${isActive ? "text-stone-500" : "text-stone-500"}`}>
                    {tab.description}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      {isMoreOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-stone-950/20 backdrop-blur-[2px] lg:hidden"
            onClick={() => setIsMoreOpen(false)}
            aria-label="더보기 닫기"
          />
          <div className="fixed inset-x-3 bottom-24 z-50 grid grid-cols-2 gap-2 rounded-3xl border border-white/80 bg-white p-3 shadow-2xl lg:hidden">
            {MORE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                className="flex min-h-20 items-center gap-3 rounded-2xl bg-stone-50 px-4 text-left"
              >
                <span className="text-2xl" aria-hidden="true">{tab.icon}</span>
                <span>
                  <span className="block text-sm font-black text-stone-900">{tab.label}</span>
                  <span className="block text-[11px] text-stone-500">{tab.description}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <nav
        aria-label="주요 기능"
        className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 gap-1 rounded-[22px] border border-white/80 bg-stone-950/95 p-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl lg:hidden"
      >
        {MOBILE_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-[10px] font-bold ${
                isActive ? "bg-white text-stone-950" : "text-stone-400"
              }`}
            >
              <span className="text-lg leading-none" aria-hidden="true">{tab.icon}</span>
              <span className="max-w-full truncate">{tab.shortLabel}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setIsMoreOpen((open) => !open)}
          aria-expanded={isMoreOpen}
          className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-[10px] font-bold ${
            isMoreActive || isMoreOpen ? "bg-white text-stone-950" : "text-stone-400"
          }`}
        >
          <span className="text-lg leading-none" aria-hidden="true">•••</span>
          <span>더보기</span>
        </button>
      </nav>
    </>
  );
}
