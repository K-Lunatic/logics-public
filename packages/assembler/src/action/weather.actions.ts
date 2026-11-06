// 📂 packages/assembler/src/action/weather.actions.ts
"use server";

import {
  getWeatherByUserLocation,
  searchWeatherLocations,
  userProfileSchema,
  WeatherQuery,
  WeatherSnapshot,
} from "@ink/engine";

// 🚀 [Pure Bone] 표준 데이터 어댑터 및 인증 단자 수입!
import { dbRemote } from "../adapters/dataStore";
import { getSecureUserIdOrThrow } from "../lib/authGuard";
import { getPersonalSecretForUser } from "../lib/userSecrets";

/**
 * 🌤️ [지능형 날씨 통합 관제 액션]
 * 외부 날씨 API를 타격하고, 그 결과를 즉시 유저의 dbRemote 스토어에 동기화합니다냥.
 */
export async function runServerWeatherSync(userLocationName: string, query: WeatherQuery = {}) {
  const secureId = await getSecureUserIdOrThrow();
  const apiKey =
    (await getPersonalSecretForUser(secureId, "weatherApiKey")) ||
    process.env.WEATHER_API_KEY;

  try {
    // 1. 순수 도메인 엔진을 통한 날씨 데이터 인출
    const snapshot = await getWeatherByUserLocation(userLocationName, apiKey || "", query);

    // 2. 🚀 [Pure Bone Enhancement] 세션 감지 후 dbRemote 캐시 장부에 즉시 적재
    try {
      await dbRemote.set(
        `users/${secureId}/weather/master_document`,
        snapshot,
      );
    } catch (sessionError) {
      console.warn("⚠️ 날씨 장부 적재 중 세션 확보 실패 (게스트 모드 처리)");
    }

    return { success: true as const, data: snapshot };
  } catch (error) {
    console.error("🚨 [Weather Action] 날씨 동기화 네트워크 실패:", error);
    return { success: false as const, data: null };
  }
}

/**
 * ☁️ [useDataStore 무인자 페처 전용 액션]
 * useBlankDashboard 훅 등에서 표준 fetcher로 직접 수입하여 호출합니다냥!
 */
export async function getWeatherAction(): Promise<WeatherSnapshot | null> {
  try {
    const secureId = await getSecureUserIdOrThrow();

    const [cached, profileValue] = await Promise.all([
      dbRemote.get<WeatherSnapshot>(`users/${secureId}/weather/master_document`),
      dbRemote.get<unknown>(`users/${secureId}/profile/master_document`),
    ]);
    const profile = userProfileSchema.safeParse(profileValue);
    const location = profile.success ? profile.data.region : "서울특별시";
    if (
      cached?.hourly?.length &&
      cached.location === location &&
      Date.now() - new Date(cached.updatedAt).getTime() < 30 * 60 * 1000
    ) {
      return cached;
    }

    // 2. 캐시가 없는 경우 저장된 사용자 지역으로 동기화
    const syncResult = await runServerWeatherSync(location);
    return syncResult.data;
  } catch (error) {
    console.error("🚨 [getWeatherAction] 날씨 인출 실패:", error);
    return null;
  }
}

export async function searchWeatherLocationsAction(query: string) {
  await getSecureUserIdOrThrow();
  return searchWeatherLocations(query);
}
