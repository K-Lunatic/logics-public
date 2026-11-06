import assert from "node:assert/strict";
import test from "node:test";
import {
  addFinanceMonths,
  currentFinanceAssetBalance,
  prepareFinanceAsset,
} from "./finance.math.ts";

test("말일 반복 거래 날짜를 유효한 월말로 맞춘다", () => {
  assert.equal(addFinanceMonths("2026-01-31", 1), "2026-02-28");
});

test("자산 기준시점 이후 확정 거래만 현재 잔액에 반영한다", () => {
  const asset = {
    id: "asset-1",
    name: "생활비 통장",
    category: "은행",
    balance: 100_000,
    openingBalance: 100_000,
    openingAt: "2026-07-01T09:00:00.000Z",
    note: "",
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
  };
  const transaction = (id: string, type: "INCOME" | "EXPENSE", amount: number, date: string, createdAt: string) => ({
    id,
    type,
    amount,
    category: "기타",
    assetAccount: "생활비 통장",
    description: id,
    date,
    createdAt,
    isFixed: false,
    recurrence: "NONE" as const,
    extraFields: [],
  });
  const transactions = [
    transaction("before", "EXPENSE", 30_000, "2026-07-01", "2026-07-01T08:00:00.000Z"),
    transaction("after", "EXPENSE", 20_000, "2026-07-01", "2026-07-01T10:00:00.000Z"),
    transaction("income", "INCOME", 10_000, "2026-07-02", "2026-07-01T10:00:00.000Z"),
    transaction("future", "EXPENSE", 50_000, "2026-08-01", "2026-07-01T10:00:00.000Z"),
  ];

  assert.equal(currentFinanceAssetBalance(asset, transactions, "2026-07-27"), 90_000);
  assert.equal(currentFinanceAssetBalance(asset, transactions, "2026-08-01"), 40_000);
});

test("자산 정보만 수정하면 기준 잔액과 기준일을 보존한다", () => {
  const current = {
    id: "asset-1",
    name: "생활비 통장",
    category: "은행",
    balance: 100_000,
    openingBalance: 100_000,
    openingAt: "2026-07-01T09:00:00.000Z",
    note: "",
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
  };
  const next = prepareFinanceAsset(
    { ...current, name: "공동 생활비", balance: 90_000 },
    current,
    false,
    "2026-07-27T09:00:00.000Z",
  );
  assert.equal(next.name, "공동 생활비");
  assert.equal(next.balance, 100_000);
  assert.equal(next.openingAt, current.openingAt);
});
