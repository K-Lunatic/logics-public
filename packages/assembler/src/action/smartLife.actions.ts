"use server";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  financeTransactionSchema,
  livingItemSchema,
} from "@ink/engine";
import { getSecureUserIdOrThrow } from "../lib/authGuard";
import { listOwnInventoryAction } from "./inventory.action";
import { addSchedulesAction } from "./schedule.actions";
import {
  decryptServerSecret,
  readStoredUserSettings,
} from "../lib/userSecrets";
import { dbRemote } from "../adapters/dataStore";
import { formatSeoulDate } from "./systemToolCore";
import {
  consumeAiQuotaOrThrow,
  defaultRequestsPerMinute,
} from "../lib/aiRateLimit";
import { type SupportedAiModel } from "../aiSettings";

const visionItemSchema = z.object({
  name: z.string().min(1),
  domainType: z.enum([
    "FOOD",
    "MEDICINE",
    "CLOTHES",
    "BOOK",
    "HOUSEHOLD",
    "ETC",
  ]),
  quantity: z.number().min(0).default(1),
  unit: z.enum(["개", "알", "포", "g", "kg", "ml", "L", "장", "박스", "권"]).default("개"),
  expirationDate: z.string().nullable(),
  barcode: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

const receiptPreviewSchema = z.object({
  documentType: z.enum(["RECEIPT", "PRODUCT", "BARCODE", "OTHER"]),
  merchant: z.string().nullable(),
  warnings: z.array(z.string()).max(10),
  finance: z.object({
    amount: z.number().positive(),
    category: z.string().min(1),
    assetAccount: z.string().default("카드"),
    description: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    confidence: z.number().min(0).max(1),
  }).nullable(),
  items: z.array(visionItemSchema).max(80),
});

const receiptCommitSchema = z.object({
  finance: receiptPreviewSchema.shape.finance
    .unwrap()
    .omit({ confidence: true })
    .nullable(),
  items: z.array(visionItemSchema.omit({ confidence: true })).max(80),
}).refine(
  (value) => value.finance !== null || value.items.length > 0,
  "저장할 재무 내역이나 물품을 하나 이상 선택해 주세요.",
);

export type ReceiptPreview = z.infer<typeof receiptPreviewSchema>;
export type ReceiptCommitInput = z.infer<typeof receiptCommitSchema>;

const recipeSchema = z.object({
  title: z.string(),
  minutes: z.number().min(1).max(15),
  reason: z.string(),
  ingredients: z.array(
    z.object({
      name: z.string(),
      amount: z.string(),
    })
  ),
  steps: z.array(z.string()).min(2).max(8),
});

const sprintSchema = z.object({
  sprints: z
    .array(
      z.object({
        week: z.number().int().min(1).max(11),
        title: z.string(),
        description: z.string(),
      })
    )
    .length(6),
});

async function getGoogleModel(userId: string) {
  const settings = await readStoredUserSettings(userId);
  const personalApiKey = decryptServerSecret(
    settings?.encryptedSecrets?.geminiApiKey,
  );
  const apiKey =
    personalApiKey ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("Gemini API 키가 설정되지 않았습니다.");
  const google = createGoogleGenerativeAI({ apiKey });
  const modelId = (personalApiKey
    ? settings?.aiModel || "gemini-3.5-flash-lite"
    : process.env.GOOGLE_VISION_MODEL || "gemini-3.5-flash-lite") as SupportedAiModel;
  const requestsPerMinute =
    personalApiKey
      ? settings?.aiRequestsPerMinute ?? defaultRequestsPerMinute(modelId)
      : process.env.GOOGLE_VISION_REQUESTS_PER_MINUTE ??
        defaultRequestsPerMinute(modelId);
  return { model: google(modelId), modelId, requestsPerMinute };
}

export async function analyzeReceiptImageAction(imageDataUrl: string) {
  const userId = await getSecureUserIdOrThrow();
  if (
    !/^data:image\/(jpeg|png|webp);base64,/.test(imageDataUrl) ||
    imageDataUrl.length > 5_500_000
  ) {
    return { success: false as const, error: "JPG, PNG, WEBP 이미지를 4MB 이하로 올려 주세요." };
  }

  try {
    const { model, modelId, requestsPerMinute } = await getGoogleModel(userId);
    consumeAiQuotaOrThrow({ userId, modelId, requestsPerMinute });
    const { output } = await generateText({
      model,
      output: Output.object({
        schema: receiptPreviewSchema,
      }),
      system:
        `영수증·상품·바코드 사진을 재무와 물품 후보로 분리하는 검수용 분석기다.
- 식당, 카페, 서비스 영수증은 finance만 만들고 items는 비운다.
- 마트·편의점 영수증은 결제 총액 finance와 실제 구매 상품 items를 함께 만든다.
- 단일 상품·바코드 사진은 items만 만들고 가격이 명확하지 않으면 finance는 null이다.
- 상호명, 합계, 세금, 할인, 봉사료는 물품으로 만들지 않는다.
- 날짜·금액·상품명이 불명확하면 추측하지 말고 warnings에 한국어로 적는다.
- 보이지 않는 유통기한과 바코드는 null로 두고 confidence를 낮춘다.
- 지출 분류는 식비, 교통/차량, 문화생활, 마트/편의점, 패션/미용, 생활용품, 주거/통신, 건강, 교육, 경조사비/회비, 이체, 부모님, 기타 중 고른다.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "사진을 분석해 저장 전 검수할 재무 내역과 물품 후보를 구조화해 줘. 같은 품목의 수량은 합치고 한국어 상품명을 사용해.",
            },
            { type: "image", image: imageDataUrl },
          ],
        },
      ],
      timeout: { totalMs: 120_000 },
    });

    return { success: true as const, data: output };
  } catch (error) {
    console.error("이미지 물품 추출 실패:", error);
    return {
      success: false as const,
      error: "사진을 분석하지 못했습니다. 글자가 선명한 사진으로 다시 시도해 주세요.",
    };
  }
}

export async function commitReceiptReviewAction(input: ReceiptCommitInput) {
  const userId = await getSecureUserIdOrThrow();
  const parsed = receiptCommitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0]?.message || "검수 내용이 올바르지 않습니다.",
    };
  }

  try {
    const now = new Date().toISOString();
    const items = parsed.data.items.map((entry) => {
      const defaults =
        entry.domainType === "FOOD"
          ? { storageCondition: "ROOM", isOpened: false, openedDate: null, category: "INGREDIENT", expirationDate: entry.expirationDate || "" }
          : entry.domainType === "MEDICINE"
            ? { type: "ORAL", form: "TABLET", efficacy: "", sideEffects: [], dosage: "", expirationDate: entry.expirationDate || "" }
            : entry.domainType === "CLOTHES"
              ? { category: "TOP", season: ["ALL"], thickness: "NORMAL", lastWornDate: null, isDirty: false, laundryCycleDays: 7 }
              : entry.domainType === "BOOK"
                ? { author: "", readingStatus: "UNREAD" }
                : {};
      return livingItemSchema.parse({
        id: `item_${crypto.randomUUID()}`,
        ...entry,
        ...defaults,
        sku: entry.barcode || undefined,
        locationId: null,
        status: "STORED",
        tags: [],
        createdAt: now,
        updatedAt: now,
        lastModifiedBy: userId,
        lastModifiedByName: "영수증 검수",
        lastModifiedAt: now,
      });
    });
    const transactions = parsed.data.finance
      ? [financeTransactionSchema.parse({
          id: `finance_${crypto.randomUUID()}`,
          type: "EXPENSE",
          ...parsed.data.finance,
          createdAt: now,
          updatedAt: now,
          isFixed: false,
          recurrence: "NONE",
          extraFields: [],
        })]
      : [];

    await dbRemote.batchSet([
      ...items.map((item) => ({
        path: `users/${userId}/inventory_items/${item.id}`,
        data: item,
      })),
      ...transactions.map((transaction) => ({
        path: `users/${userId}/finance_transactions/${transaction.id}`,
        data: transaction,
      })),
    ]);
    return {
      success: true as const,
      data: { items, transactions },
    };
  } catch (error) {
    console.error("영수증 검수 저장 실패:", error);
    return {
      success: false as const,
      error: "검수한 내용을 저장하지 못했습니다.",
    };
  }
}

export async function generateRescueRecipeAction() {
  const userId = await getSecureUserIdOrThrow();
  const now = new Date();
  const limit = new Date(now);
  limit.setDate(limit.getDate() + 3);
  const todayString = formatSeoulDate(now);
  const limitString = formatSeoulDate(limit);
  const urgentFoods = (await listOwnInventoryAction()).filter((item) => {
    if (item.domainType !== "FOOD" || !item.expirationDate) return false;
    const expiryString = item.expirationDate.slice(0, 10);
    return expiryString >= todayString && expiryString <= limitString;
  });
  if (urgentFoods.length === 0) {
    return { success: false as const, error: "3일 안에 소비해야 할 식품이 없습니다." };
  }

  try {
    const { model, modelId, requestsPerMinute } = await getGoogleModel(userId);
    consumeAiQuotaOrThrow({ userId, modelId, requestsPerMinute });
    const { output } = await generateText({
      model,
      output: Output.object({ schema: recipeSchema }),
      system:
        "한국 1인 가구를 위한 15분 요리 전문가다. 임박 재료를 우선 사용하고, 일반적인 양념만 추가로 허용한다.",
      prompt: `다음 재료로 15분 안에 만들 수 있는 한 끼를 제안해 줘: ${JSON.stringify(
        urgentFoods.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          expirationDate: item.expirationDate,
        }))
      )}`,
      timeout: { totalMs: 60_000 },
    });
    return { success: true as const, data: output };
  } catch (error) {
    console.error("임박 식재료 레시피 생성 실패:", error);
    return { success: false as const, error: "레시피를 만들지 못했습니다." };
  }
}

export async function createProgressiveGoalAction(
  goal: string,
  targetDate?: string
) {
  const userId = await getSecureUserIdOrThrow();
  if (!goal.trim()) return { success: false as const, error: "목표를 입력해 주세요." };
  const target = targetDate ? new Date(targetDate) : new Date(Date.now() + 84 * 86_400_000);
  if (Number.isNaN(target.getTime()) || target <= new Date()) {
    return { success: false as const, error: "목표일은 오늘 이후여야 합니다." };
  }

  try {
    const { model, modelId, requestsPerMinute } = await getGoogleModel(userId);
    consumeAiQuotaOrThrow({ userId, modelId, requestsPerMinute });
    const { output } = await generateText({
      model,
      output: Output.object({ schema: sprintSchema }),
      system:
        "장기 목표를 실행 가능한 6개의 2주 스프린트로 역산하는 코치다. 앞 단계의 결과가 다음 단계의 기반이 되게 한다.",
      prompt: `목표: ${goal.trim()}\n목표일: ${target.toISOString().slice(0, 10)}\n각 스프린트의 week는 1,3,5,7,9,11 중 하나로 작성해.`,
      timeout: { totalMs: 60_000 },
    });

    const start = new Date();
    const events = output.sprints.map((sprint, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index * 14);
      const dateString = formatSeoulDate(date);
      return {
        id: `goal_${Date.now()}_${index}`,
        title: `${index + 1}/6 ${sprint.title}`,
        startDate: dateString,
        endDate: dateString,
        category: "PERSONAL" as const,
        colorClass: "bg-emerald-600 text-white",
        isUserDefined: true,
        note: sprint.description,
      };
    });
    const result = await addSchedulesAction(events);
    if (!result.success) return result;
    return { success: true as const, data: events };
  } catch (error) {
    console.error("목표 스프린트 생성 실패:", error);
    return { success: false as const, error: "목표 계획을 만들지 못했습니다." };
  }
}
