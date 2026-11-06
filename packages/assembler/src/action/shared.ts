// 📂 packages/assembler/src/action/shared.ts
import { dbRemote } from "../adapters/dataStore";

// 📊 에이전트 진행률 및 취소 제어 상태 레지스트리
export const progressRegistry = new Map<string, string>();

/**
 * 📝 세션별 작업 로그 실시간 덧붙임 헬퍼
 */
export const appendLog = (userId: string, text: string) => {
  const current = progressRegistry.get(userId) || "";
  const lines = current ? current.split("\n") : [];
  const timeStr = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  lines.push(`[${timeStr}] ${text}`);

  if (lines.length > 5) lines.shift();
  progressRegistry.set(userId, lines.join("\n"));
};

/**
 * 🔐 세션 기반 Chat Storage Driver 생성 단자
 * 🚀 [Fix]: users/${userId}/chat_history/master_document 경로 및 양방향 배열 언래핑 정밀 보장!
 */
export const getStorageDriver = (userId: string) => {
  const legacyPath = `users/${userId}/chat_history/master_document`;
  const collectionPath = `users/${userId}/chat_messages`;

  const asMessages = (value: unknown): Array<Record<string, unknown>> => {
    if (Array.isArray(value)) return value;
    if (
      value &&
      typeof value === "object" &&
      "list" in value &&
      Array.isArray((value as { list: unknown }).list)
    ) {
      return (value as { list: Array<Record<string, unknown>> }).list;
    }
    return [];
  };

  const messageId = (message: Record<string, unknown>) => {
    const input = `${message.timestamp || ""}|${message.role || ""}|${message.content || ""}`;
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `message_${Math.abs(Number(new Date(String(message.timestamp || 0))))}_${(hash >>> 0).toString(36)}`;
  };

  const appendMessages = async (value: unknown) => {
    const messages = asMessages(value);
    await Promise.all(
      messages.map((message) =>
        dbRemote.set(`${collectionPath}/${messageId(message)}`, message),
      ),
    );
  };

  return {
    read: async <T>(_locationKey?: string): Promise<T | null> => {
      const messages = await dbRemote.list<Record<string, unknown>>(collectionPath);
      if (messages.length > 0) {
        messages.sort((left, right) =>
          String(left.timestamp || "").localeCompare(String(right.timestamp || "")),
        );
        return { list: messages } as T;
      }
      const legacy = await dbRemote.get<unknown>(legacyPath);
      const legacyMessages = asMessages(legacy);
      if (legacyMessages.length === 0) return null;
      await appendMessages(legacyMessages);
      await dbRemote.set(legacyPath, []);
      return { list: legacyMessages } as T;
    },
    write: async <T>(
      _locationKey: string,
      data: T
    ): Promise<{ success: boolean }> => {
      await appendMessages(data);
      return { success: true };
    },
  };
};

/**
 * 📦 dbRemote 어댑터 기반 범용 도메인 스토리지 드라이버
 * 🚀 [Fix]: users/${userId}/${domainLocation}/${locationKey} 정밀 경로 매핑!
 */
export const getActiveStorageDriver = (
  userId: string,
  domainLocation: string
) => {
  return {
    read: async <T>(locationKey: string = "master_document"): Promise<T | null> => {
      const targetPath = `users/${userId}/${domainLocation}/${locationKey}`;
      return await dbRemote.get<T>(targetPath);
    },
    write: async <T>(
      locationKey: string = "master_document",
      data?: T
    ): Promise<{ success: boolean }> => {
      const targetPath = `users/${userId}/${domainLocation}/${locationKey}`;
      await dbRemote.set(targetPath, data);
      return { success: true };
    },
  };
};
