"use client";

import { useState } from "react";
import { SearchBar } from "@/components/ui";
import { useInkChatSettings } from "@/context/InkChatSettingsProvider";
import type { TabType } from "./NavigationTab";

interface HeaderProps {
  activeTab: TabType;
  notificationCount?: number;
  onSearch: (query: string) => void;
}

const TITLES: Record<TabType, string> = {
  HOME: "오늘",
  INVENTORY: "물품 & 공간",
  TIME: "캘린더",
  FINANCE: "재무",
  HEALTH: "건강",
  SHARE: "공유",
};

export function Header({ activeTab, notificationCount = 0, onSearch }: HeaderProps) {
  const { setIsSettingsOpen } = useInkChatSettings();
  const [query, setQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header className="relative flex items-center justify-between gap-3 py-2 lg:border-b lg:border-gray-200 lg:py-4">
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-stone-400 lg:hidden">Blank</p>
        <h1 className="truncate text-xl font-black tracking-tight text-gray-900 sm:text-2xl">
          {TITLES[activeTab]}
        </h1>
        <p className="mt-0.5 hidden text-sm font-medium text-gray-500 lg:block">
          필요한 정보와 행동을 한곳에서 확인하세요.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSearch(query);
          }}
          className="hidden lg:block"
        >
          <SearchBar
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-64"
          />
        </form>
        <button
          type="button"
          onClick={() => setShowNotifications((open) => !open)}
          aria-label={`알림 보기${notificationCount ? `, ${notificationCount}개` : ""}`}
          aria-expanded={showNotifications}
          className="relative rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100"
        >
          <span className="text-xl">🔔</span>
          {notificationCount > 0 && (
            <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
              {notificationCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          aria-label="환경설정 열기"
          className="rounded-xl p-2 text-xl text-gray-500 transition-colors hover:bg-gray-100"
        >
          ⚙️
        </button>
      </div>

      {showNotifications && (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-2xl border border-stone-200 bg-white p-4 shadow-xl">
          <h2 className="text-sm font-black text-stone-800">알림</h2>
          <p className="mt-2 text-sm text-stone-500">
            {notificationCount > 0
              ? `확인이 필요한 유통기한 항목이 ${notificationCount}개 있습니다.`
              : "새로운 알림이 없습니다."}
          </p>
        </div>
      )}
    </header>
  );
}
