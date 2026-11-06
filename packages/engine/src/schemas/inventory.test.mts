import assert from "node:assert/strict";
import test from "node:test";
import { prepareLivingItemUpdate } from "./inventory.ts";

const legacyFood = {
  id: "item-1",
  name: "우유",
  domainType: "FOOD",
  quantity: 1,
  unit: "개",
};

test("레거시 물품의 누락 필드를 보완한 뒤 수정한다", () => {
  const result = prepareLivingItemUpdate(legacyFood, { quantity: 2 }, "2026-07-27T00:00:00.000Z");
  assert.equal(result.success, true);
  if (result.success) {
    if (result.data.domainType !== "FOOD") {
      throw new Error("식품 분류가 유지되어야 합니다.");
    }
    assert.equal(result.data.quantity, 2);
    assert.equal(result.data.locationId, null);
    assert.equal(result.data.category, "INGREDIENT");
  }
});

test("AI가 보낸 잘못된 분류는 dirty 상태로 넣기 전에 거부한다", () => {
  const result = prepareLivingItemUpdate(legacyFood, { category: "식품" });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.issues[0]?.path.join("."), "category");
  }
});
