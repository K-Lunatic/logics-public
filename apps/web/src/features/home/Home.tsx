"use client";

import { useState } from "react";
import Image from "next/image";
import { WeatherWidget } from "./WeatherWidget";
import { UrgentTodoWidget } from "./UrgentTodoWidget";
import { RescueChefCard } from "./RescueChefCard";
import { Button, Badge, Card } from "@/components/ui";
import { WeatherSnapshot } from "@ink/engine";
import { LivingItem } from "@ink/engine";
import type { TabType } from "@/components/layout/NavigationTab";
import { TodayMealWidget } from "./TodayMealWidget";


export interface DashboardCuration {
  expired: LivingItem[];
  expiringSoon: LivingItem[];
  recommendedOOTD: LivingItem[];
}

// =========================================================================
// 📸 1. 초경량 독립 썸네일 검증기
// =========================================================================
function MiniImageThumbnail({ src, alt }: { src?: string | null; alt: string }) {
  const [imgError, setImgError] = useState(false);

  if (!src || imgError) {
    return (
      <div className="relative w-10 h-10 rounded-xl bg-stone-100 border border-stone-200/40 flex items-center justify-center shrink-0 text-lg shadow-3xs">
        📦
      </div>
    );
  }

  return (
    <div className="relative w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-stone-200/60 bg-stone-50 shadow-3xs">
      <Image
        src={src}
        alt={alt}
        fill
        unoptimized 
        className="object-cover"
        onError={() => setImgError(true)}
      />
    </div>
  );
}

// =========================================================================
// 🔘 2. 타입 세이프 안전한 공통 버튼 래퍼
// =========================================================================
// 💡 [TS 2430 & TS 2322 해결]: SafeButtonProps의 variant를 하위 Button 컴포넌트가 지닌 
// strict union 규격과 완벽하게 일치시켜 대입 거절 문제를 완전히 무산시켰다냥!
interface SafeButtonProps extends React.ComponentPropsWithoutRef<typeof Button> {
  label?: string;
  variant?: React.ComponentPropsWithoutRef<typeof Button>["variant"];
}

function SafeButton({ label, children, variant, ...props }: SafeButtonProps) {
  return (
    <Button variant={variant} {...props}>
      {label || children}
    </Button>
  );
}

// =========================================================================
// 🏠 3. 메인 홈 대시보드 컴포넌트
// =========================================================================
interface HomeProps {
  userId: string;
  weather: WeatherSnapshot | null;
  foodList: LivingItem[];
  curation: DashboardCuration;
  deleteItem: (params: { id: string; userId: string }) => void;
  updateItem: (params: { id: string; userId: string; updates: Partial<LivingItem> }) => void;
  consumeItem: (id: string) => void;
  onNavigate: (tab: TabType) => void;
}

export default function Home({
  userId,
  weather,
  foodList,
  curation,
  deleteItem,
  updateItem,
  consumeItem,
  onNavigate,
}: HomeProps) {
  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-stone-400">Today at a glance</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-950 sm:text-3xl">
            오늘도 가볍게 정리해요.
          </h2>
        </div>
        <div className="flex gap-2 text-xs font-bold">
          <span className="rounded-full bg-white px-3 py-2 text-stone-600 shadow-sm">식품 {foodList.length}</span>
          <span className="rounded-full bg-orange-100 px-3 py-2 text-orange-700">확인 {curation.expiringSoon.length}</span>
        </div>
      </section>

      <nav aria-label="빠른 작업" className="grid grid-cols-3 gap-2">
        {[
          { tab: "INVENTORY" as const, icon: "＋", label: "물품 등록" },
          { tab: "TIME" as const, icon: "✓", label: "일정 확인" },
          { tab: "FINANCE" as const, icon: "₩", label: "지출 기록" },
        ].map((action) => (
          <button
            key={action.tab}
            type="button"
            onClick={() => onNavigate(action.tab)}
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-stone-200/70 bg-white px-2 text-xs font-black text-stone-700 shadow-sm transition-colors hover:bg-stone-50 sm:text-sm"
          >
            <span className="text-base" aria-hidden="true">{action.icon}</span>
            {action.label}
          </button>
        ))}
      </nav>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
        <WeatherWidget weather={weather} />
        <div>
          <UrgentTodoWidget
            todos={
              curation.expiringSoon.length > 0
                ? curation.expiringSoon.map((e: LivingItem) => ({
                    id: e.id,
                    text: `${e.name} 소비 기한 임박`,
                    tag: "임박",
                    urgent: true,
                  }))
                : [{ text: "긴급하게 확인할 항목이 없어요.", tag: "안전", urgent: false }]
            }
          />
        </div>
      </div>

      <RescueChefCard />
      <TodayMealWidget onOpen={() => onNavigate("TIME")} />

      {(curation.expired.length > 0 || curation.expiringSoon.length > 0) && (
          <Card className="border-red-200 bg-red-50/50 shadow-sm">
            <h3 className="text-base font-bold text-red-800 mb-4 flex items-center gap-2">
              <span>⚠️</span> 자산 보호 유통기한 긴급 알림
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 1) 폐기 요망 장부 트랙 */}
              {curation.expired.map((item: LivingItem) => (
                <div
                  key={item.id}
                  className="bg-white p-3.5 rounded-2xl border border-red-200 flex justify-between items-center shadow-3xs hover:shadow-2xs transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <MiniImageThumbnail src={item.imageUrl} alt={item.name} />
                    <div className="min-w-0">
                      <Badge variant="danger">폐기 요망</Badge>
                      <p className="font-bold text-stone-800 mt-1 truncate text-sm">{item.name}</p>
                    </div>
                  </div>
                  <SafeButton
                    variant="danger"
                    size="sm"
                    className="shrink-0"
                    onClick={() => deleteItem({ id: item.id, userId })}
                  >
                    버리기
                  </SafeButton>
                </div>
              ))}

              {/* 2) 우선 소비 장부 트랙 */}
              {curation.expiringSoon.map((item: LivingItem) => (
                <div
                  key={item.id}
                  className="bg-white p-3.5 rounded-2xl border border-orange-200 flex justify-between items-center shadow-3xs hover:shadow-2xs transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <MiniImageThumbnail src={item.imageUrl} alt={item.name} />
                    <div className="min-w-0">
                      <Badge className="bg-orange-500 text-white border-transparent text-[10px]">
                        우선 소비
                      </Badge>
                      <p className="font-bold text-stone-800 mt-1 truncate text-sm">{item.name}</p>
                      <span className="text-[10px] text-orange-600 font-bold block mt-0.5">
                        잔여 수량: {item.quantity}{item.unit || "개"}
                      </span>
                    </div>
                  </div>
                  <SafeButton
                    size="sm"
                    className="bg-orange-500 hover:bg-orange-600 text-white shrink-0 text-xs font-bold"
                    onClick={() => consumeItem(item.id)}
                    label="1 소모"
                  />
                </div>
              ))}
            </div>
          </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card
            title={
              weather
                ? `☀️ 체감 ${weather.feelsLike}°C 코디 제안`
                : "☀️ 옷차림 추천 대기 중"
            }
          >
            {curation.recommendedOOTD.length === 0 ? (
              <p className="text-sm text-stone-400">
                적절한 추천 의류가 없습니다.
              </p>
            ) : (
              <div className="space-y-3 mt-4">
                {curation.recommendedOOTD.map((cloth: LivingItem) => (
                  <div
                    key={cloth.id}
                    className="flex justify-between items-center bg-stone-50 p-3.5 rounded-2xl border border-stone-100/60 shadow-3xs hover:bg-white hover:shadow-2xs transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <MiniImageThumbnail src={cloth.imageUrl} alt={cloth.name} />
                      <strong className="text-stone-800 text-sm font-semibold truncate">
                        {cloth.name}
                      </strong>
                    </div>
                    <SafeButton
                      size="sm"
                      className="bg-stone-200 hover:bg-stone-300 text-stone-800 border-none shadow-none text-xs font-bold shrink-0"
                      onClick={() =>
                        updateItem({
                          id: cloth.id,
                          userId,
                          updates: { isDirty: true }, // clothesItemSchema 스펙 반영
                        })
                      }
                    >
                      today worn
                    </SafeButton>
                  </div>
                ))}
              </div>
            )}
          </Card>
      </div>
    </div>
  );
}
