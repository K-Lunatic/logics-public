import assert from "node:assert/strict";
import test from "node:test";
import { toReceiptCommitInput } from "./receiptReview.ts";

test("검수에서 제외한 재무·물품 후보는 저장 입력에 포함하지 않는다", () => {
  const input = toReceiptCommitInput(
    false,
    {
      amount: 12000,
      category: "식비",
      assetAccount: "카드",
      description: "식당",
      date: "2026-07-27",
      confidence: 0.9,
    },
    [
      {
        selected: false,
        name: "잘못 읽힌 항목",
        domainType: "ETC",
        quantity: 1,
        unit: "개",
        expirationDate: null,
        barcode: null,
        confidence: 0.2,
      },
    ],
  );
  assert.deepEqual(input, { finance: null, items: [] });
});
