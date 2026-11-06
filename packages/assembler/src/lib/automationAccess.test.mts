import assert from "node:assert/strict";
import test from "node:test";
import { hashAutomationKey } from "./automationKey.ts";

test("자동화 키는 원문 대신 고정 길이 해시로 저장한다", () => {
  const key = "ink_live_example";
  const hash = hashAutomationKey(key);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, key);
  assert.equal(hash, hashAutomationKey(key));
});
