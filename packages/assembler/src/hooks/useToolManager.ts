// 📂 packages/assembler/src/hooks/useToolManager.ts
"use client";

import { useDataStore } from "./useDataStore";
import { StoredTool } from "../types";
import { mergeTools } from "../utils/tools";
import { packTool, unpackTool } from "../utils/codec";
import {
  listSystemToolsAction,
  listUserToolsAction,
  saveUserToolsAction,
} from "../action/tools.actions";

/**
 * 🛠️ [툴 매니저 통합 관제 훅]
 * 시스템 툴 & 유저 커스텀 툴 0ms 동기화 및 인코딩/데코딩 툴 공유 처리
 */
export function useToolManager() {
  // 1. 시스템 공용 툴 스토어 (Firestore 동기화)
  const { data: systemTools } = useDataStore<StoredTool[]>({
    key: "system_tools",
    // 🚀 [복구 2]: 시스템 도구 읽어오기
    fetcher: listSystemToolsAction,
  });

  // 2. 현재 사용자 전용 툴 스토어 (Firestore 동기화 및 업데이트)
  const { data: userTools, updateData: setUserTools } = useDataStore<StoredTool[]>({
    key: "user_tools",
    // 🚀 [복구 3]: 유저 도구 읽어오기 (경로 통일: users/uid/tools/master_document)
    fetcher: listUserToolsAction,
    // 🚀 [복구 4]: 유저 도구 갱신 시 Firestore에 안전 적재
    updater: saveUserToolsAction,
  });

  // 우선순위 병합된 라이브 툴 목록
  const activeTools = mergeTools(systemTools || [], userTools || []);

  // 툴 공유 코드 생성
  const exportToolCode = (tool: StoredTool) => packTool(tool);

  // 공유 코드로 툴 가져오기 & 저장
  const importToolCode = async (code: string) => {
    const newTool = unpackTool(code);
    const updated = [...(userTools || []), newTool];
    await setUserTools(updated);
    return newTool;
  };

  return { activeTools, userTools, exportToolCode, importToolCode };
}
