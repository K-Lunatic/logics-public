import { WEATHER_GRID_DATA } from "./weather-grid.generated.ts";

export interface WeatherGrid {
  location: string;
  nx: number;
  ny: number;
}

const CITY_ALIASES: Record<string, string> = {
  seoul: "서울특별시",
  busan: "부산광역시",
  daegu: "대구광역시",
  incheon: "인천광역시",
  gwangju: "광주광역시",
  daejeon: "대전광역시",
  ulsan: "울산광역시",
  sejong: "세종특별자치시",
  jeju: "제주특별자치도",
};

const WEATHER_GRIDS: WeatherGrid[] = WEATHER_GRID_DATA.split("\n").filter(Boolean).map((row) => {
  const [location, nx, ny] = row.split("\t");
  return { location, nx: Number(nx), ny: Number(ny) };
});

export function normalizeWeatherLocation(location: string): string {
  const trimmed = location.trim().replace(/\s+/g, " ");
  return CITY_ALIASES[trimmed.toLowerCase()] || trimmed;
}

export function findWeatherGrid(location: string): WeatherGrid | undefined {
  const normalized = normalizeWeatherLocation(location);
  const exact = WEATHER_GRIDS.find((item) => item.location === normalized);
  if (exact) return exact;

  const parent = WEATHER_GRIDS
    .filter((item) => normalized.includes(item.location))
    .sort((left, right) => right.location.length - left.location.length)[0];
  if (parent) return parent;

  const candidates = WEATHER_GRIDS
    .filter((item) => item.location.includes(normalized))
    .sort((left, right) => left.location.length - right.location.length);
  const shortest = candidates[0]?.location.length;
  const closest = candidates.filter((item) => item.location.length === shortest);
  return closest.length === 1 ? closest[0] : undefined;
}

export function searchWeatherLocations(query: string, limit = 8): string[] {
  const normalized = normalizeWeatherLocation(query);
  if (!normalized) return [];
  return WEATHER_GRIDS
    .filter((item) => item.location.includes(normalized))
    .slice(0, Math.max(1, Math.min(limit, 20)))
    .map((item) => item.location);
}
