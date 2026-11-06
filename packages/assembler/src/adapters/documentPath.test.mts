import assert from "node:assert/strict";
import test from "node:test";
import { assertDocumentPath } from "./documentPath.ts";

test("문서·컬렉션 경로의 깊이와 경로 탈출 문자를 검증한다", () => {
  assert.equal(
    assertDocumentPath("users/user-1/inventory_items/item-1", "document"),
    "users/user-1/inventory_items/item-1",
  );
  assert.equal(
    assertDocumentPath("users/user-1/inventory_items", "collection"),
    "users/user-1/inventory_items",
  );
  assert.throws(() =>
    assertDocumentPath("users/user-1/inventory_items/../../oauth/google", "document"),
  );
  assert.throws(() =>
    assertDocumentPath("users/user-1/inventory_items/item/child", "document"),
  );
});
