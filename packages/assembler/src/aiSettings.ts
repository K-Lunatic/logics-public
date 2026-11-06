export const SUPPORTED_AI_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-pro-preview",
] as const;

export type SupportedAiModel = (typeof SUPPORTED_AI_MODELS)[number];

export const AI_REQUESTS_PER_MINUTE_MIN = 1;
export const AI_REQUESTS_PER_MINUTE_MAX = 120;

const DEFAULT_REQUESTS_PER_MINUTE_BY_MODEL: Record<SupportedAiModel, number> = {
  "gemini-3.6-flash": 30,
  "gemini-3.5-flash-lite": 15,
  "gemini-3.1-pro-preview": 10,
};

export function getDefaultRequestsPerMinute(model: SupportedAiModel): number {
  return DEFAULT_REQUESTS_PER_MINUTE_BY_MODEL[model];
}

export function normalizeRequestsPerMinute(
  value: unknown,
  fallbackModel: SupportedAiModel,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return getDefaultRequestsPerMinute(fallbackModel);
  const integer = Math.floor(parsed);
  if (integer < AI_REQUESTS_PER_MINUTE_MIN) return AI_REQUESTS_PER_MINUTE_MIN;
  if (integer > AI_REQUESTS_PER_MINUTE_MAX) return AI_REQUESTS_PER_MINUTE_MAX;
  return integer;
}
