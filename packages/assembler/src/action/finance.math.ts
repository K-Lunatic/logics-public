import type { FinanceAsset, FinanceTransaction } from "@ink/engine";

export function addFinanceMonths(date: string, offset: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
  ).getUTCDate();
  return [
    first.getUTCFullYear(),
    String(first.getUTCMonth() + 1).padStart(2, "0"),
    String(Math.min(day, lastDay)).padStart(2, "0"),
  ].join("-");
}

export function currentFinanceAssetBalance(
  asset: FinanceAsset,
  transactions: FinanceTransaction[],
  today = new Date().toISOString().slice(0, 10)
): number {
  const openingAt = asset.openingAt || asset.updatedAt || asset.createdAt;
  const openingDate = openingAt.slice(0, 10);
  return (asset.openingBalance ?? asset.balance) + transactions
    .filter((transaction) =>
      transaction.assetAccount === asset.name &&
      transaction.date <= today &&
      (
        transaction.date > openingDate ||
        (transaction.date === openingDate && transaction.createdAt > openingAt)
      )
    )
    .reduce(
      (sum, transaction) =>
        sum + (transaction.type === "INCOME" ? transaction.amount : -transaction.amount),
      0
    );
}

export function prepareFinanceAsset(
  asset: FinanceAsset,
  current: FinanceAsset | null,
  resetBalance: boolean,
  now: string,
): FinanceAsset {
  const shouldResetBalance = !current || resetBalance;
  return {
    ...asset,
    balance: shouldResetBalance ? asset.balance : current.balance,
    openingBalance: shouldResetBalance
      ? asset.balance
      : current.openingBalance ?? current.balance,
    openingAt: shouldResetBalance
      ? now
      : current.openingAt || current.updatedAt,
    createdAt: current?.createdAt || asset.createdAt,
    updatedAt: now,
  };
}
