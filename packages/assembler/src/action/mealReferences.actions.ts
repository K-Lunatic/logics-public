"use server";

import {
  mealFeedbackSchema,
  type MealFeedback,
} from "@ink/engine";
import { z } from "zod";
import { dbRemote } from "../adapters/dataStore";
import { getSecureUserIdOrThrow } from "../lib/authGuard";
import { findRecipeReferencesForUser } from "../lib/mealReferences";
import { getMealPlanAction } from "./life.actions";

export async function searchExternalRecipesAction(rawInput: unknown) {
  try {
    const userId = await getSecureUserIdOrThrow();
    const input = z.object({
      query: z.string().trim().min(1).max(200),
      limit: z.number().int().min(1).max(10).default(6),
    }).parse(rawInput);
    const references = await findRecipeReferencesForUser(userId, input.query, input.limit);
    const fallback = references.some((reference) =>
      /google\.com\/search|youtube\.com\/results|10000recipe\.com\/recipe\/list/.test(reference.url)
    );
    return {
      success: true as const,
      data: references,
      warning: fallback
        ? "Gemini 할당량이 부족해 무료 이미지·검색 링크로 대신 찾았습니다."
        : undefined,
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "외부 레시피를 찾지 못했습니다.",
    };
  }
}

export async function listMealFeedbackAction(mealId?: string): Promise<MealFeedback[]> {
  const userId = await getSecureUserIdOrThrow();
  const feedback = (await dbRemote.list<unknown>(`users/${userId}/meal_feedback`))
    .flatMap((value) => {
      const parsed = mealFeedbackSchema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    });
  return feedback
    .filter((item) => !mealId || item.mealId === mealId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveMealFeedbackAction(rawInput: unknown) {
  try {
    const userId = await getSecureUserIdOrThrow();
    const input = z.object({
      mealId: z.string().min(1),
      rating: z.number().int().min(1).max(5),
      tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
      comment: z.string().trim().max(1000).optional(),
    }).parse(rawInput);
    const meal = await getMealPlanAction(input.mealId);
    if (!meal) return { success: false as const, error: "평가할 식단을 찾지 못했습니다." };
    const path = `users/${userId}/meal_feedback/feedback_${meal.id}`;
    const current = mealFeedbackSchema.safeParse(await dbRemote.get<unknown>(path));
    const now = new Date().toISOString();
    const feedback = mealFeedbackSchema.parse({
      ...input,
      id: `feedback_${meal.id}`,
      mealTitle: meal.title,
      createdAt: current.success ? current.data.createdAt : now,
      updatedAt: now,
    });
    await dbRemote.set(path, feedback);
    return { success: true as const, data: feedback };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "식단 평가를 저장하지 못했습니다.",
    };
  }
}
