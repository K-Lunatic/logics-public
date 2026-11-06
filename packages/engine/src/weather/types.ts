// packages/types/weather.ts

export type WeatherCondition = "SUNNY" | "CLOUDY" | "RAIN" | "SNOW";

export interface WeatherHour {
  forecastAt: string;
  temp: number;
  feelsLike: number;
  humidity: number;
  precipitationProbability: number;
  condition: WeatherCondition;
}

export interface WeatherSnapshot {
  temp: number; // 현재/내일 기온 (Celsius)
  feelsLike: number; // 체감 온도 (Celsius)
  condition: WeatherCondition; // 날씨 상태
  humidity: number; // 습도 (%)
  location: string;
  forecastAt?: string; // 실제 예보 대상 시각
  precipitationProbability?: number; // 강수확률 (%)
  hourly?: WeatherHour[]; // 조회 시각부터 1시간 단위 예보
  updatedAt: string; // 날씨 데이터 갱신 시각 (ISO String)
}
