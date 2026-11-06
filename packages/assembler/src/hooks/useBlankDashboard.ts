// 📂 packages/assembler/src/hooks/useBlankDashboard.ts
"use client";

import { useMemo } from "react";
// 🚀 표준 어댑터 훅과 @ink/engine 도메인 엔진 함수 수입
import { useDataStore } from "./useDataStore";
import {
  WeatherSnapshot,
  getClothesCuration,
  getExpirationCuration,
  ClothesItem,
  LivingItem,
} from "@ink/engine";
// 🔐 서버 액션 수입
import { listInventoryAction } from "../action/inventory.action";
import { getWeatherAction } from "../action/weather.actions";

export interface DashboardCuration {
  recommendedOOTD: LivingItem[];
  laundryAlerts: LivingItem[];
  expired: LivingItem[];
  expiringSoon: LivingItem[];
  openedTooLong: LivingItem[];
}

export interface DashboardEngineResult {
  isLoading: boolean;
  items: LivingItem[];
  weather: WeatherSnapshot | null;
  foodList: LivingItem[];
  medicineList: LivingItem[];
  clothesList: LivingItem[];
  curation: DashboardCuration;
}

/**
 * 📊 [대시보드 통합 마스터 훅]
 * 클라이언트 단의 userId/경로 조립을 도려내고,
 * 표준 useDataStore 및 서버 액션과 안전하게 연결합니다냥!
 */
export function useBlankDashboard(): DashboardEngineResult {
  // 📦 1. 표준 인벤토리 데이터 스토어 구독 (서버 액션 전동)
  const { data: rawItems, loading: isInventoryLoading } = useDataStore<LivingItem[]>({
    key: "inventory",
    fetcher: listInventoryAction,
  });

  // 🛡️ [0ms 철통 방어 메모이제이션]
  // rawItems가 null/undefined이거나 { list: [...] } 형태의 객체로 넘어오더라도
  // items가 무조건 '순수 JavaScript 배열'임을 보장합니다냥!
  const items = useMemo<LivingItem[]>(() => {
    if (Array.isArray(rawItems)) {
      return rawItems;
    }
    if (
      rawItems &&
      typeof rawItems === "object" &&
      "list" in rawItems &&
      Array.isArray((rawItems as { list: unknown }).list)
    ) {
      return (rawItems as { list: LivingItem[] }).list;
    }
    return [];
  }, [rawItems]);

  // ☁️ 2. 실시간 날씨 데이터 스토어 구독 (서버 액션 전동)
  const { data: weather = null, loading: isWeatherLoading } = useDataStore<WeatherSnapshot | null>({
    key: "weather",
    fetcher: getWeatherAction,
  });

  const isLoading = isInventoryLoading || isWeatherLoading;

  // 3. domainType 기준 정밀 도메인 분류 메모이제이션 (FOOD, MEDICINE, CLOTHES)
  const foodList = useMemo(
    () => items.filter((item): item is LivingItem => item?.domainType === "FOOD"),
    [items]
  );

  const medicineList = useMemo(
    () => items.filter((item): item is LivingItem => item?.domainType === "MEDICINE"),
    [items]
  );

  const clothesList = useMemo(
    () => items.filter((item): item is ClothesItem => item?.domainType === "CLOTHES"),
    [items]
  );

  // 4. @ink/engine Pure 계산 엔진 기반 종합 큐레이션 실시간 연산
  const curation = useMemo<DashboardCuration>(() => {
    const clothesCuration = weather
      ? getClothesCuration(clothesList, weather)
      : { recommendedOOTD: [], laundryAlerts: [] };

    const expirationData = getExpirationCuration(items);

    return {
      recommendedOOTD: clothesCuration.recommendedOOTD || [],
      laundryAlerts: clothesCuration.laundryAlerts || [],
      expired: expirationData.expired || [],
      expiringSoon: expirationData.expiringSoon || [],
      openedTooLong: expirationData.openedTooLong || [],
    };
  }, [items, clothesList, weather]);

  return {
    isLoading,
    items,
    weather,
    foodList,
    medicineList,
    clothesList,
    curation,
  };
}
