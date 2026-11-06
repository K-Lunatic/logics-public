import assert from "node:assert/strict";
import test from "node:test";
import { chatMessageSchema, toTrustedChatContext } from "./chat.ts";

test("과거 AI 문장과 검증 데이터를 분리하고 역할을 교대로 유지한다", () => {
  const history = [
    chatMessageSchema.parse({
      role: "user",
      content: "물품을 수정해줘",
      timestamp: "2026-07-27T00:00:00.000Z",
    }),
    chatMessageSchema.parse({
      role: "assistant",
      content: "수정했다고 주장했지만 근거 없음",
      timestamp: "2026-07-27T00:01:00.000Z",
    }),
    chatMessageSchema.parse({
      role: "user",
      content: "결과를 확인해줘",
      timestamp: "2026-07-27T00:02:00.000Z",
    }),
    chatMessageSchema.parse({
      role: "assistant",
      content: "표시용 문장",
      data: {
        toolResults: [{
          toolName: "sys-inventory-update",
          success: true,
          data: { id: "item-1", quantity: 2 },
        }],
      },
      timestamp: "2026-07-27T00:03:00.000Z",
    }),
  ];

  const context = toTrustedChatContext(history, "지금 수량 알려줘");
  assert.deepEqual(context.map((message) => message.role), [
    "user", "assistant", "user",
  ]);
  assert.match(context[1]!.content, /대화 연결용/);
  assert.match(context[1]!.content, /sys-inventory-update/);
});

test("실패한 과거 명령을 최신 사용자 입력에 합치지 않는다", () => {
  const history = [
    {
      role: "user" as const,
      content: "일정 종료일을 수정해",
      timestamp: "2026-07-27T00:00:00.000Z",
    },
    {
      role: "user" as const,
      content: "내 이름이 뭐야?",
      timestamp: "2026-07-27T00:01:00.000Z",
    },
  ];
  const context = toTrustedChatContext(history, "안녕");
  assert.deepEqual(context, [{ role: "user", content: "안녕" }]);
});

test("실패 결과가 붙은 과거 수정 명령도 다시 실행 문맥에 넣지 않는다", () => {
  const context = toTrustedChatContext([
    {
      role: "user",
      content: "일정 종료일을 수정해",
      timestamp: "2026-07-27T00:00:00.000Z",
    },
    {
      role: "assistant",
      content: "처리하지 못했습니다.",
      data: {
        toolResults: [{
          toolName: "sys-schedule-update",
          success: false,
          data: { error: "실패" },
        }],
      },
      timestamp: "2026-07-27T00:01:00.000Z",
    },
  ], "다른 일정을 추가해");
  assert.deepEqual(context, [{ role: "user", content: "다른 일정을 추가해" }]);
});
