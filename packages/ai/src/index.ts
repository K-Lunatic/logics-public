import { generateText, stepCountIs } from "ai";
import {
  SynthesizedResponse,
  normalizeModelReply,
} from "./executor";
import {
  type AIReliabilityMode,
  type ModelCapabilityMode,
  type DeferredToolCall,
  analyzeRequest,
  executeCompletePlan,
  isMutationToolName,
  plannedCallCount,
  resolveModelProfile,
} from "./adaptive";
export { normalizeModelReply } from "./executor";
export * from "./adaptive";

export interface WorkflowOptions {
  model: any;
  system: string;
  messages: any[];
  tools: any;
  maxSteps?: number;
  modelId?: string;
  capabilityMode?: ModelCapabilityMode;
  reliabilityMode?: AIReliabilityMode;
  mutationToolNames?: string[];
}

export interface NormalizedToolResult {
  toolName: string;
  data: unknown;
}

function toolFailure(data: unknown): string | null {
  if (Array.isArray(data)) {
    for (const item of data) {
      const failure = toolFailure(item);
      if (failure) return failure;
    }
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  if (value.success !== false) return null;
  return String(value.error || value.message || "도구 실행에 실패했습니다.");
}

/**
 * 🛠️ [Gemini Function Calling Naming Guard]
 * Gemini API 툴 이름 규격 준수:
 * - 영문 대소문자(a-z, A-Z), 숫자(0-9), 언더바(_), 마침표(.), 콜론(:), 하이픈(-)만 허용 (최대 128자)
 * - 슬래시(/)나 특수문자는 '_'로 치환
 * - 첫 글자는 반드시 영문자 또는 '_'
 */
function sanitizeToolName(name: string): string {
  let sanitized = name.replace(/[^a-zA-Z0-9_.:-]/g, "_");
  if (!/^[a-zA-Z_]/.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  return sanitized.slice(0, 128);
}

export const AIEngineOrchestrator = {
  /**
   * 🏭 [지능형 에이전트 연산 처리 및 포맷팅 팩토리]
   */
  async runAgentWorkflow(options: WorkflowOptions) {
    const sanitizedTools = options.tools
      ? Object.entries(options.tools).reduce((acc, [key, tool]) => {
          acc[sanitizeToolName(key)] = tool;
          return acc;
        }, {} as Record<string, any>)
      : undefined;
    const profile = resolveModelProfile(
      options.modelId || "unknown",
      options.capabilityMode,
      options.reliabilityMode,
    );
    const maxSteps = options.maxSteps ?? profile.maxSteps;
    const latestUserText = [...options.messages]
      .reverse()
      .find((message) => message?.role === "user")?.content;
    const request = analyzeRequest(
      typeof latestUserText === "string" ? latestUserText : "",
    );
    const explicitMutationNames = new Set(
      (options.mutationToolNames || []).map(sanitizeToolName),
    );
    const isMutation = (toolName: string) =>
      explicitMutationNames.has(toolName) || isMutationToolName(toolName);
    const plannedCalls: DeferredToolCall[] = [];
    const fingerprints = new Set<string>();
    const planningTools: any = Object.fromEntries(
      Object.entries(sanitizedTools || {}).map(([toolName, definition]) => {
        const original = definition as {
          execute?: (input: any) => Promise<unknown>;
          [key: string]: unknown;
        };
        if (!isMutation(toolName) || typeof original.execute !== "function") {
          return [toolName, original];
        }
        return [
          toolName,
          {
            ...original,
            execute: async (input: unknown) => {
              const fingerprint = `${toolName}:${JSON.stringify(input)}`;
              if (!fingerprints.has(fingerprint)) {
                fingerprints.add(fingerprint);
                plannedCalls.push({
                  toolName,
                  input,
                  execute: original.execute!,
                });
              }
              return {
                success: true,
                planned: true,
                count: plannedCallCount(input),
              };
            },
          },
        ];
      }),
    );

    const runPlanningPass = (system: string) => generateText({
      model: options.model,
      system,
      messages: options.messages.slice(-profile.contextMessages),
      tools: planningTools,
      stopWhen: stepCountIs(maxSteps),
      timeout: { totalMs: profile.timeoutMs },
      include: { requestBody: false, responseBody: false },
    });
    const responses = [await runPlanningPass(
      `${options.system}\n\n[파이프라인 단계] 데이터 변경 도구는 지금 계획만 기록된다. 사용자가 요구한 대상을 하나도 빠뜨리지 말고, 실행 완료라고 말하기 전에 요청 건수와 도구 입력 건수를 대조하라.`,
    )];
    const waitingForApproval = normalizeModelReply(
      responses[0]!.text,
    ).components.some((component) => component.type === "action_button");
    const enforcedCount =
      request.mutation && request.expectedCount !== null && !waitingForApproval
        ? request.expectedCount
        : null;
    let plannedCount = plannedCalls.reduce(
      (sum, call) => sum + plannedCallCount(call.input),
      0,
    );
    if (
      enforcedCount !== null &&
      plannedCount < enforcedCount
    ) {
      for (
        let pass = 0;
        pass < profile.recoveryPasses &&
        plannedCount < enforcedCount;
        pass += 1
      ) {
        const before = plannedCalls.length;
        const existingPlan = JSON.stringify(
          plannedCalls.map(({ toolName, input }) => ({ toolName, input })),
        ).slice(0, 8_000);
        responses.push(await runPlanningPass(
          `${options.system}\n\n[누락 복구 ${pass + 1}/${profile.recoveryPasses}] 사용자는 총 ${enforcedCount}건을 요구했지만 현재 고유 계획은 ${plannedCount}건뿐이다. 아래 계획을 반복하지 말고 누락된 대상만 도구로 계획하라.\n${existingPlan}`,
        ));
        plannedCount = plannedCalls.reduce(
          (sum, call) => sum + plannedCallCount(call.input),
          0,
        );
        if (plannedCalls.length === before) break;
      }
    }

    const response = responses.at(-1)!;
    const normalizedReply = normalizeModelReply(response.text);
    let finalReply = normalizedReply.message;
    const extractedTools: NormalizedToolResult[] = [];
    const components = normalizedReply.components;

    for (const planningResponse of responses) {
      for (const step of planningResponse.steps || []) {
        if (step.toolResults) {
          for (const tr of step.toolResults) {
            if (isMutation(tr.toolName)) continue;
            extractedTools.push({
              toolName: tr.toolName,
              data: tr.output,
            });
          }
        }
        for (const part of step.content || []) {
          const entry = part as {
            type?: string;
            toolName?: string;
            error?: unknown;
          };
          if (entry.type === "tool-error") {
            extractedTools.push({
              toolName: entry.toolName || "unknown",
              data: {
                success: false,
                error:
                  entry.error instanceof Error
                    ? entry.error.message
                    : String(entry.error || "도구 실행에 실패했습니다."),
              },
            });
          }
        }
      }
    }

    const countMismatch =
      enforcedCount !== null && plannedCount !== enforcedCount;
    const unsupportedSuccessClaim =
      request.mutation &&
      plannedCalls.length === 0 &&
      /(완료|수정했|추가했|등록했|삭제했|반영했)/.test(finalReply);
    const unauthorizedPlan = plannedCalls.length > 0 && !request.mutation;
    if (countMismatch) {
      extractedTools.push({
        toolName: "pipeline.completeness",
        data: {
          success: false,
          error: `${enforcedCount}건 중 ${plannedCount}건만 계획되어 실행을 중단했습니다.`,
        },
      });
      finalReply = `${enforcedCount}건 중 ${plannedCount}건만 확인되어 데이터는 하나도 변경하지 않았습니다. 누락된 대상을 확인한 뒤 다시 요청해 주세요.`;
    } else if (unsupportedSuccessClaim) {
      extractedTools.push({
        toolName: "pipeline.execution-proof",
        data: {
          success: false,
          error: "실행된 변경 도구가 없어 성공 주장을 차단했습니다.",
        },
      });
      finalReply = "실행된 변경 도구가 없어 데이터는 변경되지 않았습니다.";
    } else if (unauthorizedPlan) {
      extractedTools.push({
        toolName: "pipeline.intent-guard",
        data: {
          success: false,
          error: "명시적인 데이터 변경 명령이 아니어서 실행을 차단했습니다.",
        },
      });
      finalReply = "질문 또는 가정으로 판단되어 데이터는 변경하지 않았습니다.";
    } else {
      const execution = await executeCompletePlan(
        plannedCalls,
        enforcedCount,
      );
      extractedTools.push(...execution.results);
    }

    const failedTools = extractedTools
      .map((result) => ({
        name: result.toolName,
        error: toolFailure(result.data),
      }))
      .filter((result): result is { name: string; error: string } =>
        Boolean(result.error),
      );
    const hasMutation = extractedTools.some(
      (result) => isMutation(result.toolName) && !toolFailure(result.data),
    );
    const generationFailed =
      response.finishReason === "error" ||
      response.finishReason === "content-filter" ||
      (!response.text.trim() && extractedTools.length === 0);

    if (plannedCalls.length > 0 && !countMismatch && !unauthorizedPlan) {
      const mutationResults = extractedTools.filter((entry) =>
        isMutation(entry.toolName)
      );
      const succeeded = plannedCalls.reduce(
        (count, call, index) =>
          count + (
            mutationResults[index] && !toolFailure(mutationResults[index]!.data)
              ? plannedCallCount(call.input)
              : 0
          ),
        0,
      );
      finalReply = `${succeeded}건의 데이터 변경을 실행했습니다.`;
    }
    if (!finalReply) {
      finalReply = extractedTools.length > 0
        ? "요청한 도구 실행을 마쳤습니다."
        : "답변을 생성하지 못했습니다. 다시 요청해 주세요.";
    }
    if (failedTools.length > 0) {
      finalReply = `${hasMutation ? "일부 작업은 반영됐지만 나머지를 처리하지 못했습니다" : "처리하지 못했습니다"}: ${failedTools.map((item) => `${item.name} - ${item.error}`).join(", ")}`;
    }

    const synthesizedPackage: SynthesizedResponse = {
      rawResult: extractedTools,
      evaluation: {
        isSuccessful: failedTools.length === 0 && !generationFailed,
        reason: failedTools.length > 0
          ? failedTools.map((item) => `${item.name}: ${item.error}`).join(", ")
          : generationFailed
            ? "모델이 답변을 완료하지 못했습니다."
          : hasMutation
            ? "데이터 트랜잭션 검증 및 UI 캐시 주입 완료"
            : "조회용 트랙 정상 통과",
        impact: failedTools.length > 0
          ? hasMutation
            ? "일부 장부 변경만 반영되었습니다."
            : "장부 변경이 완료되지 않았습니다."
          : hasMutation
            ? "장부 상태가 변동되었습니다."
            : "장부 변동 없음"
      },
      components,
      message: finalReply
    };

    return {
      text: JSON.stringify(synthesizedPackage), // InkChat.tsx가 수령할 파싱용 스트링 번들
      toolResults: extractedTools,
      finishReason: response.finishReason,
      modelProfile: profile,
      requestContract: request,
    };
  }
};
