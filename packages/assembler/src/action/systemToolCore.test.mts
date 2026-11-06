import assert from "node:assert/strict";
import test from "node:test";
import {
  compactToolEvidence,
  completeInventoryDomain,
  findExactToolTarget,
  formatSeoulDate,
  hasToolUpdate,
  toolFailure,
} from "./systemToolCore.ts";

test("툴 수정·삭제 대상은 ID 우선이며 중복 이름은 거부한다", () => {
  const items = [
    { id: "item-1", name: "물티슈" },
    { id: "item-2", name: "물티슈" },
  ];
  assert.equal(findExactToolTarget(items, "item-2")?.id, "item-2");
  assert.throws(() => findExactToolTarget(items, "물티슈"));
});

test("중첩된 실패 결과를 성공으로 감싸지 않는다", () => {
  assert.equal(
    toolFailure([{ success: true }, { success: false, error: "저장 실패" }]),
    "저장 실패",
  );
  assert.equal(toolFailure({ success: true }), null);
});

test("물품 분류 변경 시 새 분류의 필수 기본값을 채운다", () => {
  assert.deepEqual(
    completeInventoryDomain({ domainType: "FOOD", expirationDate: "2026-08-01" }),
    {
      storageCondition: "ROOM",
      isOpened: false,
      openedDate: null,
      category: "INGREDIENT",
      expirationDate: "2026-08-01",
      domainType: "FOOD",
    },
  );
});

test("ID만 있는 수정 요청은 실제 변경으로 처리하지 않는다", () => {
  assert.equal(hasToolUpdate({ id: "evt-1" }), false);
  assert.equal(hasToolUpdate({ id: "evt-1", title: "변경" }), true);
});

test("대화에 저장하는 도구 증거는 대용량 결과를 제한한다", () => {
  const compacted = compactToolEvidence({ list: ["x".repeat(100)] }, 20);
  assert.deepEqual(compacted, {
    truncated: true,
    preview: '{"list":["xxxxxxxxxx',
  });
});

test("상대 날짜는 UTC가 아니라 한국 날짜를 사용한다", () => {
  assert.equal(
    formatSeoulDate(new Date("2026-07-26T16:00:00.000Z")),
    "2026-07-27",
  );
});
