"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getFinanceBookAction,
  listMealPlansAction,
  useTimeTreeCalendar,
} from "@ink/assembler";
import type { FinanceTransaction, MealPlan } from "@ink/engine";
import {
  CalendarHeader,
  CalendarLeftGrid,
  CalendarRightPanel,
} from "./component";
import {
  DayOverviewPanel,
  MealRangeView,
  type CalendarLayer,
  type MealPeriod,
} from "./LifeCalendarPanels";

const LAYERS: Array<{ id: CalendarLayer; label: string }> = [
  { id: "ALL", label: "전체" },
  { id: "SCHEDULE", label: "일정" },
  { id: "FINANCE", label: "재무" },
  { id: "MEAL", label: "식단" },
];

const PERIODS: Array<{ id: MealPeriod; label: string }> = [
  { id: "MONTH", label: "1개월" },
  { id: "TWO_WEEKS", label: "2주" },
  { id: "WEEK", label: "1주" },
  { id: "DAY", label: "하루" },
];

export default function TimeScheduleSection() {
  const c = useTimeTreeCalendar();
  const [layer, setLayer] = useState<CalendarLayer>("ALL");
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>("MONTH");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [meals, setMeals] = useState<MealPlan[]>([]);
  const [loadingLayers, setLoadingLayers] = useState(false);

  const month = `${c.currentYear}-${String(c.currentMonth).padStart(2, "0")}`;
  const rangeStart = c.calendarWeeks[0]?.[0]?.dateStr || `${month}-01`;
  const lastWeek = c.calendarWeeks.at(-1);
  const rangeEnd = lastWeek?.at(-1)?.dateStr || `${month}-31`;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getFinanceBookAction(month),
      listMealPlansAction(rangeStart, rangeEnd),
    ]).then(([book, mealPlans]) => {
      if (cancelled) return;
      setTransactions(book.transactions);
      setMeals(mealPlans);
    }).catch((error) => {
      console.error("캘린더 레이어를 불러오지 못했습니다.", error);
    }).finally(() => {
      if (!cancelled) setLoadingLayers(false);
    });
    return () => {
      cancelled = true;
    };
  }, [month, rangeEnd, rangeStart]);

  const markers = useMemo(() => {
    const result: Record<string, Array<{ color: string; label: string }>> = {};
    const add = (date: string, marker: { color: string; label: string }) => {
      result[date] = [...(result[date] || []), marker];
    };
    if (layer === "ALL" || layer === "FINANCE") {
      transactions.forEach((item) => add(item.date, { color: "bg-amber-500", label: "재무" }));
    }
    if (layer === "ALL" || layer === "MEAL") {
      meals.forEach((item) => add(item.date, { color: "bg-emerald-500", label: "식단" }));
    }
    return result;
  }, [layer, meals, transactions]);

  const daySchedules = c.getEventsForDate(c.selectedDate);
  const dayTransactions = transactions.filter((item) => item.date === c.selectedDate);
  const dayMeals = meals.filter((item) => item.date === c.selectedDate);
  const showSchedulePanel = layer === "SCHEDULE" || c.panelMode === "EDIT";
  const updateMeals = (meal?: MealPlan, deletedId?: string) => {
    setMeals((current) => {
      if (deletedId) return current.filter((item) => item.id !== deletedId);
      if (!meal) return current;
      return [...current.filter((item) => item.id !== meal.id), meal]
        .sort((left, right) => left.date.localeCompare(right.date));
    });
  };
  const dayPanel = showSchedulePanel ? (
    <CalendarRightPanel c={c} compact={mobilePanelOpen} />
  ) : (
    <DayOverviewPanel
      date={c.selectedDate}
      layer={layer}
      schedules={daySchedules}
      transactions={dayTransactions}
      meals={dayMeals}
      onAddSchedule={() => c.handleDateDoubleClick(c.selectedDate)}
      onEditSchedule={c.triggerEditMode}
      onMealsChanged={updateMeals}
    />
  );

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-3xl border border-stone-200/60 bg-white shadow-sm">
      <CalendarHeader c={c} />
      <div className="flex flex-col gap-2 border-b border-stone-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="캘린더 표시 항목" className="flex rounded-xl bg-stone-100 p-1">
          {LAYERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setLayer(item.id);
                c.setRightPanelMode("VIEW");
              }}
              aria-pressed={layer === item.id}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-black sm:flex-none ${
                layer === item.id ? "bg-white text-stone-950 shadow-sm" : "text-stone-500"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {layer === "MEAL" && (
          <nav aria-label="식단 조회 기간" className="flex gap-1 overflow-x-auto">
            {PERIODS.map((period) => (
              <button
                key={period.id}
                type="button"
                onClick={() => setMealPeriod(period.id)}
                aria-pressed={mealPeriod === period.id}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black ${
                  mealPeriod === period.id ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {period.label}
              </button>
            ))}
          </nav>
        )}
      </div>
      {loadingLayers && (
        <div className="h-1 animate-pulse bg-stone-200" aria-label="캘린더 데이터 동기화 중" />
      )}

      <div className="min-h-[560px] flex-1 xl:hidden">
        {layer === "MEAL" && mealPeriod !== "MONTH" ? (
          <MealRangeView
            selectedDate={c.selectedDate}
            period={mealPeriod}
            meals={meals}
            onSelectDate={(date) => {
              c.setSelectedDate(date);
              setMobilePanelOpen(true);
            }}
          />
        ) : (
          <CalendarLeftGrid
            c={c}
            dayMarkers={markers}
            showScheduleEvents={layer === "ALL" || layer === "SCHEDULE"}
            onOpenMobilePanel={() => setMobilePanelOpen(true)}
          />
        )}
      </div>

      <div className="hidden h-[calc(100dvh-12rem)] min-h-[640px] max-h-[780px] flex-1 grid-cols-[minmax(0,2fr)_minmax(340px,1fr)] divide-x divide-stone-200/60 xl:grid">
        {layer === "MEAL" && mealPeriod !== "MONTH" ? (
          <MealRangeView
            selectedDate={c.selectedDate}
            period={mealPeriod}
            meals={meals}
            onSelectDate={c.setSelectedDate}
          />
        ) : (
          <CalendarLeftGrid
            c={c}
            dayMarkers={markers}
            showScheduleEvents={layer === "ALL" || layer === "SCHEDULE"}
          />
        )}
        {dayPanel}
      </div>

      {mobilePanelOpen && (
        <div className="fixed inset-0 z-[90] flex items-end bg-stone-950/40 backdrop-blur-sm xl:hidden">
          <button type="button" aria-label="날짜 상세 닫기" className="absolute inset-0" onClick={() => setMobilePanelOpen(false)} />
          <section role="dialog" aria-modal="true" aria-label={`${c.selectedDate} 상세`} className="relative z-10 h-[88dvh] w-full overflow-hidden rounded-t-[30px] bg-white shadow-2xl">
            <button
              type="button"
              aria-label="닫기"
              onClick={() => setMobilePanelOpen(false)}
              className="absolute right-4 top-3 z-20 rounded-xl bg-stone-100 px-3 py-2 text-xs font-black text-stone-600"
            >
              닫기
            </button>
            {dayPanel}
          </section>
        </div>
      )}
    </div>
  );
}
