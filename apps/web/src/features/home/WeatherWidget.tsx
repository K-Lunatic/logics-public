import { WeatherCondition, WeatherSnapshot } from "@ink/engine";

const WEATHER_META: Record<WeatherCondition, { icon: string; label: string }> = {
  SUNNY: { icon: "☀️", label: "맑음" },
  CLOUDY: { icon: "☁️", label: "흐림" },
  RAIN: { icon: "🌧️", label: "비" },
  SNOW: { icon: "🌨️", label: "눈" },
};

function hourLabel(value: string, index: number): string {
  if (index === 0) return "지금";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    hour12: true,
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function WeatherWidget({ weather }: { weather?: WeatherSnapshot | null }) {
  if (!weather) {
    return (
      <section className="min-h-72 animate-pulse rounded-[28px] bg-stone-900 p-5 text-white sm:p-7">
        <p className="text-sm font-semibold text-white/60">날씨를 불러오는 중...</p>
      </section>
    );
  }

  const current = WEATHER_META[weather.condition];
  const hourly = weather.hourly?.length
    ? weather.hourly
    : [{
        forecastAt: weather.forecastAt || weather.updatedAt,
        temp: weather.temp,
        feelsLike: weather.feelsLike,
        humidity: weather.humidity,
        precipitationProbability: weather.precipitationProbability || 0,
        condition: weather.condition,
      }];

  return (
    <section className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#292524_0%,#0c0a09_72%)] p-5 text-white shadow-xl shadow-stone-300/40 sm:p-7">
      <div aria-hidden="true" className="absolute -right-14 -top-20 h-56 w-56 rounded-full bg-amber-200/15 blur-3xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white/60">{weather.location}</p>
          <div className="mt-2 flex items-end gap-3">
            <strong className="text-5xl font-black tracking-[-0.08em] sm:text-6xl">{Math.round(weather.temp)}°</strong>
            <span className="mb-1 rounded-full bg-white/10 px-3 py-1 text-sm font-bold">{current.label}</span>
          </div>
          <p className="mt-2 text-sm text-white/60">
            체감 {Math.round(weather.feelsLike)}° · 습도 {weather.humidity}% · 비 {weather.precipitationProbability || 0}%
          </p>
        </div>
        <span aria-label={current.label} className="text-5xl sm:text-6xl">{current.icon}</span>
      </div>

      <div className="relative -mx-1 mt-7 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max gap-2 px-1">
          {hourly.map((hour, index) => {
            const meta = WEATHER_META[hour.condition];
            return (
              <div
                key={hour.forecastAt}
                className={`w-[76px] shrink-0 rounded-2xl px-3 py-3 text-center ${
                  index === 0 ? "bg-white text-stone-900" : "bg-white/8 text-white"
                }`}
              >
                <p className={`text-[11px] font-bold ${index === 0 ? "text-stone-500" : "text-white/55"}`}>
                  {hourLabel(hour.forecastAt, index)}
                </p>
                <span className="my-2 block text-2xl" aria-label={meta.label}>{meta.icon}</span>
                <strong className="text-sm">{Math.round(hour.temp)}°</strong>
                <p className={`mt-1 text-[10px] ${index === 0 ? "text-blue-600" : "text-blue-300"}`}>
                  {hour.precipitationProbability}%
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
