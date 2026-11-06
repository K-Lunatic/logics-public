"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { PenTool } from "lucide-react";
import { Card } from "@/components/ui";
import { Header } from "../components/layout/Header";
import { NavigationTab, TabType } from "../components/layout/NavigationTab";
import { InventorySection } from "@/features/inventory/InventorySection";
import { SmartFinance } from "@/features/finance/SmartFinance";
import { HealthDashboard } from "@/features/health/HealthDashboard";
import { MissedCarePrompt } from "@/features/health/MissedCarePrompt";
import { InkAuthButton } from "../components/auth/InkAuthButton";
import {
  useBlankDashboard,
  useUpdateItem,
  useDeleteItem,
  useConsumeItem,
} from "@ink/assembler";

import Home from "@/features/home/Home";
import { LivingItem } from "@ink/engine";
import TimeScheduleSection from "@/features/schedule/TimeScheduleSection";
import { ShareControlSection } from "@/features/sharing/ShareControlSection";

interface ExtendedSession {
  user?: { name?: string | null; email?: string | null; id?: string | null };
}

export default function DashboardContainer() {
  const { data: session, status } = useSession();
  const userId = (session as ExtendedSession | null)?.user?.id || "";

  const [activeTab, setActiveTab] = useState<TabType>("HOME");
  const [inventorySearch, setInventorySearch] = useState("");

  // 🚀 Pure Bone 통합 마스터 엔진 가동 (useDataStore 기반)
  const { isLoading, weather, foodList, curation } =
    useBlankDashboard();

  const { mutate: updateItem } = useUpdateItem();
  const { mutate: deleteItem } = useDeleteItem();
  const { mutate: consumeItem } = useConsumeItem();

  if (status === "loading" || isLoading) {
    return (
      <div className="fixed inset-0 z-[200] flex min-h-screen items-center justify-center overflow-hidden bg-stone-950 text-white">
        <div className="relative flex h-32 w-48 items-center justify-center" role="status" aria-label="로컬 데이터 여는 중">
          <span aria-hidden="true" className="ink-sync-halo absolute h-20 w-20 rounded-full bg-white/10" />
          <PenTool aria-hidden="true" className="ink-sync-pen relative z-10" size={32} strokeWidth={1.5} />
          <span aria-hidden="true" className="ink-sync-stroke absolute bottom-8 left-10 h-px w-28 origin-left bg-white/70" />
          <span className="sr-only">로컬 데이터를 여는 중입니다.</span>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#fafaf9,_#f5f5f4_45%,_#ffffff)] px-3 py-3 pb-28 font-sans text-stone-800 selection:bg-stone-200 lg:px-6 lg:py-6 lg:pb-8">
      <div className="mx-auto max-w-[1600px] lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6">
        <NavigationTab activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="min-w-0">
          <div className="mb-3 flex w-full items-center justify-between gap-2 px-1 lg:mb-5 lg:px-0">
          <div className="min-w-0 flex-1">
            <Header
              activeTab={activeTab}
              notificationCount={curation.expired.length + curation.expiringSoon.length}
              onSearch={(query) => {
                setInventorySearch(query);
                setActiveTab("INVENTORY");
              }}
            />
          </div>
          <div className="shrink-0 pl-1 md:pl-3">
            {session?.user?.email?.toLowerCase() === "user@example.com" && (
              <Link
                href="/admin/tools"
                className="mr-2 text-xs font-bold text-stone-500 hover:text-stone-900"
              >
                툴 관리
              </Link>
            )}
            <InkAuthButton />
          </div>
        </div>

        <div className="min-w-0 flex-1 animate-in fade-in duration-300">
          {!userId ? (
            <Card className="text-center py-20 border-dashed border-2 border-stone-200 shadow-sm mx-2 md:mx-0">
              <h2 className="text-xl font-bold text-stone-800 mb-2">
                당신의 삶의 여백, Blank.
              </h2>
              <p className="text-stone-500 mb-6 text-sm">
                구글 계정으로 로그인하여 하이브리드 OS 인프라를 활성화하세요.
              </p>
            </Card>
          ) : (
            <>
              {/* TAB 1: 홈 대시보드 */}
              {activeTab === "HOME" && (
                <Home
                  userId={userId}
                  weather={weather}
                  foodList={foodList}
                  curation={curation}
                  deleteItem={(id) => deleteItem(id)}
                  consumeItem={(id) =>
                    consumeItem({ id, source: "INVENTORY" })
                  }
                  onNavigate={setActiveTab}
                  updateItem={(vars) =>
                    updateItem({
                      id: vars.id,
                      updates: vars.updates as Partial<LivingItem>,
                    })
                  }
                />
              )}

              {/* TAB 2: 물품 인벤토리 */}
              {activeTab === "INVENTORY" && (
                <div className="animate-in slide-in-from-bottom-2 duration-300">
                  <InventorySection
                    key={inventorySearch}
                    searchQuery={inventorySearch}
                  />
                </div>
              )}

              {/* TAB 3: 루틴 플래너 */}
              {activeTab === "TIME" && (
                <div className="animate-in slide-in-from-bottom-2 duration-300">
                  <TimeScheduleSection />
                </div>
              )}

              {activeTab === "FINANCE" && <SmartFinance />}

              {activeTab === "HEALTH" && (
                <HealthDashboard />
              )}

              {activeTab === "SHARE" && <ShareControlSection />}
            </>
          )}
        </div>
        {userId && <MissedCarePrompt userId={userId} />}
        </div>
      </div>
    </main>
  );
}
