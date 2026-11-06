"use server";

import { getSecureUserIdOrThrow } from "../lib/authGuard";
import { getServerSession } from "next-auth";
import { authOptions } from "../lib/auth";
import { dbRemote } from "../adapters/dataStore";
import { runPipeline } from "../engine/pipeline";
import type { StoredTool } from "../types";
import { getDefaultSystemTools } from "../tools/systemToolCatalog";
import { executeSystemTool } from "./systemToolExecutor";
import { mergeTools } from "../utils/tools";
import { toolFailure } from "./systemToolCore";

const TOOL_ADMIN_EMAIL =
  process.env.SYSTEM_TOOL_ADMIN_EMAIL?.toLowerCase() || "";

function asToolArray(data: unknown): StoredTool[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return Object.values(data) as StoredTool[];
  return [];
}

export async function listSystemToolsAction(): Promise<StoredTool[]> {
  await getSecureUserIdOrThrow();
  return asToolArray(await dbRemote.get("system", "tools"));
}

async function requireToolAdmin(): Promise<void> {
  const session = await getServerSession(authOptions);
  if (session?.user?.email?.toLowerCase() !== TOOL_ADMIN_EMAIL) {
    throw new Error("시스템 툴 관리자 권한이 없습니다.");
  }
}

export async function isSystemToolAdminAction(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === TOOL_ADMIN_EMAIL;
}

export async function replaceSystemToolsAction(data: unknown): Promise<StoredTool[]> {
  await requireToolAdmin();
  const tools = asToolArray(data);
  if (
    tools.some(
      (tool) =>
        !tool?.id ||
        !tool?.name ||
        !Array.isArray(tool.blocks) ||
        tool.blocks.some((block) => block.type === "CODE")
    )
  ) {
    throw new Error("CODE 블록이 없고 ID, 이름, 블록이 유효한 툴만 등록할 수 있습니다.");
  }
  const normalized = tools.map((tool) => ({
    ...tool,
    scope: "system" as const,
    status: tool.status === "INACTIVE" ? "INACTIVE" as const : "ACTIVE" as const,
  }));
  await dbRemote.set("system", "tools", normalized);
  return normalized;
}

export async function resetSystemToolsAction(): Promise<StoredTool[]> {
  return replaceSystemToolsAction(getDefaultSystemTools());
}

export async function listUserToolsAction(): Promise<StoredTool[]> {
  const userId = await getSecureUserIdOrThrow();
  return asToolArray(
    await dbRemote.get(`users/${userId}/tools`, "master_document")
  );
}

export async function saveUserToolsAction(tools: StoredTool[]): Promise<void> {
  const userId = await getSecureUserIdOrThrow();
  if (
    !Array.isArray(tools) ||
    tools.some(
      (tool) =>
        !tool?.id ||
        tool.id.startsWith("sys-") ||
        !Array.isArray(tool.blocks) ||
        tool.blocks.some((block) => block.type === "CODE"),
    )
  ) {
    throw new Error("유효하지 않은 도구 목록입니다.");
  }
  await dbRemote.set(
    `users/${userId}/tools`,
    "master_document",
    tools.map((tool) => ({ ...tool, scope: "user" as const, userId }))
  );
}

export async function simulateToolAction(
  tool: StoredTool,
  inputs: Record<string, unknown>
) {
  const userId = await getSecureUserIdOrThrow();
  if (tool.scope === "system") {
    const registered = mergeTools(
      getDefaultSystemTools(),
      asToolArray(await dbRemote.get("system", "tools")),
    ).find((candidate) => candidate.id === tool.id && candidate.status === "ACTIVE");
    if (!registered) return { success: false, error: "활성화된 시스템 툴이 아닙니다." };
    try {
      const result = await executeSystemTool(registered.id, inputs);
      const failure = toolFailure(result);
      return failure
        ? { success: false, error: failure, result }
        : { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  const registered = asToolArray(
    await dbRemote.get(`users/${userId}/tools`, "master_document"),
  ).find((candidate) => candidate.id === tool.id && candidate.status === "ACTIVE");
  if (!registered) return { success: false, error: "현재 사용자의 활성화된 툴이 아닙니다." };
  return runPipeline(
    userId,
    registered,
    inputs,
    new Set(),
    (toolId, nativeInputs) => executeSystemTool(toolId, nativeInputs),
  );
}
