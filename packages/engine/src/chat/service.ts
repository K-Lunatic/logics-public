import { chatHistorySchema, ChatMessage } from "../schemas/chat";
import { z } from "zod";
export interface EngineStorageDelegate {
  read: <T>(key: string) => Promise<T | null>;
  write: <T>(key: string, data: T) => Promise<unknown>;
}

const CHAT_STORAGE_KEY = "history";

export const createChatEngine = (storage: EngineStorageDelegate) => {
  return {
    getPureChatHistory: async (): Promise<ChatMessage[]> => {
      try {
        const rawData = await storage.read<unknown>(CHAT_STORAGE_KEY);
        if (!rawData) return [];

        const parsed = chatHistorySchema.safeParse(rawData);
        return parsed.success ? parsed.data.list : [];
      } catch (error) {
        console.warn("⚠️ [Engine Chat Core] 대화록 스캔 가드 발동:", error);
        return [];
      }
    },

    saveChatHistory: async (
      newHistory: z.infer<typeof chatHistorySchema>,
    ): Promise<{ success: boolean }> => {
      const validatedHistory = chatHistorySchema.parse(newHistory);
      await storage.write(CHAT_STORAGE_KEY, validatedHistory);
      return { success: true };
    },
  };
};
