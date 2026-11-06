// 📂 packages/assembler/src/hooks/useInkChat.ts
"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { AIMasterSchedulePayload, ChatMessage } from "@ink/engine";

// 🚀 [Pure Bone] 표준 데이터 스토어 어댑터 및 서버 액션 수입
import {
  useDataStore,
  proxyFetchChatHistory,
  executeAndSaveChatServerAction,
} from "../index";
import type { PersonaSettings } from "../action/systemPersona";
import { getChatProgressAction } from "../action/progress.actions";

export interface ServerChatResult {
  reply: string;
  mutatedItems?: unknown[];
  mutatedSchedules?: unknown[];
  mutatedSchedule?: AIMasterSchedulePayload;
  chatHistory?: ChatMessage[];
}

export interface UseInkChatOptions {
  fetchChatFn?: () => Promise<ChatMessage[]>;
  executeChatFn?: (
    apiPayload: unknown[],
    personaSettings?: PersonaSettings
  ) => Promise<unknown>;
  personaSettings?: PersonaSettings;
}

/**
 * 💬 [지능형 대화 & 멀티모달 관제 훅]
 * IndexedDB 0ms 하이브리드 캐싱 + AI 물류 변경 시 인벤토리 스토어 자동 연동
 */
export function useInkChat(options: UseInkChatOptions = {}) {
  const {
    fetchChatFn = proxyFetchChatHistory,
    executeChatFn = executeAndSaveChatServerAction,
    personaSettings,
  } = options;

  // 1. 대화 내역 전용 하이브리드 캐시 스토어 (서버 액션 전동)
  const {
    data: storeHistory,
    loading: isStoreLoading,
    updateData: updateChatStore,
  } = useDataStore<ChatMessage[]>({
    key: "chat_history",
    fetcher: fetchChatFn,
  });

  // 2. AI 물류 변동 발생 시 연동 갱신할 인벤토리 스토어 단자
  const { updateData: updateInventoryStore } = useDataStore<unknown[]>({
    key: "inventory",
  });
  const { updateData: updateScheduleStore } = useDataStore<AIMasterSchedulePayload>({
    key: "schedules",
  });

  // 🛡️ [0ms 철통 방어 메모이제이션]
  // storeHistory가 null, undefined, 또는 { list: [...] } 형태의 객체라도
  // chatHistory가 무조건 '순수 ChatMessage[] 배열'임을 보장합니다냥!
  const chatHistory = useMemo<ChatMessage[]>(() => {
    if (Array.isArray(storeHistory)) {
      return storeHistory;
    }
    if (
      storeHistory &&
      typeof storeHistory === "object" &&
      "list" in storeHistory &&
      Array.isArray((storeHistory as { list: unknown }).list)
    ) {
      return (storeHistory as { list: ChatMessage[] }).list;
    }
    return [];
  }, [storeHistory]);

  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  useEffect(() => {
    if (!isSending) {
      setProgress("");
      return;
    }
    // ponytail: 짧은 상태 폴링이면 충분하다. 토큰 출력이 필요해지면 스트리밍 Route Handler로 교체한다.
    const timer = window.setInterval(() => {
      void getChatProgressAction().then(setProgress).catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [isSending]);

  // 3. 낙관적(Optimistic) 대화 발송 및 원자적 캐시 교체
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isSending) return;

      const nowStr = new Date().toISOString();
      const userMsg: ChatMessage = { role: "user", content: text, timestamp: nowStr };

      // 🚀 [Optimistic UI]: 전송 즉시 화면 말풍선 0ms 반영
      const optimisticHistory = [...chatHistory, userMsg];
      setIsSending(true);
      setError("");
      await updateChatStore(optimisticHistory);

      try {
        const apiPayload = [{ role: "user", content: text }];

        // 🔐 AI 서버 액션 타격 (서버 DB 변경 및 답변 인출)
        const rawResult = await executeChatFn(apiPayload, personaSettings);
        const serverResult = rawResult as ServerChatResult;

        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: serverResult?.reply || "답변을 인출하지 못했다냥.",
          timestamp: new Date().toISOString(),
        };

        const finalHistory = Array.isArray(serverResult?.chatHistory)
          ? serverResult.chatHistory
          : [...optimisticHistory, assistantMsg];

        await updateChatStore(finalHistory);

        // ⚡ [0ms 원자적 로컬 캐시 동기화]: AI 물류 변경 시 화면/IndexedDB 캐시 즉시 업데이트!
        if (serverResult?.mutatedItems && Array.isArray(serverResult.mutatedItems)) {
          console.log("⚡ [Adapter Sync] AI 물류 제어 성공: 인벤토리 스냅샷 캐시 일괄 동기화 단행!");
          await updateInventoryStore(serverResult.mutatedItems);
        }
        if (serverResult?.mutatedSchedule) {
          await updateScheduleStore(serverResult.mutatedSchedule);
        }
      } catch (error) {
        console.error("🚨 대화 전송 중 오류 발생:", error);
        const message = error instanceof Error
          ? error.message
          : "메시지를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
        setError(message);
        await updateChatStore([
          ...optimisticHistory,
          {
            role: "assistant",
            content: `전송에 실패했습니다. 다시 시도해 주세요.\n${message}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setIsSending(false);
      }
    },
    [chatHistory, isSending, updateChatStore, updateInventoryStore, updateScheduleStore, executeChatFn, personaSettings]
  );

  return {
    chatHistory,
    isLoading: isStoreLoading && chatHistory.length === 0,
    sendMessage,
    isSending,
    error,
    progress,
  };
}
