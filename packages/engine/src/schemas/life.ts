import { z } from "zod";

export const dateValueSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const webUrlSchema = z.string().url().refine(
  (value) => value.startsWith("https://") || value.startsWith("http://"),
  "웹 URL만 사용할 수 있습니다.",
);

export const recipeReferenceSchema = z.object({
  title: z.string().min(1),
  url: webUrlSchema,
  sourceType: z.enum(["WEB", "YOUTUBE"]),
  sourceName: z.string().optional(),
  imageUrl: webUrlSchema.optional(),
  verifiedAt: z.string(),
});

export const mealPlanSchema = z.object({
  id: z.string().min(1),
  date: dateValueSchema,
  mealType: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]),
  title: z.string().min(1),
  sourceType: z.enum(["HOME", "RESTAURANT", "DELIVERY"]),
  restaurantName: z.string().optional(),
  restaurantAddress: z.string().optional(),
  orderUrl: z.string().url().optional().or(z.literal("")),
  recipe: z.string().optional(),
  ingredients: z.array(z.string()).default([]),
  imageUrl: webUrlSchema.optional(),
  recipeReferences: z.array(recipeReferenceSchema).max(10).optional(),
  nutrition: z.object({
    calories: z.number().nonnegative().default(0),
    carbohydrate: z.number().nonnegative().default(0),
    protein: z.number().nonnegative().default(0),
    fat: z.number().nonnegative().default(0),
    estimated: z.boolean().optional(),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    estimateNote: z.string().optional(),
    missingInformation: z.array(z.string()).optional(),
    additional: z.record(
      z.string(),
      z.object({ amount: z.number().nonnegative(), unit: z.string() }),
    ).optional(),
  }),
  note: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const mealFeedbackSchema = z.object({
  id: z.string().min(1),
  mealId: z.string().min(1),
  mealTitle: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  comment: z.string().max(1000).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const healthMeasurementSchema = z.object({
  id: z.string().min(1),
  date: dateValueSchema,
  source: z.enum(["MANUAL", "APPLE_HEALTH", "ATFLEE_IMPORT"]).default("MANUAL"),
  externalId: z.string().min(1).optional(),
  heightCm: z.number().positive().optional(),
  weightKg: z.number().positive().optional(),
  bodyFatPercent: z.number().nonnegative().optional(),
  skeletalMuscleKg: z.number().nonnegative().optional(),
  bmi: z.number().nonnegative().optional(),
  bodyFatKg: z.number().nonnegative().optional(),
  visceralFatLevel: z.number().nonnegative().optional(),
  fatFreeMassKg: z.number().nonnegative().optional(),
  muscleMassKg: z.number().nonnegative().optional(),
  boneMassKg: z.number().nonnegative().optional(),
  mineralsKg: z.number().nonnegative().optional(),
  waistHipRatio: z.number().nonnegative().optional(),
  bodyWaterPercent: z.number().nonnegative().optional(),
  proteinPercent: z.number().nonnegative().optional(),
  obesityDegreePercent: z.number().optional(),
  bmi2018: z.number().nonnegative().optional(),
  basalMetabolicRate: z.number().nonnegative().optional(),
  bodyAge: z.number().nonnegative().optional(),
  standardWeightKg: z.number().positive().optional(),
  calories: z.number().nonnegative().default(0),
  carbohydrate: z.number().nonnegative().default(0),
  protein: z.number().nonnegative().default(0),
  fat: z.number().nonnegative().default(0),
  note: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const healthProfileSchema = z.object({
  heightCm: z.number().positive().optional(),
  recommendedCalories: z.number().nonnegative().optional(),
  updatedAt: z.string(),
});

export const careRoutineSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(["MEDICATION", "TREATMENT", "CHECK", "CUSTOM"]),
  times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  startDate: dateValueSchema,
  endDate: dateValueSchema.optional(),
  instructions: z.string().optional(),
  active: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const careLogSchema = z.object({
  id: z.string().min(1),
  routineId: z.string().min(1),
  scheduledAt: z.string(),
  status: z.enum(["DONE", "SKIPPED"]),
  resolvedAt: z.string(),
  note: z.string().optional(),
});

export type MealPlan = z.infer<typeof mealPlanSchema>;
export type MealFeedback = z.infer<typeof mealFeedbackSchema>;
export type RecipeReference = z.infer<typeof recipeReferenceSchema>;
export type HealthMeasurement = z.infer<typeof healthMeasurementSchema>;
export type HealthProfile = z.infer<typeof healthProfileSchema>;
export type CareRoutine = z.infer<typeof careRoutineSchema>;
export type CareLog = z.infer<typeof careLogSchema>;
