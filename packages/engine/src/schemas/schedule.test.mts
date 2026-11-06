import assert from "node:assert/strict";
import test from "node:test";
import { aiScheduleResolutionSchema } from "./schedule.ts";

test("예전 일정의 isUserDefined 누락을 사용자 일정으로 보정한다", () => {
  const event = aiScheduleResolutionSchema.shape.monthEvents.element.parse({
    id: "legacy-event",
    title: "기존 일정",
    startDate: "2026-07-25",
    endDate: "2026-07-25",
    category: "PERSONAL",
    colorClass: "bg-blue-500",
  });
  assert.equal(event.isUserDefined, true);
});
