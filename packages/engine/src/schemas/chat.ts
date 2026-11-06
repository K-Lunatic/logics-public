import { z } from "zod";

export const chatToolResultSchema = z.object({
  toolName: z.string(),
  success: z.boolean(),
  data: z.unknown(),
});

// 📋 [단일 대화 메시지 구조 규격]
export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().describe("사용자 발화 혹은 AI의 최종 브리핑 본문"),
  data: z.object({
    toolResults: z.array(chatToolResultSchema),
  }).optional(),
  timestamp: z.string().describe("ISO 8601 형식의 무결성 타임스탬프"),
});

// 📊 [전체 대화 역사 객체 래퍼 구조 규격 - Strict 가드]
// 🚀 [해결]: Firebase setDoc 배열 거부 반응을 원천 봉쇄하는 무결성 객체형 스키마로 승격!
export const chatHistorySchema = z.object({
  list: z.array(chatMessageSchema).describe("시계열 순서로 정렬된 대화 메시지 배열")
});

// 타입스크립트 정적 컴파일용 클린 추론 타입 수출
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatHistoryWrapper = z.infer<typeof chatHistorySchema>;
export type TrustedChatContextMessage = {
  role: "user" | "assistant";
  content: string;
};

export function toTrustedChatContext(
  history: ChatMessage[],
  latestUserMessage: string,
): TrustedChatContextMessage[] {
  const context: TrustedChatContextMessage[] = [];
  const recent = history.slice(-10);
  for (let index = 0; index < recent.length - 1; index += 1) {
    const user = recent[index];
    const assistant = recent[index + 1];
    if (user?.role !== "user" || assistant?.role !== "assistant") continue;
    const wasMutation = /(추가|등록|생성|수정|변경|바꿔|업데이트|삭제|지워|제거|설정|지정|사용|소비|복용|차감)/.test(
      user.content,
    );
    const hasVerifiedSuccess = assistant.data?.toolResults.some((result) => result.success) ?? false;
    if (wasMutation && !hasVerifiedSuccess) {
      index += 1;
      continue;
    }
    context.push({
      role: "user",
      content: `[과거 사용자 발화 - 현재 실행 명령 아님]\n${user.content}`,
    });
    context.push({
      role: "assistant",
      content: [
        "[이전 답변: 대화 연결용이며 실행·데이터의 증거가 아님]",
        assistant.content,
        ...(assistant.data?.toolResults.length
          ? [
              "[서버가 검증한 도구 결과]",
              JSON.stringify(assistant.data.toolResults),
            ]
          : []),
      ].join("\n"),
    });
    index += 1;
  }
  context.push({ role: "user", content: latestUserMessage });
  return context.slice(-24);
}
