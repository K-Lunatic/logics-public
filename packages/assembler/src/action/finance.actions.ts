"use server";

import {
  financeAssetSchema,
  financeBookSchema,
  financeMemoSchema,
  financeMonthSchema,
  financePreferencesSchema,
  financeTransactionSchema,
  financeDateSchema,
  financeMonthValueSchema,
  type FinanceAsset,
  type FinanceBook,
  type FinanceMemo,
  type FinancePreferences,
  type FinanceTransaction,
} from "@ink/engine";
import { dbRemote } from "../adapters/dataStore";
import { getSecureUserIdOrThrow } from "../lib/authGuard";
import {
  addFinanceMonths,
  currentFinanceAssetBalance,
  prepareFinanceAsset,
} from "./finance.math";

const DEFAULT_CATEGORIES = [
  "식비", "교통/차량", "문화생활", "마트/편의점", "패션/미용", "생활용품",
  "주거/통신", "건강", "교육", "경조사비/회비", "이체", "부모님", "기타",
];
const DEFAULT_ASSET_CATEGORIES = ["현금", "카드", "은행", "투자", "기타"];
const monthSchema = financeMonthValueSchema;

function defaultPreferences(): FinancePreferences {
  return {
    categories: DEFAULT_CATEGORIES,
    assetCategories: DEFAULT_ASSET_CATEGORIES,
  };
}

export async function getFinanceBookAction(month: string): Promise<FinanceBook> {
  const userId = await getSecureUserIdOrThrow();
  const cleanMonth = monthSchema.parse(month);
  let [transactions, assets, monthData, memoDocuments, preferences, legacy] = await Promise.all([
    dbRemote.list<FinanceTransaction>(`users/${userId}/finance_transactions`),
    dbRemote.list<FinanceAsset>(`users/${userId}/finance_assets`),
    dbRemote.get<unknown>(`users/${userId}/finance_months/${cleanMonth}`),
    dbRemote.list<FinanceMemo>(`users/${userId}/finance_memos`),
    dbRemote.get<unknown>(`users/${userId}/finance_preferences/master_document`),
    dbRemote.get<{
      monthlyBudget?: number;
      transactions?: Array<Record<string, unknown>>;
    }>(`users/${userId}/finance/master_document`),
  ]);
  if (
    transactions.length === 0 &&
    assets.length === 0 &&
    Array.isArray(legacy?.transactions) &&
    legacy.transactions.length > 0
  ) {
    const now = new Date().toISOString();
    const migratedTransactions: FinanceTransaction[] = [];
    const migratedAssets: FinanceAsset[] = [];
    legacy.transactions.forEach((item) => {
      const amount = Number(item.amount);
      if (!Number.isFinite(amount) || amount <= 0) return;
      if (item.type === "ASSET") {
        migratedAssets.push({
          id: String(item.id || `asset_${crypto.randomUUID()}`),
          name: String(item.description || item.category || "기존 자산"),
          category: String(item.category || "기타"),
          balance: amount,
          note: "기존 재무 장부에서 이전됨",
          createdAt: String(item.createdAt || now),
          updatedAt: now,
        });
        return;
      }
      const parsed = financeTransactionSchema.safeParse({
        id: String(item.id || `finance_${crypto.randomUUID()}`),
        type: item.type === "INCOME" ? "INCOME" : "EXPENSE",
        amount,
        category: String(item.category || "기타"),
        assetAccount: "현금",
        description: String(item.description || "기존 내역"),
        date: String(item.date || cleanMonth + "-01").slice(0, 10),
        createdAt: String(item.createdAt || now),
        updatedAt: now,
        isFixed: Boolean(item.isFixed),
        recurrence: "NONE",
        extraFields: [],
      });
      if (parsed.success) migratedTransactions.push(parsed.data);
    });
    await Promise.all([
      ...migratedTransactions.map((item) =>
        dbRemote.set(`users/${userId}/finance_transactions/${item.id}`, item)
      ),
      ...migratedAssets.map((item) =>
        dbRemote.set(`users/${userId}/finance_assets/${item.id}`, item)
      ),
    ]);
    transactions = migratedTransactions;
    assets = migratedAssets;
    if (!monthData && typeof legacy.monthlyBudget === "number") {
      monthData = {
        month: cleanMonth,
        monthlyBudget: legacy.monthlyBudget,
        memos: [],
      };
    }
  }
  const parsedMonth = financeMonthSchema.safeParse(monthData);
  const parsedPreferences = financePreferencesSchema.safeParse(preferences);
  const parsedTransactions = transactions
    .map((item) => financeTransactionSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
  const parsedMemos = memoDocuments
    .map((item) => financeMemoSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
  if (parsedMemos.length === 0 && parsedMonth.success && parsedMonth.data.memos.length > 0) {
    await Promise.all(
      parsedMonth.data.memos.map((memo) =>
        dbRemote.set(`users/${userId}/finance_memos/${memo.id}`, memo)
      )
    );
    memoDocuments = parsedMonth.data.memos;
  }

  return financeBookSchema.parse({
    month: cleanMonth,
    monthlyBudget: parsedMonth.success ? parsedMonth.data.monthlyBudget : 0,
    memos: (memoDocuments.length > 0 ? memoDocuments : parsedMemos)
      .map((item) => financeMemoSchema.safeParse(item))
      .filter((result) => result.success)
      .map((result) => result.data)
      .filter((item) => item.date.startsWith(cleanMonth)),
    transactions: parsedTransactions
      .filter((item) => item.date.startsWith(cleanMonth))
      .sort((left, right) => right.date.localeCompare(left.date)),
    assets: assets
      .map((item) => financeAssetSchema.safeParse(item))
      .filter((result) => result.success)
      .map((result) => ({
        ...result.data,
        balance: currentFinanceAssetBalance(result.data, parsedTransactions),
      })),
    ...(parsedPreferences.success ? parsedPreferences.data : defaultPreferences()),
  });
}

export interface CreateFinanceTransactionInput {
  type: FinanceTransaction["type"];
  amount: number;
  category: string;
  assetAccount: string;
  description: string;
  date: string;
  isFixed?: boolean;
  recurrence?: "NONE" | "MONTHLY";
  repeatMonths?: number;
  installmentMonths?: number;
  extraFields?: Array<{ label: string; value: string }>;
  imageUrl?: string;
}

export async function createFinanceTransactionAction(
  input: CreateFinanceTransactionInput
): Promise<FinanceTransaction[]> {
  const userId = await getSecureUserIdOrThrow();
  const repeatMonths = Math.max(1, Math.min(24, input.repeatMonths || 1));
  const installmentMonths = Math.max(1, Math.min(24, input.installmentMonths || 1));
  const count = installmentMonths > 1 ? installmentMonths : input.recurrence === "MONTHLY" ? repeatMonths : 1;
  const groupId = count > 1 ? `finance_group_${crypto.randomUUID()}` : undefined;
  const baseAmount = installmentMonths > 1 ? Math.floor(input.amount / installmentMonths) : input.amount;
  const remainder = installmentMonths > 1 ? input.amount - baseAmount * installmentMonths : 0;
  const now = new Date().toISOString();

  const transactions = Array.from({ length: count }, (_, index) =>
    financeTransactionSchema.parse({
      id: `finance_${crypto.randomUUID()}`,
      type: input.type,
      amount: baseAmount + (index === installmentMonths - 1 ? remainder : 0),
      category: input.category,
      assetAccount: input.assetAccount,
      description: input.description,
      date: addFinanceMonths(input.date, index),
      createdAt: now,
      updatedAt: now,
      isFixed: Boolean(input.isFixed),
      recurrence: input.recurrence || "NONE",
      recurrenceGroupId: groupId,
      installmentIndex: installmentMonths > 1 ? index + 1 : undefined,
      installmentTotal: installmentMonths > 1 ? installmentMonths : undefined,
      extraFields: input.extraFields || [],
      imageUrl: input.imageUrl,
    })
  );
  await dbRemote.batchSet(
    transactions.map((transaction) => ({
      path: `users/${userId}/finance_transactions/${transaction.id}`,
      data: transaction,
    })),
  );
  return transactions;
}

export type FinanceMutationScope = "ONE" | "SERIES";

export async function updateFinanceTransactionAction(
  id: string,
  updates: Partial<CreateFinanceTransactionInput>,
  scope: FinanceMutationScope = "ONE"
): Promise<void> {
  const userId = await getSecureUserIdOrThrow();
  const current = financeTransactionSchema.safeParse(
    await dbRemote.get(`users/${userId}/finance_transactions/${id}`)
  );
  if (!current.success) throw new Error("수정할 거래를 찾지 못했습니다.");
  const targets =
    scope === "SERIES" && current.data.recurrenceGroupId
      ? (await dbRemote.list<FinanceTransaction>(`users/${userId}/finance_transactions`))
          .filter((item) => item.recurrenceGroupId === current.data.recurrenceGroupId)
      : [current.data];
  const updatedTransactions = targets.map((target) =>
    financeTransactionSchema.parse({
          ...target,
          ...updates,
          id: target.id,
          date: scope === "SERIES" ? target.date : updates.date || target.date,
          updatedAt: new Date().toISOString(),
        }),
  );
  await dbRemote.batchSet(
    updatedTransactions.map((transaction) => ({
      path: `users/${userId}/finance_transactions/${transaction.id}`,
      data: transaction,
    })),
  );
}

export async function deleteFinanceTransactionAction(
  id: string,
  scope: FinanceMutationScope = "ONE"
): Promise<void> {
  const userId = await getSecureUserIdOrThrow();
  const current = await dbRemote.get<FinanceTransaction>(
    `users/${userId}/finance_transactions/${id}`
  );
  if (!current) throw new Error("삭제할 거래를 찾지 못했습니다.");
  const targets =
    scope === "SERIES" && current?.recurrenceGroupId
      ? (await dbRemote.list<FinanceTransaction>(`users/${userId}/finance_transactions`))
          .filter((item) => item.recurrenceGroupId === current.recurrenceGroupId)
      : current ? [current] : [];
  await dbRemote.batchDelete(
    targets.map((target) =>
      `users/${userId}/finance_transactions/${target.id}`
    ),
  );
}

export async function getFinanceStatisticsAction(
  startDate: string,
  endDate: string
): Promise<FinanceTransaction[]> {
  const userId = await getSecureUserIdOrThrow();
  const start = financeDateSchema.parse(startDate);
  const end = financeDateSchema.parse(endDate);
  if (start > end) throw new Error("시작일은 종료일보다 빨라야 합니다.");
  return (await dbRemote.range<FinanceTransaction>(
    `users/${userId}`,
    "finance_transactions",
    "date",
    start,
    end
  ))
    .map((item) => financeTransactionSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export async function saveFinanceBudgetAction(month: string, budget: number): Promise<void> {
  const userId = await getSecureUserIdOrThrow();
  const cleanMonth = monthSchema.parse(month);
  await dbRemote.patch(`users/${userId}/finance_months/${cleanMonth}`, {
    month: cleanMonth,
    monthlyBudget: Math.max(0, budget),
  });
}

export async function saveFinanceMemoAction(month: string, memo: FinanceMemo): Promise<FinanceMemo[]> {
  const userId = await getSecureUserIdOrThrow();
  const cleanMonth = monthSchema.parse(month);
  const cleanMemo = financeMemoSchema.parse(memo);
  if (!cleanMemo.date.startsWith(cleanMonth)) throw new Error("선택한 달의 날짜를 입력해 주세요.");
  await dbRemote.set(`users/${userId}/finance_memos/${cleanMemo.id}`, cleanMemo);
  return (await dbRemote.list<FinanceMemo>(`users/${userId}/finance_memos`))
    .filter((item) => item.date.startsWith(cleanMonth));
}

export async function deleteFinanceMemoAction(month: string, id: string): Promise<FinanceMemo[]> {
  const userId = await getSecureUserIdOrThrow();
  const cleanMonth = monthSchema.parse(month);
  await dbRemote.delete(`users/${userId}/finance_memos/${id}`);
  return (await dbRemote.list<FinanceMemo>(`users/${userId}/finance_memos`))
    .filter((item) => item.date.startsWith(cleanMonth));
}

export async function saveFinanceAssetAction(
  asset: FinanceAsset,
  resetBalance = false,
): Promise<FinanceAsset> {
  const userId = await getSecureUserIdOrThrow();
  const currentResult = financeAssetSchema.safeParse(
    await dbRemote.get<FinanceAsset>(
      `users/${userId}/finance_assets/${asset.id}`
    ),
  );
  const current = currentResult.success ? currentResult.data : null;
  const now = new Date().toISOString();
  const cleanAsset = financeAssetSchema.parse(
    prepareFinanceAsset(asset, current, resetBalance, now),
  );
  const renamedTransactions =
    current && current.name !== cleanAsset.name
      ? (await dbRemote.list<FinanceTransaction>(
          `users/${userId}/finance_transactions`,
        )).filter((transaction) => transaction.assetAccount === current.name)
      : [];
  await dbRemote.batchSet([
    {
      path: `users/${userId}/finance_assets/${cleanAsset.id}`,
      data: cleanAsset,
    },
    ...renamedTransactions.map((transaction) => ({
      path: `users/${userId}/finance_transactions/${transaction.id}`,
      data: {
          ...transaction,
          assetAccount: cleanAsset.name,
          updatedAt: now,
        },
    })),
  ]);
  return cleanAsset;
}

export async function deleteFinanceAssetAction(id: string): Promise<void> {
  const userId = await getSecureUserIdOrThrow();
  const current = await dbRemote.get<FinanceAsset>(
    `users/${userId}/finance_assets/${id}`,
  );
  if (!current) throw new Error("삭제할 자산을 찾지 못했습니다.");
  await dbRemote.delete(`users/${userId}/finance_assets/${id}`);
}

export async function saveFinancePreferencesAction(
  preferences: FinancePreferences
): Promise<FinancePreferences> {
  const userId = await getSecureUserIdOrThrow();
  const clean = financePreferencesSchema.parse(preferences);
  await dbRemote.set(`users/${userId}/finance_preferences/master_document`, clean);
  return clean;
}

// 구형 호출부가 남아 있어도 빈 장부로 안전하게 연결한다.
export async function getFinanceAction(): Promise<{ monthlyBudget: number; transactions: FinanceTransaction[] }> {
  const month = new Date().toISOString().slice(0, 7);
  const book = await getFinanceBookAction(month);
  return { monthlyBudget: book.monthlyBudget, transactions: book.transactions };
}
