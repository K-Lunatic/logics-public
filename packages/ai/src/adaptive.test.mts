import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeRequest,
  executeCompletePlan,
  isPlanComplete,
  plannedCallCount,
  resolveModelProfile,
} from "./adaptive.ts";

test("저성능 모델과 신뢰성 모드는 단계와 복구 횟수를 늘린다", () => {
  assert.deepEqual(
    resolveModelProfile("local/llama-3-8b", "AUTO", "RELIABLE"),
    {
      capability: "LOW",
      maxSteps: 10,
      recoveryPasses: 2,
      contextMessages: 5,
      timeoutMs: 120_000,
    },
  );
  assert.equal(
    resolveModelProfile("gemini-3.6-flash", "AUTO", "FAST").capability,
    "HIGH",
  );
  assert.equal(
    resolveModelProfile("gemini-3.5-flash-lite", "AUTO").capability,
    "BALANCED",
  );
});

test("누락된 쓰기 계획은 단 한 건도 실행하지 않는다", async () => {
  let writes = 0;
  const calls = Array.from({ length: 3 }, (_, index) => ({
    toolName: "inventory-add",
    input: { name: String(index) },
    execute: async () => {
      writes += 1;
      return { success: true };
    },
  }));
  const rejected = await executeCompletePlan(calls, 5);
  assert.equal(rejected.complete, false);
  assert.equal(writes, 0);

  const accepted = await executeCompletePlan(calls, 3);
  assert.equal(accepted.complete, true);
  assert.equal(writes, 3);
});

test("명시된 데이터 건수와 묶음 호출 크기를 분리해 센다", () => {
  assert.deepEqual(analyzeRequest("총 5개의 일정 데이터를 추가해줘"), {
    mutation: true,
    operation: "ADD",
    expectedCount: 5,
  });
  assert.equal(analyzeRequest("물티슈 5개 추가해줘").expectedCount, null);
  assert.equal(analyzeRequest("일정을 삭제하면 어떻게 돼?").mutation, false);
  assert.equal(plannedCallCount({ items: [{}, {}, {}] }), 3);
  assert.equal(plannedCallCount({ id: "one" }), 1);
  assert.equal(isPlanComplete(5, 3, true), false);
  assert.equal(isPlanComplete(5, 5, true), true);
});
