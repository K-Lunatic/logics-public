import { StoredTool } from "../types"; // 프로젝트 타입 경로 확인냥!

export function mergeTools(
  systemTools: StoredTool[] = [],
  userTools: StoredTool[] = []
): StoredTool[] {
  const map = new Map<string, StoredTool>();

  // 🛡️ [Array Shield]: 배열 여부를 철저히 검증하여 TypeError 완벽 예방!
  const safeSystemTools = Array.isArray(systemTools) ? systemTools : [];
  const safeUserTools = Array.isArray(userTools) ? userTools : [];

  safeSystemTools.forEach((t) => t?.id && map.set(t.id, t));
  safeUserTools.forEach((t) => t?.id && map.set(t.id, t));

  return Array.from(map.values());
}
