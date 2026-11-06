import {
  getDefaultRequestsPerMinute,
  normalizeRequestsPerMinute,
  type SupportedAiModel,
} from "../aiSettings";

type RateWindow = {
  startedAt: number;
  used: number;
};

const WINDOW_MS = 60_000;
const windows = new Map<string, RateWindow>();

export function resolveRequestsPerMinute(
  value: unknown,
  modelId: SupportedAiModel,
): number {
  return normalizeRequestsPerMinute(value, modelId);
}

export function defaultRequestsPerMinute(modelId: SupportedAiModel): number {
  return getDefaultRequestsPerMinute(modelId);
}

export function consumeAiQuotaOrThrow(input: {
  userId: string;
  modelId: SupportedAiModel;
  requestsPerMinute?: unknown;
}) {
  const limit = resolveRequestsPerMinute(input.requestsPerMinute, input.modelId);
  const now = Date.now();
  const key = input.userId;
  const previous = windows.get(key);
  const active =
    !previous || now - previous.startedAt >= WINDOW_MS
      ? { startedAt: now, used: 0 }
      : previous;
  if (active.used >= limit) {
    const retryAfterMs = WINDOW_MS - (now - active.startedAt);
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    throw new Error(
      `AI 호출 한도를 초과했습니다 (${limit}회/분). ${retryAfterSeconds}초 후 다시 시도해 주세요.`,
    );
  }
  active.used += 1;
  windows.set(key, active);
}
