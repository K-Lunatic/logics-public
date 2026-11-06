import assert from "node:assert/strict";
import test from "node:test";
import { normalizeModelReply } from "./executor.ts";

test("모델 JSON 응답은 중첩 저장하지 않고 표시 문장과 컴포넌트로 분리한다", () => {
  assert.deepEqual(
    normalizeModelReply('```json\n{"message":"수정 완료","components":[]}\n```'),
    { message: "수정 완료", components: [] },
  );
  assert.deepEqual(normalizeModelReply("일반 답변"), {
    message: "일반 답변",
    components: [],
  });
});
