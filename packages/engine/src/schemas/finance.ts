import { z } from "zod";

export const financeDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "유효한 날짜를 입력해 주세요.");

export const financeMonthValueSchema = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);

export const financeExtraFieldSchema = z.object({
  label: z.string().min(1),
  value: z.string(),
});

export const financeTransactionSchema = z.object({
  id: z.string(),
  type: z.enum(["INCOME", "EXPENSE"]),
  amount: z.number().positive(),
  category: z.string().min(1),
  assetAccount: z.string().min(1).default("현금"),
  description: z.string().min(1),
  date: financeDateSchema,
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  isFixed: z.boolean().default(false),
  recurrence: z.enum(["NONE", "MONTHLY"]).default("NONE"),
  recurrenceGroupId: z.string().optional(),
  installmentIndex: z.number().int().positive().optional(),
  installmentTotal: z.number().int().positive().optional(),
  extraFields: z.array(financeExtraFieldSchema).default([]),
  imageUrl: z.string().optional(),
});

export const financeAssetSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  category: z.string().min(1),
  balance: z.number(),
  note: z.string().default(""),
  createdAt: z.string(),
  updatedAt: z.string(),
  openingBalance: z.number().optional(),
  openingAt: z.string().optional(),
});

export const financeMemoSchema = z.object({
  id: z.string(),
  date: financeDateSchema,
  text: z.string().min(1),
  createdAt: z.string(),
});

export const financeMonthSchema = z.object({
  month: financeMonthValueSchema,
  monthlyBudget: z.number().min(0).default(0),
  memos: z.array(financeMemoSchema).default([]),
});

export const financePreferencesSchema = z.object({
  categories: z.array(z.string().min(1)),
  assetCategories: z.array(z.string().min(1)),
});

export const financeBookSchema = z.object({
  month: z.string(),
  monthlyBudget: z.number().min(0),
  transactions: z.array(financeTransactionSchema),
  assets: z.array(financeAssetSchema),
  memos: z.array(financeMemoSchema),
  categories: z.array(z.string()),
  assetCategories: z.array(z.string()),
});

export type FinanceTransaction = z.infer<typeof financeTransactionSchema>;
export type FinanceAsset = z.infer<typeof financeAssetSchema>;
export type FinanceMemo = z.infer<typeof financeMemoSchema>;
export type FinanceMonth = z.infer<typeof financeMonthSchema>;
export type FinancePreferences = z.infer<typeof financePreferencesSchema>;
export type FinanceBook = z.infer<typeof financeBookSchema>;

// 이전 장부를 읽기 위한 호환 타입
export type FinanceLedger = {
  monthlyBudget: number;
  transactions: FinanceTransaction[];
};
