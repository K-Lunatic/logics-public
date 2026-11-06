"use server";

import { generateText, Output } from "ai";
import { z } from "zod";
import { mealFeedbackSchema, mealPlanSchema, type MealPlan } from "@ink/engine";
import { dbRemote } from "../adapters/dataStore";
import { getSecureUserIdOrThrow } from "../lib/authGuard";
import {
  estimateMealNutritionForUser,
  getLifestyleModel,
} from "../lib/mealNutrition";
import { consumeAiQuotaOrThrow } from "../lib/aiRateLimit";
import { localRecipeMarkdown } from "../lib/mealRecipeMarkdown";
import { getFinanceBookAction } from "./finance.actions";
import {
  getHealthProfileAction,
  listHealthMeasurementsAction,
  listMealPlansAction,
} from "./life.actions";
import { listOwnInventoryAction } from "./inventory.action";
import { listOwnScheduleAction } from "./schedule.actions";

const planInputSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.number().int().min(1).max(14).default(7),
  mealsPerDay: z.number().int().min(1).max(3).default(3),
  goal: z.string().max(500).optional(),
  preferences: z.string().max(500).optional(),
  maxBudget: z.number().nonnegative().optional(),
});

const generatedMealSchema = mealPlanSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

const generatedPlanSchema = z.object({
  meals: z.array(generatedMealSchema).max(42),
  summary: z.string(),
});

const organizedRecipeSchema = z.object({
  markdown: z.string().min(1),
  ingredients: z.array(z.string()).max(50),
});

export async function organizeMealRecipeAction(rawInput: unknown) {
  const input = z.object({
    title: z.string().trim().min(1).max(200),
    ingredients: z.array(z.string().trim().min(1)).max(50).default([]),
    recipe: z.string().max(10_000).optional(),
  }).parse(rawInput);
  try {
    const userId = await getSecureUserIdOrThrow();
    const { model, modelId, requestsPerMinute } = await getLifestyleModel(userId);
    consumeAiQuotaOrThrow({ userId, modelId, requestsPerMinute });
    const { output } = await generateText({
      model,
      maxRetries: 0,
      output: Output.object({ schema: organizedRecipeSchema }),
      system: `사용자가 입력한 레시피를 읽기 쉬운 한국어 Markdown으로 정리한다.
- 제목, 재료 표, 번호가 있는 조리 순서, 필요한 경우 팁과 보관법을 포함한다.
- 입력에 없는 분량·시간·온도는 꾸며내지 말고 "확인 필요"로 표시한다.
- Markdown 이미지 문법은 사용자가 이미지 URL을 제공한 경우에만 유지한다.`,
      prompt: JSON.stringify(input),
    });
    return { success: true as const, data: output, fallback: false };
  } catch {
    return {
      success: true as const,
      data: {
        markdown: localRecipeMarkdown(input),
        ingredients: input.ingredients,
      },
      fallback: true,
      warning: "AI를 사용할 수 없어 입력한 내용을 기본 Markdown 형식으로 정리했습니다.",
    };
  }
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00+09:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export async function estimateMealNutritionAction(input: {
  title: string;
  ingredients?: string[];
  recipe?: string;
  servingDescription?: string;
}) {
  try {
    const userId = await getSecureUserIdOrThrow();
    const clean = z.object({
      title: z.string().trim().min(1),
      ingredients: z.array(z.string()).default([]),
      recipe: z.string().optional(),
      servingDescription: z.string().optional(),
    }).parse(input);
    return {
      success: true as const,
      data: await estimateMealNutritionForUser(userId, clean),
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "영양소를 추정하지 못했습니다.",
    };
  }
}

export async function generatePersonalMealPlanAction(rawInput: unknown) {
  try {
    const userId = await getSecureUserIdOrThrow();
    const input = planInputSchema.parse(rawInput);
    const endDate = addDays(input.startDate, input.days - 1);
    const month = input.startDate.slice(0, 7);
    const [inventory, schedules, finance, profile, measurements, mealHistory, feedbackValues] =
      await Promise.all([
        listOwnInventoryAction(),
        listOwnScheduleAction(),
        getFinanceBookAction(month),
        getHealthProfileAction(),
        listHealthMeasurementsAction(),
        listMealPlansAction(addDays(input.startDate, -30), addDays(input.startDate, -1)),
        dbRemote.list<unknown>(`users/${userId}/meal_feedback`),
      ]);
    const feedback = feedbackValues.flatMap((value) => {
      const parsed = mealFeedbackSchema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 60);
    const foods = inventory
      .filter((item) => item.domainType === "FOOD" && item.quantity > 0)
      .sort((left, right) =>
        String(left.expirationDate || "9999").localeCompare(String(right.expirationDate || "9999")),
      )
      .slice(0, 60);
    const rangeSchedules = schedules
      .filter((item) => item.startDate <= endDate && item.endDate >= input.startDate)
      .slice(0, 80);
    const missingInformation = [
      !input.goal && "식단 목표",
      !input.preferences && mealHistory.length === 0 && "선호·기피 음식",
      !profile.recommendedCalories && "일일 권장 섭취 열량",
      measurements.length === 0 && "최근 체성분",
      foods.length === 0 && "사용 가능한 식품 재고",
      finance.transactions.length === 0 && !input.maxBudget && "식비 사용 내역 또는 예산",
      rangeSchedules.length === 0 && "기간 내 일정",
    ].filter((value): value is string => Boolean(value));
    const expectedCount = input.days * input.mealsPerDay;
    const {
      model,
      modelId,
      requestsPerMinute,
      profile: modelProfile,
    } = await getLifestyleModel(userId);
    let generated: z.infer<typeof generatedPlanSchema> | null = null;

    for (let attempt = 0; attempt <= modelProfile.recoveryPasses + 1; attempt += 1) {
      consumeAiQuotaOrThrow({ userId, modelId, requestsPerMinute });
      const generation = await generateText({
        model,
        output: Output.object({ schema: generatedPlanSchema }),
        system: `사용자의 일정·재무·건강·재고를 함께 고려하는 한국식 식단 플래너다.
- ${input.startDate}부터 ${endDate}까지 날짜별 정확히 ${input.mealsPerDay}끼, 총 ${expectedCount}개를 만든다.
- 소비기한이 가까운 재고를 먼저 사용하고 가능한 재고를 빠뜨리지 않는다.
- 과거 mealFeedback의 높은 별점·긍정 태그는 선호하고 낮은 별점·부정 태그·메모는 피한다.
- 일정이 바쁜 날은 짧은 조리나 외식·배달을 배치한다.
- HOME이면 구체적인 recipe와 ingredients를, RESTAURANT/DELIVERY면 restaurantName 후보와 선택 이유를 적는다.
- 각 식단에 탄수화물·단백질·지방·열량 예상치를 넣고 estimated=true로 표시한다.
- 없는 정보는 추측해 채우되 결과 자체는 만들고 과도한 건강 효능을 주장하지 않는다.`,
        prompt: JSON.stringify({
          request: input,
          exactMealCount: expectedCount,
          missingInformation,
          health: { profile, latest: measurements[0] || null },
          finance: {
            monthlyBudget: input.maxBudget ?? finance.monthlyBudget,
            recentFoodExpenses: finance.transactions
              .filter((item) => item.type === "EXPENSE" && /식비|마트|편의점/.test(item.category))
              .slice(0, 30),
          },
          schedules: rangeSchedules,
          inventory: foods,
          recentMeals: mealHistory.slice(-30),
          mealFeedback: feedback.map(({ mealTitle, rating, tags, comment }) => ({
            mealTitle,
            rating,
            tags,
            comment,
          })),
        }),
      });
      generated = generation.output;
      if (generation.output.meals.length === expectedCount) break;
    }

    if (!generated || generated.meals.length !== expectedCount) {
      return {
        success: false as const,
        error: `식단 ${expectedCount}개 중 ${generated?.meals.length || 0}개만 생성되어 저장하지 않았습니다.`,
        missingInformation,
      };
    }

    const now = new Date().toISOString();
    const meals: MealPlan[] = generated.meals.map((meal) => mealPlanSchema.parse({
      ...meal,
      id: `meal_${crypto.randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    }));
    await dbRemote.batchSet(meals.map((meal) => ({
      path: `users/${userId}/meal_plans/${meal.id}`,
      data: meal,
    })));
    return {
      success: true as const,
      data: meals,
      summary: generated.summary,
      missingInformation,
      warning: missingInformation.length
        ? `부족한 정보: ${missingInformation.join(", ")}`
        : undefined,
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "맞춤 식단을 생성하지 못했습니다.",
    };
  }
}
