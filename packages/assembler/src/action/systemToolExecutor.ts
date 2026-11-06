"use server";

import { z } from "zod";
import {
  careRoutineSchema,
  healthMeasurementSchema,
  recipeReferenceSchema,
  type AIMasterSchedulePayload,
  type LivingItemPayload,
} from "@ink/engine";
import {
  createItemAction,
  createItemsAction,
  deleteInventoryItemAction,
  listOwnInventoryAction,
  updateInventoryItemAction,
} from "./inventory.action";
import {
  addScheduleAction,
  addSchedulesAction,
  deleteScheduleAction,
  listOwnScheduleAction,
  updateScheduleAction,
} from "./schedule.actions";
import {
  createFinanceTransactionAction,
  deleteFinanceAssetAction,
  deleteFinanceTransactionAction,
  getFinanceBookAction,
  saveFinanceAssetAction,
  saveFinanceBudgetAction,
  updateFinanceTransactionAction,
} from "./finance.actions";
import { runServerWeatherSync } from "./weather.actions";
import {
  deleteMealPlanAction,
  getHealthProfileAction,
  getMealPlanAction,
  listCareRoutinesAction,
  listHealthMeasurementsAction,
  listMealPlansAction,
  listPendingCareAction,
  resolveCareOccurrenceAction,
  saveCareRoutineAction,
  saveHealthMeasurementAction,
  saveHealthProfileAction,
  saveMealPlanAction,
} from "./life.actions";
import {
  estimateMealNutritionAction,
  generatePersonalMealPlanAction,
} from "./mealAI.actions";
import {
  listMealFeedbackAction,
  saveMealFeedbackAction,
  searchExternalRecipesAction,
} from "./mealReferences.actions";
import {
  completeInventoryDomain,
  findExactToolTarget,
  formatSeoulDate,
  hasToolUpdate,
} from "./systemToolCore";

const idInput = z.object({ id: z.string().trim().min(1) });
const inventoryInput = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().min(0).default(1),
  unit: z.enum(["개", "알", "포", "g", "kg", "ml", "L", "장", "박스", "권"]).default("개"),
  domainType: z.enum(["FOOD", "MEDICINE", "CLOTHES", "BOOK", "HOUSEHOLD", "ETC"]).default("ETC"),
  location: z.string().optional(),
  expirationDate: z.string().optional(),
  sku: z.string().optional(),
});
const inventoryUpdateInput = inventoryInput.partial().extend({
  id: z.string().trim().min(1),
});
const scheduleInput = z.object({
  title: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  category: z.enum(["WORK", "UTILITY", "PERSONAL", "HOLIDAY", "GLOBAL"]).default("PERSONAL"),
  note: z.string().optional(),
});
const scheduleUpdateInput = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  category: z.enum(["WORK", "UTILITY", "PERSONAL", "HOLIDAY", "GLOBAL"]).optional(),
  note: z.string().optional(),
}).refine(
  (input) => hasToolUpdate(input),
  "변경할 일정 속성을 하나 이상 입력해 주세요.",
);
const financeInput = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  amount: z.number().positive(),
  category: z.string().trim().min(1),
  assetAccount: z.string().trim().min(1).default("현금"),
  description: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isFixed: z.boolean().optional(),
});
const mealInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealType: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]),
  title: z.string().trim().min(1),
  sourceType: z.enum(["HOME", "RESTAURANT", "DELIVERY"]),
  restaurantName: z.string().optional(),
  restaurantAddress: z.string().optional(),
  recipe: z.string().optional(),
  ingredients: z.array(z.string()).default([]),
  calories: z.number().nonnegative().default(0),
  carbohydrate: z.number().nonnegative().default(0),
  protein: z.number().nonnegative().default(0),
  fat: z.number().nonnegative().default(0),
});
const mealUpdateInput = mealInput.partial().extend({
  id: z.string().trim().min(1),
}).refine((input) => hasToolUpdate(input), "변경할 식단 속성을 하나 이상 입력해 주세요.");
const healthMeasurementInput = healthMeasurementSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

function scheduleEvent(input: z.infer<typeof scheduleInput>) {
  const date = input.date || formatSeoulDate();
  const colors = {
    WORK: "bg-blue-600 text-white",
    UTILITY: "bg-amber-600 text-white",
    PERSONAL: "bg-emerald-600 text-white",
    HOLIDAY: "bg-rose-600 text-white",
    GLOBAL: "bg-purple-600 text-white",
  };
  return {
    id: `evt-${crypto.randomUUID()}`,
    title: input.title,
    startDate: date,
    endDate: date,
    category: input.category,
    colorClass: colors[input.category],
    isUserDefined: true,
    ...(input.startTime ? { startTime: input.startTime } : {}),
    ...(input.endTime ? { endTime: input.endTime } : {}),
    ...(input.note ? { note: input.note } : {}),
  } as AIMasterSchedulePayload["monthEvents"][number];
}

export async function executeSystemTool(
  toolId: string,
  rawInputs: Record<string, unknown>,
): Promise<unknown> {
  if (toolId === "sys-environment-get-weather") {
    const input = z.object({
      city: z.string().trim().min(1),
      date: z.string().optional(),
      time: z.string().optional(),
    }).parse(rawInputs);
    return runServerWeatherSync(input.city, { date: input.date, time: input.time });
  }

  if (toolId.startsWith("sys-inventory-")) {
    if (toolId === "sys-inventory-add") {
      return createItemAction(inventoryInput.parse(rawInputs));
    }
    if (toolId === "sys-inventory-batch-add") {
      const { items } = z.object({
        items: z.array(inventoryInput).min(1).max(80),
      }).parse(rawInputs);
      return createItemsAction(items);
    }
    const inventory = await listOwnInventoryAction();
    if (toolId === "sys-inventory-list") return inventory;
    if (toolId === "sys-inventory-get") {
      const { id } = idInput.parse(rawInputs);
      const item = findExactToolTarget(inventory, id);
      return item
        ? { success: true, item }
        : { success: false, message: "물품을 찾지 못했습니다." };
    }
    if (toolId === "sys-inventory-update") {
      const { id, ...updates } = inventoryUpdateInput.parse(rawInputs);
      const item = findExactToolTarget(inventory, id);
      if (!item) return { success: false, message: "물품을 찾지 못했습니다." };
      return updateInventoryItemAction(
        item.id,
        completeInventoryDomain(updates) as Partial<LivingItemPayload>,
      );
    }
    if (toolId === "sys-inventory-delete") {
      const { id } = idInput.parse(rawInputs);
      const item = findExactToolTarget(inventory, id);
      if (!item) return { success: false, message: "물품을 찾지 못했습니다." };
      return deleteInventoryItemAction(item.id);
    }
    if (toolId === "sys-inventory-batch-update") {
      const { updatesList } = z.object({
        updatesList: z.array(inventoryUpdateInput).min(1).max(80),
      }).parse(rawInputs);
      return Promise.all(updatesList.map(async ({ id, ...updates }) => {
        const item = findExactToolTarget(inventory, id);
        return item
          ? updateInventoryItemAction(
              item.id,
              completeInventoryDomain(updates) as Partial<LivingItemPayload>,
            )
          : { success: false, message: `${id}: 물품을 찾지 못했습니다.` };
      }));
    }
  }

  if (toolId.startsWith("sys-schedule-")) {
    if (toolId === "sys-schedule-add") {
      return addScheduleAction(scheduleEvent(scheduleInput.parse(rawInputs)));
    }
    if (toolId === "sys-schedule-batch-add") {
      const { events: inputs } = z.object({
        events: z.array(scheduleInput).min(1).max(100),
      }).parse(rawInputs);
      return addSchedulesAction(inputs.map(scheduleEvent));
    }
    const events = await listOwnScheduleAction();
    if (toolId === "sys-schedule-list") return { events, count: events.length };
    if (toolId === "sys-schedule-update") {
      const parsed = scheduleUpdateInput.safeParse(rawInputs);
      if (!parsed.success) {
        return {
          success: false,
          message: parsed.error.issues[0]?.message || "일정 수정 값이 올바르지 않습니다.",
        };
      }
      const { id, date, ...updates } = parsed.data;
      const event = findExactToolTarget(events, id);
      if (!event) return { success: false, message: "일정을 찾지 못했습니다." };
      return updateScheduleAction(event.id, {
        ...updates,
        ...(date ? { startDate: date, endDate: date } : {}),
      });
    }
    if (toolId === "sys-schedule-delete") {
      const { id } = idInput.parse(rawInputs);
      const event = findExactToolTarget(events, id);
      if (!event) return { success: false, message: "일정을 찾지 못했습니다." };
      return deleteScheduleAction(event.id);
    }
    if (toolId === "sys-schedule-batch-update") {
      const { updatesList } = z.object({
        updatesList: z.array(scheduleUpdateInput).min(1).max(100),
      }).parse(rawInputs);
      return Promise.all(updatesList.map(async ({ id, date, ...updates }) => {
        const event = findExactToolTarget(events, id);
        return event
          ? updateScheduleAction(event.id, {
              ...updates,
              ...(date ? { startDate: date, endDate: date } : {}),
            })
          : { success: false, message: `${id}: 일정을 찾지 못했습니다.` };
      }));
    }
  }

  if (toolId === "sys-finance-list") {
    const { month } = z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    }).parse(rawInputs);
    return getFinanceBookAction(month || formatSeoulDate().slice(0, 7));
  }
  if (toolId === "sys-finance-transaction-add") {
    return createFinanceTransactionAction(financeInput.parse(rawInputs));
  }
  if (toolId === "sys-finance-transaction-update") {
    const { id, scope, ...updates } = financeInput.partial().extend({
      id: z.string().trim().min(1),
      scope: z.enum(["ONE", "SERIES"]).optional(),
    }).parse(rawInputs);
    await updateFinanceTransactionAction(id, updates, scope);
    return { success: true, message: "가계부 내역을 수정했습니다." };
  }
  if (toolId === "sys-finance-transaction-delete") {
    const { id, scope } = idInput.extend({
      scope: z.enum(["ONE", "SERIES"]).optional(),
    }).parse(rawInputs);
    await deleteFinanceTransactionAction(id, scope);
    return { success: true, message: "가계부 내역을 삭제했습니다." };
  }
  if (toolId === "sys-finance-budget-set") {
    const { month, budget } = z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      budget: z.number().min(0),
    }).parse(rawInputs);
    await saveFinanceBudgetAction(month, budget);
    return { success: true, message: `${month} 예산을 설정했습니다.` };
  }
  if (toolId.startsWith("sys-finance-asset-")) {
    if (toolId === "sys-finance-asset-add") {
      const input = z.object({
        name: z.string().trim().min(1),
        category: z.string().trim().min(1),
        balance: z.number(),
        note: z.string().default(""),
      }).parse(rawInputs);
      const now = new Date().toISOString();
      return saveFinanceAssetAction({
        id: `asset_${crypto.randomUUID()}`,
        ...input,
        createdAt: now,
        updatedAt: now,
      });
    }
    const assets = (await getFinanceBookAction(formatSeoulDate().slice(0, 7))).assets;
    const { id } = idInput.parse(rawInputs);
    const current = assets.find((asset) => asset.id === id);
    if (!current) return { success: false, message: "자산을 찾지 못했습니다." };
    if (toolId === "sys-finance-asset-delete") {
      await deleteFinanceAssetAction(id);
      return { success: true, message: "자산을 삭제했습니다." };
    }
    if (toolId === "sys-finance-asset-update") {
      const updates = z.object({
        id: z.string(),
        name: z.string().trim().min(1).optional(),
        category: z.string().trim().min(1).optional(),
        balance: z.number().optional(),
        note: z.string().optional(),
      }).parse(rawInputs);
      return saveFinanceAssetAction(
        { ...current, ...updates, updatedAt: new Date().toISOString() },
        updates.balance !== undefined,
      );
    }
  }
  if (toolId === "sys-finance-summary") {
    const { month } = z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    }).parse(rawInputs);
    const book = await getFinanceBookAction(month || formatSeoulDate().slice(0, 7));
    const income = book.transactions
      .filter((item) => item.type === "INCOME")
      .reduce((sum, item) => sum + item.amount, 0);
    const expense = book.transactions
      .filter((item) => item.type === "EXPENSE")
      .reduce((sum, item) => sum + item.amount, 0);
    const categories = new Map<string, number>();
    book.transactions
      .filter((item) => item.type === "EXPENSE")
      .forEach((item) => categories.set(item.category, (categories.get(item.category) || 0) + item.amount));
    return {
      month: book.month,
      income,
      expense,
      balance: income - expense,
      budget: book.monthlyBudget,
      budgetRemaining: book.monthlyBudget - expense,
      topExpenseCategories: [...categories.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5)
        .map(([category, amount]) => ({ category, amount })),
      assets: book.assets,
    };
  }

  if (toolId === "sys-meal-list") {
    const input = z.object({
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(rawInputs);
    const meals = await listMealPlansAction(input.start, input.end);
    return { meals, count: meals.length };
  }
  if (toolId === "sys-meal-add") {
    const input = mealInput.parse(rawInputs);
    return saveMealPlanAction({
      ...input,
      nutrition: {
        calories: input.calories,
        carbohydrate: input.carbohydrate,
        protein: input.protein,
        fat: input.fat,
      },
    });
  }
  if (toolId === "sys-meal-update") {
    const { id, calories, carbohydrate, protein, fat, ...updates } =
      mealUpdateInput.parse(rawInputs);
    const current = await getMealPlanAction(id);
    if (!current) return { success: false, message: "식단을 찾지 못했습니다." };
    return saveMealPlanAction({
      ...current,
      ...updates,
      id,
      nutrition: {
        ...current.nutrition,
        ...(calories !== undefined ? { calories } : {}),
        ...(carbohydrate !== undefined ? { carbohydrate } : {}),
        ...(protein !== undefined ? { protein } : {}),
        ...(fat !== undefined ? { fat } : {}),
      },
    });
  }
  if (toolId === "sys-meal-delete") {
    return deleteMealPlanAction(idInput.parse(rawInputs).id);
  }
  if (toolId === "sys-meal-nutrition-estimate") {
    return estimateMealNutritionAction(rawInputs as {
      title: string;
      ingredients?: string[];
      recipe?: string;
      servingDescription?: string;
    });
  }
  if (toolId === "sys-meal-plan-add-generated") {
    return generatePersonalMealPlanAction(rawInputs);
  }
  if (toolId === "sys-meal-recipe-search") {
    return searchExternalRecipesAction(rawInputs);
  }
  if (toolId === "sys-meal-reference-set") {
    const input = z.object({
      mealId: z.string().min(1),
      recipeReferences: z.array(recipeReferenceSchema).max(10),
      imageUrl: z.string().url().refine(
        (value) => value.startsWith("https://") || value.startsWith("http://"),
      ).optional(),
    }).parse(rawInputs);
    const current = await getMealPlanAction(input.mealId);
    if (!current) return { success: false, error: "식단을 찾지 못했습니다." };
    return saveMealPlanAction({
      ...current,
      recipeReferences: input.recipeReferences,
      imageUrl: input.imageUrl
        || input.recipeReferences.find((reference) => reference.imageUrl)?.imageUrl,
    });
  }
  if (toolId === "sys-meal-feedback-list") {
    const { mealId } = z.object({ mealId: z.string().optional() }).parse(rawInputs);
    const feedback = await listMealFeedbackAction(mealId);
    return { feedback, count: feedback.length };
  }
  if (toolId === "sys-meal-feedback-set") {
    return saveMealFeedbackAction(rawInputs);
  }

  if (toolId === "sys-health-profile-get") {
    return getHealthProfileAction();
  }
  if (toolId === "sys-health-profile-update") {
    return saveHealthProfileAction(z.object({
      heightCm: z.number().positive().optional(),
      recommendedCalories: z.number().nonnegative().optional(),
    }).parse(rawInputs));
  }
  if (toolId === "sys-health-measurement-list") {
    const { limit } = z.object({
      limit: z.number().int().min(1).max(365).default(30),
    }).parse(rawInputs);
    const measurements = (await listHealthMeasurementsAction()).slice(0, limit);
    return { measurements, count: measurements.length };
  }
  if (toolId === "sys-health-measurement-add") {
    return saveHealthMeasurementAction(healthMeasurementInput.parse(rawInputs));
  }
  if (toolId === "sys-health-care-list") {
    const [routines, pending] = await Promise.all([
      listCareRoutinesAction(),
      listPendingCareAction(),
    ]);
    return { routines, pending };
  }
  if (toolId === "sys-health-care-add") {
    const input = careRoutineSchema.omit({
      id: true,
      createdAt: true,
      updatedAt: true,
    }).parse(rawInputs);
    return saveCareRoutineAction(input);
  }
  if (toolId === "sys-health-care-update-status") {
    const { status, ...occurrence } = z.object({
      id: z.string().min(1),
      routineId: z.string().min(1),
      scheduledAt: z.string().min(1),
      status: z.enum(["DONE", "SKIPPED"]),
    }).parse(rawInputs);
    return resolveCareOccurrenceAction(occurrence, status);
  }

  throw new Error(`실행기가 등록되지 않은 시스템 툴입니다: ${toolId}`);
}
