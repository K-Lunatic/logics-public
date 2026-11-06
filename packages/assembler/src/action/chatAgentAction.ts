import { z } from "zod";
// 🚀 [Pure Bone]: @ink/engine에서는 순수 타입과 페르소나 단자만 가져옵니다냥!
import {
  chatMessageSchema,
  ChatMessage,
  toTrustedChatContext,
} from "@ink/engine";

import { buildSystemPersona, PersonaSettings } from "./systemPersona";
import { compactToolEvidence, toolFailure } from "./systemToolCore";

// 📋 1. 입력 파라미터 무결성 규격
export const executeChatInput = z.object({
  userId: z.string(),
  messages: z.array(z.record(z.string(), z.unknown())),
  persona: z
    .object({
      nickname: z.string().optional(),
      userNickname: z.string().optional(),
      tone: z.string().optional(),
      customInstructions: z.string().optional(),
    })
    .optional(),
});

// 🔌 2. 외부 환경 대리자 명세서
export interface ChatAgentDelegate {
  fetchChatHistory: (userId: string) => Promise<ChatMessage[]>;
  saveChatHistory: (userId: string, history: ChatMessage[]) => Promise<void>;
  prepareContext: (userId: string) => Promise<void>;
  runAIWorkflow: (
    systemPersona: string,
    cleanedMessages: unknown[],
  ) => Promise<{ text: string; [key: string]: unknown }>;
}

/**
 * 🤖 [Chat Agent Action]: @ink/assembler 계층에서 오케스트레이션을 총괄하는 표준 액션
 */
export const chatAgentAction = {
  id: "ACTION_EXECUTE_CHAT_AGENT",
  description: "동적 페르소나 및 사용자 개인 API 키를 적용하여 대화를 가동합니다.",
  inputSchema: executeChatInput,

  execute: async (
    params: z.infer<typeof executeChatInput>,
    delegate: ChatAgentDelegate
  ) => {
    const { userId, messages, persona } = executeChatInput.parse(params);

    const latestInput = [...messages]
      .reverse()
      .find((message) => message?.role === "user");
    const latestUserMessage =
      typeof latestInput?.content === "string" && latestInput.content.trim()
        ? latestInput.content
        : "안녕";
    const [, storedHistory] = await Promise.all([
      delegate.prepareContext(userId),
      delegate.fetchChatHistory(userId),
    ]);
    const cleanedMessages = toTrustedChatContext(
      storedHistory,
      latestUserMessage,
    );
    
    const dynamicSystemPersona = buildSystemPersona(persona);

    // 🚀 주입받은 AI 파이프라인 가동 (Engine의 systemPersona 주입)
    const agentResult = await delegate.runAIWorkflow(
      dynamicSystemPersona,
      cleanedMessages,
    );

    // 🧹 마크다운 백틱 정제 및 UI 컴포넌트 구조체 추출
    let sanitizedOutput = "";
    let displayMessage = "";
    try {
      let rawText = String(agentResult?.text || "");
      rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(rawText);

      delete parsed.internal_checklist;
      sanitizedOutput = JSON.stringify(parsed);
      displayMessage =
        typeof parsed.message === "string" && parsed.message.trim()
          ? parsed.message.trim()
          : sanitizedOutput;
    } catch {
      sanitizedOutput = String(agentResult?.text || "장부를 해독하지 못했다냥.");
      displayMessage = sanitizedOutput;
    }
    const rawToolResults = Array.isArray(agentResult?.toolResults)
      ? agentResult.toolResults
      : [];
    const persistedToolResults = rawToolResults.filter((result) => {
      const entry = result as { toolName?: unknown; data?: unknown };
      return toolFailure(entry.data) !== null ||
        /(?:^|[-_.:])(add|update|delete|set|consume|register)(?:$|[-_.:])/i
          .test(String(entry.toolName || ""));
    });
    const verifiedData = persistedToolResults.length > 0
      ? {
          toolResults: persistedToolResults.map((result) => {
            const entry = result as { toolName?: unknown; data?: unknown };
            return {
              toolName: String(entry.toolName || "unknown"),
              success: toolFailure(entry.data) === null,
              data: compactToolEvidence(entry.data ?? null),
            };
          }),
        }
      : undefined;

    const historySyncTask = async () => {
      try {
        const nowStr = new Date().toISOString();
        const lastUserMsg = cleanedMessages[cleanedMessages.length - 1];

        const userContentStr =
          typeof lastUserMsg?.content === "string"
            ? lastUserMsg.content
            : JSON.stringify(lastUserMsg?.content || "");

        const newMessages = [
          chatMessageSchema.parse({
            role: "user",
            content: userContentStr,
            timestamp: nowStr,
          }),
          chatMessageSchema.parse({
            role: "assistant",
            content: displayMessage,
            ...(verifiedData ? { data: verifiedData } : {}),
            timestamp: nowStr,
          }),
        ];

        await delegate.saveChatHistory(userId, newMessages);
        console.log("Cloud ☁️ [Assembler Agent] 대화 장부 싱크 완료냥!");
      } catch (e) {
        console.error("🚨 [Assembler Agent] 대화 기입 실패:", e);
      }
    };

    agentResult.text = sanitizedOutput;

    return { agentResult, historySyncTask };
  },
};
