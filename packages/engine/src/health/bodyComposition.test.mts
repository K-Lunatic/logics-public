import assert from "node:assert/strict";
import test from "node:test";
import { calculateBmi } from "./bodyComposition.ts";

test("키와 체중이 있을 때만 BMI를 소수점 한 자리로 계산한다", () => {
  assert.equal(calculateBmi(70, 175), 22.9);
  assert.equal(calculateBmi(undefined, 175), undefined);
  assert.equal(calculateBmi(70, 0), undefined);
});
