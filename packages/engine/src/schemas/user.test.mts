import assert from "node:assert/strict";
import test from "node:test";
import { userProfileSchema } from "./user.ts";

test("온보딩 프로필은 본명·생년월일·지역이 모두 있어야 완성된다", () => {
  const timestamps = {
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
  };
  assert.equal(userProfileSchema.safeParse({
    nickname: "길동",
    fullName: "홍길동",
    birthDate: "2000-01-01",
    ...timestamps,
  }).success, false);
  assert.equal(userProfileSchema.safeParse({
    fullName: "홍길동",
    birthDate: "2000-01-01",
    region: "서울특별시",
    ...timestamps,
  }).success, true);
});
