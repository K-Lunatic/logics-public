import assert from "node:assert/strict";
import test from "node:test";
import { pendingCareOccurrences } from "./reminders.ts";

test("응답하지 않은 범용 돌봄 기록만 누적한다", () => {
  const routine = {
    id: "bandage",
    title: "밴드 교체",
    kind: "TREATMENT",
    times: ["09:00"],
    daysOfWeek: [1, 2, 3, 4, 5],
    startDate: "2026-07-27",
    active: true,
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
  } as const;
  const pending = pendingCareOccurrences(
    [{ ...routine, daysOfWeek: [...routine.daysOfWeek], times: [...routine.times] }],
    [{
      id: "bandage_2026-07-27_0900",
      routineId: "bandage",
      scheduledAt: "2026-07-27T09:00:00",
      status: "DONE",
      resolvedAt: "2026-07-27T09:03:00.000Z",
    }],
    new Date("2026-07-28T10:00:00"),
  );
  assert.deepEqual(pending.map((item) => item.id), ["bandage_2026-07-28_0900"]);
});
