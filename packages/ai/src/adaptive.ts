export type ModelCapabilityMode = "AUTO" | "LOW" | "BALANCED" | "HIGH";
export type AIReliabilityMode = "FAST" | "BALANCED" | "RELIABLE";

export interface ModelProfile {
  capability: Exclude<ModelCapabilityMode, "AUTO">;
  maxSteps: number;
  recoveryPasses: number;
  contextMessages: number;
  timeoutMs: number;
}

export interface RequestContract {
  mutation: boolean;
  operation: "ADD" | "UPDATE" | "DELETE" | "SET" | "CONSUME" | null;
  expectedCount: number | null;
}

export interface DeferredToolCall {
  toolName: string;
  input: unknown;
  execute: (input: any) => Promise<unknown>;
}

const KOREAN_NUMBERS: Record<string, number> = {
  한: 1,
  두: 2,
  세: 3,
  네: 4,
  다섯: 5,
  여섯: 6,
  일곱: 7,
  여덟: 8,
  아홉: 9,
  열: 10,
};

export function resolveModelProfile(
  modelId: string,
  capabilityMode: ModelCapabilityMode = "AUTO",
  reliabilityMode: AIReliabilityMode = "BALANCED",
): ModelProfile {
  const normalized = modelId.toLowerCase();
  const inferred =
    /(?:^|[-_/:])(ollama|local|lmstudio)|(?:^|[-_/:])(?:[1-8]b)(?:$|[-_/:])/i
      .test(normalized)
      ? "LOW"
      : /flash-lite|(?:^|[-_/])(?:mini|nano)(?:$|[-_/])/i.test(normalized)
        ? "BALANCED"
        : /(pro|3\.6-flash|3\.5-flash)(?:$|[-_])/i.test(normalized)
          ? "HIGH"
          : "BALANCED";
  const capability = capabilityMode === "AUTO" ? inferred : capabilityMode;
  const base = capability === "LOW"
    ? { maxSteps: 10, contextMessages: 5, timeoutMs: 120_000 }
    : capability === "HIGH"
      ? { maxSteps: 5, contextMessages: 12, timeoutMs: 90_000 }
      : { maxSteps: 7, contextMessages: 8, timeoutMs: 90_000 };
  const recoveryPasses = reliabilityMode === "FAST"
    ? 0
    : reliabilityMode === "RELIABLE"
      ? capability === "LOW" ? 2 : 1
      : capability === "LOW" ? 1 : 0;
  return { capability, recoveryPasses, ...base };
}

export function analyzeRequest(text: string): RequestContract {
  const normalized = text.normalize("NFKC").replace(/\s+/g, " ").trim();
  const operation = /(삭제|지워|제거)/.test(normalized)
    ? "DELETE"
    : /(사용|소비|복용|차감|빼줘)/.test(normalized)
      ? "CONSUME"
    : /(수정|변경|바꿔|업데이트)/.test(normalized)
      ? "UPDATE"
      : /(추가|등록|생성|만들어)/.test(normalized)
        ? "ADD"
        : /(설정|지정)/.test(normalized)
          ? "SET"
          : null;
  const hypothetical =
    /(하면|한다면|할 경우|방법|가능해|어떻게)/.test(normalized) &&
    !/(해줘|해주세요|처리해|진행해|반영해)/.test(normalized);
  const countMatch = normalized.match(
    /(?:총\s*)?(\d+|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(?:건|개(?:의)?\s*(?:데이터|항목|물품|일정|내역))/,
  );
  const explicitCount = countMatch
    ? Number(countMatch[1]) || KOREAN_NUMBERS[countMatch[1]!] || null
    : null;
  const listedCount = text
    .split(/\r?\n/)
    .filter((line) => /^\s*(?:[-*•]|\d+[.)])\s+\S/.test(line)).length;
  return {
    mutation: operation !== null && !hypothetical,
    operation,
    expectedCount:
      explicitCount || (listedCount >= 2 ? listedCount : null),
  };
}

export function plannedCallCount(input: unknown): number {
  if (!input || typeof input !== "object") return 1;
  const value = input as Record<string, unknown>;
  for (const key of ["items", "events", "updatesList"]) {
    if (Array.isArray(value[key])) return value[key].length;
  }
  return 1;
}

export function isPlanComplete(
  expectedCount: number | null,
  plannedCount: number,
  hasPlannedCalls: boolean,
): boolean {
  return expectedCount === null || !hasPlannedCalls ||
    expectedCount === plannedCount;
}

export async function executeCompletePlan(
  calls: DeferredToolCall[],
  expectedCount: number | null,
): Promise<{
  complete: boolean;
  plannedCount: number;
  results: Array<{ toolName: string; data: unknown }>;
}> {
  const plannedCount = calls.reduce(
    (sum, call) => sum + plannedCallCount(call.input),
    0,
  );
  const complete = isPlanComplete(
    expectedCount,
    plannedCount,
    calls.length > 0,
  );
  if (!complete) return { complete, plannedCount, results: [] };
  const results: Array<{ toolName: string; data: unknown }> = [];
  for (const call of calls) {
    try {
      results.push({
        toolName: call.toolName,
        data: await call.execute(call.input),
      });
    } catch (error) {
      results.push({
        toolName: call.toolName,
        data: {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
  return { complete, plannedCount, results };
}

export function isMutationToolName(toolName: string): boolean {
  return /(?:^|[-_.:])(add|update|delete|set|consume|register)(?:$|[-_.:])/i
    .test(toolName);
}
