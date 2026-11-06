import { WeatherHour, WeatherSnapshot } from "./";
import {
  findWeatherGrid,
  normalizeWeatherLocation,
} from "./grid";

export interface WeatherQuery {
  date?: string;
  time?: string;
}

interface ForecastItem {
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
}

function koreaDate(offsetDays = 0): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 86_400_000);
}

function formatDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
}

function getKmaBaseDateTime() {
  const now = koreaDate();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes() - 10;
  const cycles = [2, 5, 8, 11, 14, 17, 20, 23];
  const hour = [...cycles].reverse().find((cycle) => cycle * 60 <= minutes);

  if (hour !== undefined) {
    return { base_date: formatDate(now), base_time: `${String(hour).padStart(2, "0")}00` };
  }

  return { base_date: formatDate(koreaDate(-1)), base_time: "2300" };
}

function requestedForecast(query: WeatherQuery): { date: string; time: string } {
  const now = koreaDate();
  const date = query.date?.replaceAll("-", "") || formatDate(now);
  const time = query.time?.replace(":", "") || `${String(now.getUTCHours()).padStart(2, "0")}00`;

  if (!/^\d{8}$/.test(date) || !/^(?:[01]\d|2[0-3])[0-5]\d$/.test(time)) {
    throw new Error("WEATHER_INVALID_DATE_TIME");
  }

  return { date, time };
}

function selectForecast(items: ForecastItem[], query: WeatherQuery): ForecastItem[] {
  const target = requestedForecast(query);
  const times = [...new Set(
    items.filter((item) => item.fcstDate === target.date).map((item) => item.fcstTime),
  )];

  if (!times.length) throw new Error("WEATHER_FORECAST_OUT_OF_RANGE");

  const nearest = times.reduce((best, value) =>
    Math.abs(Number(value) - Number(target.time)) < Math.abs(Number(best) - Number(target.time))
      ? value
      : best,
  );

  return items.filter((item) => item.fcstDate === target.date && item.fcstTime === nearest);
}

function conditionFromCode(code: number): WeatherSnapshot["condition"] {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "SNOW";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) {
    return "RAIN";
  }
  return code <= 1 ? "SUNNY" : "CLOUDY";
}

function conditionFromKma(pty = "0", sky = "1"): WeatherSnapshot["condition"] {
  if (["1", "2", "5", "6"].includes(pty)) return "RAIN";
  if (["3", "7"].includes(pty)) return "SNOW";
  return sky === "1" ? "SUNNY" : "CLOUDY";
}

async function getOpenMeteoWeather(location: string, query: WeatherQuery): Promise<WeatherSnapshot> {
  const normalized = normalizeWeatherLocation(location);
  const geocodingParams = new URLSearchParams({
    name: normalized,
    count: "1",
    language: "ko",
    countryCode: "KR",
  });
  const geocodingResponse = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?${geocodingParams}`,
    { cache: "no-store" },
  );
  const geocoding = await geocodingResponse.json();
  const place = geocoding?.results?.[0];
  if (!geocodingResponse.ok || !place) throw new Error(`WEATHER_LOCATION_NOT_FOUND:${location}`);

  const forecastParams = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    hourly: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "precipitation_probability",
      "weather_code",
    ].join(","),
    timezone: "Asia/Seoul",
    forecast_days: "16",
  });
  const forecastResponse = await fetch(
    `https://api.open-meteo.com/v1/forecast?${forecastParams}`,
    { cache: "no-store" },
  );
  const forecast = await forecastResponse.json();
  const hourly = forecast?.hourly;
  if (!forecastResponse.ok || !Array.isArray(hourly?.time)) throw new Error("WEATHER_API_NO_DATA");

  const target = requestedForecast(query);
  const targetHour = `${target.date.slice(0, 4)}-${target.date.slice(4, 6)}-${target.date.slice(6)}T${target.time.slice(0, 2)}:00`;
  const index = hourly.time.indexOf(targetHour);
  if (index < 0) throw new Error("WEATHER_FORECAST_OUT_OF_RANGE");
  const hourlyForecast = hourly.time.slice(index, index + 12).map(
    (time: string, offset: number): WeatherHour => {
      const itemIndex = index + offset;
      return {
        forecastAt: `${time}:00+09:00`,
        temp: hourly.temperature_2m[itemIndex],
        feelsLike: hourly.apparent_temperature[itemIndex],
        humidity: hourly.relative_humidity_2m[itemIndex],
        precipitationProbability: hourly.precipitation_probability[itemIndex],
        condition: conditionFromCode(hourly.weather_code[itemIndex]),
      };
    },
  );

  return {
    temp: hourly.temperature_2m[index],
    feelsLike: hourly.apparent_temperature[index],
    humidity: hourly.relative_humidity_2m[index],
    precipitationProbability: hourly.precipitation_probability[index],
    condition: conditionFromCode(hourly.weather_code[index]),
    location: [...new Set([place.admin1, place.name].filter(Boolean))].join(" "),
    forecastAt: `${targetHour}:00+09:00`,
    hourly: hourlyForecast,
    updatedAt: new Date().toISOString(),
  };
}

export async function getLiveWeather(
  nx: number,
  ny: number,
  apiKey: string,
  location = "충청북도 충주시",
  query: WeatherQuery = {},
): Promise<WeatherSnapshot> {
  if (!apiKey) throw new Error("WEATHER_API_KEY_MISSING");

  const { base_date, base_time } = getKmaBaseDateTime();
  const params = new URLSearchParams({
    serviceKey: apiKey,
    pageNo: "1",
    numOfRows: "1000",
    dataType: "JSON",
    base_date,
    base_time,
    nx: String(nx),
    ny: String(ny),
  });
  const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${params}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) throw new Error(`KMA_API_HTTP_ERROR_${response.status}`);

  const json = await response.json();
  const rawItems = json?.response?.body?.items?.item;
  if (!Array.isArray(rawItems)) throw new Error("KMA_API_NO_DATA");

  const items = selectForecast(rawItems as ForecastItem[], query);
  const values = Object.fromEntries(items.map((item) => [item.category, item.fcstValue]));
  const temp = Number(values.TMP);
  const humidity = Number(values.REH);

  if (!Number.isFinite(temp) || !Number.isFinite(humidity)) {
    throw new Error("KMA_API_INCOMPLETE_DATA");
  }

  const pty = values.PTY || "0";
  const sky = values.SKY || "1";
  const condition = conditionFromKma(pty, sky);
  const first = items[0];
  const selectedKey = `${first.fcstDate}${first.fcstTime}`;
  const grouped = new Map<string, Record<string, string>>();
  (rawItems as ForecastItem[]).forEach((item) => {
    const key = `${item.fcstDate}${item.fcstTime}`;
    grouped.set(key, { ...(grouped.get(key) || {}), [item.category]: item.fcstValue });
  });
  const hourly = [...grouped.entries()]
    .filter(([key, value]) => key >= selectedKey && Number.isFinite(Number(value.TMP)))
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 12)
    .map(([key, value]): WeatherHour => ({
      forecastAt: `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}T${key.slice(8, 10)}:${key.slice(10)}:00+09:00`,
      temp: Number(value.TMP),
      feelsLike: Number(value.TMP),
      humidity: Number(value.REH || 0),
      precipitationProbability: Number(value.POP || 0),
      condition: conditionFromKma(value.PTY, value.SKY),
    }));

  return {
    temp,
    condition,
    location,
    feelsLike: temp,
    humidity,
    precipitationProbability: Number(values.POP || 0),
    forecastAt: `${first.fcstDate.slice(0, 4)}-${first.fcstDate.slice(4, 6)}-${first.fcstDate.slice(6)}T${first.fcstTime.slice(0, 2)}:${first.fcstTime.slice(2)}:00+09:00`,
    hourly,
    updatedAt: new Date().toISOString(),
  };
}

export async function getWeatherByUserLocation(
  userLocationName: string,
  apiKey: string,
  query: WeatherQuery = {},
): Promise<WeatherSnapshot> {
  const grid = findWeatherGrid(userLocationName || "서울특별시");
  if (!grid) throw new Error(`WEATHER_LOCATION_NOT_FOUND:${userLocationName}`);

  if (!apiKey) return getOpenMeteoWeather(grid.location, query);

  try {
    return await getLiveWeather(grid.nx, grid.ny, apiKey, grid.location, query);
  } catch {
    return getOpenMeteoWeather(grid.location, query);
  }
}
