// 📂 apps/web/src/utils/locationTree.ts

import { PositionItem } from "@ink/engine";

/**
 * 🚀 특정 위치(targetId)를 포함하여, 그 아래에 종속된 모든 하위 위치의 ID 묶음(Set)을 반환한다냥!
 */
export function getDescendantLocationIds(
  targetLocId: string, 
  allPositions: PositionItem[]
): Set<string> {
  const resultSet = new Set<string>([targetLocId]);
  
  let added = true;
  // 하위 노드가 더 이상 발견되지 않을 때까지 반복 (간단한 트리 탐색)
  while (added) {
    added = false;
    for (const pos of allPositions) {
      if (pos.parentId && resultSet.has(pos.parentId) && !resultSet.has(pos.id)) {
        resultSet.add(pos.id);
        added = true;
      }
    }
  }
  
  return resultSet;
}
