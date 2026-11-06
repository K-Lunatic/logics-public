"use client";

import { useEffect, useState } from "react";
import { listMealPlansAction } from "@ink/assembler";
import type { MealPlan } from "@ink/engine";

const todayString = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export function TodayMealWidget({ onOpen }: { onOpen: () => void }) {
  const [meals, setMeals] = useState<MealPlan[]>([]);

  useEffect(() => {
    const today = todayString();
    listMealPlansAction(today, today).then(setMeals).catch(() => setMeals([]));
  }, []);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 text-left shadow-sm transition-transform hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">Today&apos;s meal</p>
          <h3 className="mt-1 text-lg font-black text-stone-950">오늘의 식단</h3>
        </div>
        <span className="rounded-full bg-emerald-600 px-3 py-1 text-[10px] font-black text-white">상세 보기</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {meals.length === 0 ? (
          <p className="text-sm text-stone-500">아직 등록된 식단이 없습니다. 오늘 먹을 것을 정해보세요.</p>
        ) : meals.map((meal) => (
          <div key={meal.id} className="rounded-2xl bg-white/80 px-3 py-3">
            <p className="text-[10px] font-black text-emerald-700">
              {meal.mealType === "BREAKFAST" ? "아침" : meal.mealType === "LUNCH" ? "점심" : meal.mealType === "DINNER" ? "저녁" : "간식"}
            </p>
            <p className="truncate text-sm font-black text-stone-900">{meal.title}</p>
            <p className="mt-0.5 text-[10px] text-stone-500">
              {meal.sourceType === "HOME" ? "직접 조리" : meal.restaurantName || (meal.sourceType === "DELIVERY" ? "배달" : "식당")}
            </p>
            <p className="mt-1 text-[10px] font-bold text-stone-600">
              {meal.nutrition.calories}kcal · 탄 {meal.nutrition.carbohydrate} · 단 {meal.nutrition.protein} · 지 {meal.nutrition.fat}g
            </p>
          </div>
        ))}
      </div>
    </button>
  );
}
