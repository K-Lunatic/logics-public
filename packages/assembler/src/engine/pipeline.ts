// 📂 packages/assembler/src/engine/pipeline.ts
import { StoredTool, PipelineContext } from "../types";
import { resolve } from "./interpolator";
import { dbRemote } from "../adapters/dataStore";
import { dbLocal } from "../adapters/localStore";
import { getDefaultSystemTools } from "../tools/systemToolCatalog";
import { toolFailure } from "../action/systemToolCore";

function asTools(data: unknown): StoredTool[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return Object.values(data) as StoredTool[];
  return [];
}

// 🔒 [보안 샌드박스 3]: 출력 결과 내 서버 시크릿 키 마스킹
export function sanitizeOutput<T>(obj: T): T {
  if (!obj) return obj;
  try {
    let jsonStr = JSON.stringify(obj);
    const secrets = [
      process.env.WEATHER_API_KEY,
      process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      process.env.OPENAI_API_KEY,
    ].filter(Boolean) as string[];

    secrets.forEach((secret) => {
      if (secret && secret.length > 5) {
        jsonStr = jsonStr.split(secret).join("***REDACTED_SECRET***");
      }
    });

    return JSON.parse(jsonStr);
  } catch {
    return obj;
  }
}

async function fetchToolFromStore(userId: string, toolId: string): Promise<StoredTool | null> {
  const localTool = await dbLocal.get<StoredTool>("custom_tools", toolId);
  if (localTool) return localTool;

  const systemTools = asTools(await dbRemote.get("system", "tools"));
  const systemTool = [...systemTools, ...getDefaultSystemTools()]
    .find((tool) => tool.id === toolId);
  if (systemTool) return systemTool;

  const userTools = asTools(await dbRemote.get(
    `users/${userId}/tools`,
    "master_document"
  ));
  return userTools.find((tool) => tool.id === toolId) || null;
}

type NativeToolExecutor = (
  toolId: string,
  inputs: Record<string, unknown>
) => Promise<unknown>;

export async function runPipeline(
  userId: string,
  tool: StoredTool,
  rawInputs: Record<string, unknown>,
  visited = new Set<string>(),
  executeNativeTool?: NativeToolExecutor,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  if (visited.has(tool.id)) {
    return { success: false, error: `순환 도구 호출이 감지되었습니다: ${tool.id}` };
  }
  const callStack = new Set(visited).add(tool.id);
  const context: PipelineContext = { userId, inputs: rawInputs, steps: {} };

  try {
    for (const block of tool.blocks || []) {
      if (block.type === "INPUT") continue;

      if (block.type === "OPERATION" && block.toolId) {
        const args: Record<string, unknown> = {};
        Object.entries(block.toolArgs || {}).forEach(([k, v]) => {
          args[k] = resolve(v, context);
        });

        const subTool = await fetchToolFromStore(userId, block.toolId);
        if (!subTool) {
          throw new Error(`하위 도구 '${block.toolId}'를 찾을 수 없습니다냥!`);
        }

        const subResult = subTool.scope === "system" && executeNativeTool
          ? await (async () => {
              const result = await executeNativeTool(subTool.id, args);
              const error = toolFailure(result);
              return error
                ? { success: false, error }
                : { success: true, result };
            })()
          : await runPipeline(
              userId,
              subTool,
              args,
              callStack,
              executeNativeTool,
            );
        if (!subResult.success) return subResult;
        context.steps[block.id] =
          (subResult.result as Record<string, unknown>) || {};
      }

      if (block.type === "CODE") {
        throw new Error("보안을 위해 사용자 정의 CODE 블록 실행이 비활성화되었습니다.");
      }

      if (block.type === "OUTPUT") {
        const result: Record<string, unknown> = {};
        (block.outputMapping || []).forEach((m) => {
          if (m.returnKey) {
            result[m.returnKey] = resolve(m.sourceExpr, context);
          }
        });

        return { success: true, result: sanitizeOutput(result) };
      }
    }

    const lastStepId = Object.keys(context.steps).pop();
    const finalStepResult = lastStepId ? context.steps[lastStepId] : null;

    return { 
      success: true, 
      result: sanitizeOutput(finalStepResult) 
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function simTool(userId: string, tool: StoredTool, inputs: Record<string, unknown>) {
  return await runPipeline(userId, tool, inputs);
}
