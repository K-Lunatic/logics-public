"use server";

import { createHash } from "node:crypto";
import {
  careLogSchema,
  careRoutineSchema,
  calculateBmi,
  healthMeasurementSchema,
  healthProfileSchema,
  mealPlanSchema,
  pendingCareOccurrences,
  type CareLog,
  type CareRoutine,
  type HealthMeasurement,
  type HealthProfile,
  type MealPlan,
} from "@ink/engine";
import { z } from "zod";
import { dbRemote } from "../adapters/dataStore";
import { getSecureUserIdOrThrow } from "../lib/authGuard";
import { estimateMealNutritionForUser } from "../lib/mealNutrition";

const dateRangeSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine(({ start, end }) => start <= end, "시작일은 종료일보다 늦을 수 없습니다.");

const cleanDocuments = <T,>(documents: unknown[], schema: z.ZodType<T>) =>
  documents.flatMap((document) => {
    const parsed = schema.safeParse(document);
    return parsed.success ? [parsed.data] : [];
  });

export async function listMealPlansAction(start: string, end: string): Promise<MealPlan[]> {
  const userId = await getSecureUserIdOrThrow();
  const range = dateRangeSchema.parse({ start, end });
  // ponytail: 월 100건 미만 전제의 단순 조회. 식단이 수천 건을 넘으면 date range query로 교체.
  const meals = cleanDocuments(
    await dbRemote.list<unknown>(`users/${userId}/meal_plans`),
    mealPlanSchema,
  );
  return meals
    .filter((meal) => meal.date >= range.start && meal.date <= range.end)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export async function getMealPlanAction(id: string): Promise<MealPlan | null> {
  const userId = await getSecureUserIdOrThrow();
  const cleanId = z.string().min(1).parse(id);
  const parsed = mealPlanSchema.safeParse(
    await dbRemote.get<unknown>(`users/${userId}/meal_plans/${cleanId}`),
  );
  return parsed.success ? parsed.data : null;
}

export async function saveMealPlanAction(
  input: Omit<MealPlan, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<{ success: true; data: MealPlan } | { success: false; error: string }> {
  try {
    const userId = await getSecureUserIdOrThrow();
    const now = new Date().toISOString();
    const current = input.id
      ? await dbRemote.get<MealPlan>(`users/${userId}/meal_plans/${input.id}`)
      : null;
    let nutrition = input.nutrition;
    if (
      nutrition.calories === 0 &&
      nutrition.carbohydrate === 0 &&
      nutrition.protein === 0 &&
      nutrition.fat === 0
    ) {
      try {
        const estimate = await estimateMealNutritionForUser(userId, {
          title: input.title,
          ingredients: input.ingredients,
          recipe: input.recipe,
        });
        nutrition = {
          calories: estimate.calories,
          carbohydrate: estimate.carbohydrate,
          protein: estimate.protein,
          fat: estimate.fat,
          estimated: true,
          confidence: estimate.confidence,
          estimateNote: estimate.basis,
          missingInformation: estimate.missingInformation,
        };
      } catch (error) {
        nutrition = {
          ...nutrition,
          estimated: true,
          confidence: "LOW",
          estimateNote: "AI 영양 추정을 실행하지 못해 0으로 저장했습니다.",
          missingInformation: [
            error instanceof Error ? error.message : "영양 추정 API 오류",
          ],
        };
      }
    }
    const meal = mealPlanSchema.parse({
      ...input,
      nutrition,
      id: input.id || `meal_${crypto.randomUUID()}`,
      createdAt: current?.createdAt || now,
      updatedAt: now,
    });
    await dbRemote.set(`users/${userId}/meal_plans/${meal.id}`, meal);
    return { success: true, data: meal };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "식단을 저장하지 못했습니다.",
    };
  }
}

export async function deleteMealPlanAction(id: string) {
  try {
    const userId = await getSecureUserIdOrThrow();
    const cleanId = z.string().min(1).parse(id);
    await dbRemote.delete(`users/${userId}/meal_plans/${cleanId}`);
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "식단을 삭제하지 못했습니다.",
    };
  }
}

export async function listHealthMeasurementsAction(): Promise<HealthMeasurement[]> {
  const userId = await getSecureUserIdOrThrow();
  return cleanDocuments(
    await dbRemote.list<unknown>(`users/${userId}/health_measurements`),
    healthMeasurementSchema,
  ).sort((left, right) => right.date.localeCompare(left.date));
}

export async function getHealthProfileAction(): Promise<HealthProfile> {
  const userId = await getSecureUserIdOrThrow();
  const profile = await dbRemote.get<unknown>(
    `users/${userId}/health_profile/master_document`,
  );
  const parsed = healthProfileSchema.safeParse(profile);
  return parsed.success ? parsed.data : { updatedAt: new Date(0).toISOString() };
}

export async function saveHealthProfileAction(
  input: Omit<HealthProfile, "updatedAt">,
) {
  try {
    const userId = await getSecureUserIdOrThrow();
    const profile = healthProfileSchema.parse({
      ...input,
      updatedAt: new Date().toISOString(),
    });
    await dbRemote.set(`users/${userId}/health_profile/master_document`, profile);
    return { success: true as const, data: profile };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "건강 기준 정보를 저장하지 못했습니다.",
    };
  }
}

export async function saveHealthMeasurementAction(
  input: Omit<HealthMeasurement, "id" | "createdAt" | "updatedAt">,
) {
  try {
    const userId = await getSecureUserIdOrThrow();
    const now = new Date().toISOString();
    const id = input.externalId
      ? `health_${createHash("sha256").update(`${input.source}:${input.externalId}`).digest("hex").slice(0, 24)}`
      : `health_${input.date}`;
    const [current, profileValue] = await Promise.all([
      dbRemote.get<HealthMeasurement>(`users/${userId}/health_measurements/${id}`),
      dbRemote.get<unknown>(`users/${userId}/health_profile/master_document`),
    ]);
    const profile = healthProfileSchema.safeParse(profileValue);
    const heightCm = input.heightCm || (profile.success ? profile.data.heightCm : undefined);
    const measurement = healthMeasurementSchema.parse({
      ...input,
      heightCm,
      bmi: input.bmi ?? calculateBmi(input.weightKg, heightCm),
      id,
      createdAt: current?.createdAt || now,
      updatedAt: now,
    });
    await dbRemote.set(`users/${userId}/health_measurements/${id}`, measurement);
    return { success: true as const, data: measurement };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "건강 기록을 저장하지 못했습니다.",
    };
  }
}

export async function listCareRoutinesAction(): Promise<CareRoutine[]> {
  const userId = await getSecureUserIdOrThrow();
  return cleanDocuments(
    await dbRemote.list<unknown>(`users/${userId}/care_routines`),
    careRoutineSchema,
  );
}

export async function saveCareRoutineAction(
  input: Omit<CareRoutine, "id" | "createdAt" | "updatedAt"> & { id?: string },
) {
  try {
    const userId = await getSecureUserIdOrThrow();
    const now = new Date().toISOString();
    const current = input.id
      ? await dbRemote.get<CareRoutine>(`users/${userId}/care_routines/${input.id}`)
      : null;
    const routine = careRoutineSchema.parse({
      ...input,
      id: input.id || `care_${crypto.randomUUID()}`,
      createdAt: current?.createdAt || now,
      updatedAt: now,
    });
    await dbRemote.set(`users/${userId}/care_routines/${routine.id}`, routine);
    return { success: true as const, data: routine };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "건강 행동을 저장하지 못했습니다.",
    };
  }
}

export async function listPendingCareAction(nowIso = new Date().toISOString()) {
  const userId = await getSecureUserIdOrThrow();
  const [routines, logs] = await Promise.all([
    dbRemote.list<unknown>(`users/${userId}/care_routines`),
    dbRemote.list<unknown>(`users/${userId}/care_logs`),
  ]);
  return pendingCareOccurrences(
    cleanDocuments(routines, careRoutineSchema),
    cleanDocuments(logs, careLogSchema),
    new Date(nowIso),
  );
}

export async function resolveCareOccurrenceAction(
  occurrence: { id: string; routineId: string; scheduledAt: string },
  status: CareLog["status"],
) {
  try {
    const userId = await getSecureUserIdOrThrow();
    const log = careLogSchema.parse({
      ...occurrence,
      status,
      resolvedAt: new Date().toISOString(),
    });
    await dbRemote.set(`users/${userId}/care_logs/${log.id}`, log);
    return { success: true as const, data: log };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "건강 행동을 기록하지 못했습니다.",
    };
  }
}
