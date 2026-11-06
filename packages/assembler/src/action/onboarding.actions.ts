"use server";

import { z } from "zod";
import {
  calculateBmi,
  healthMeasurementSchema,
  healthProfileSchema,
  findWeatherGrid,
  userProfileSchema,
} from "@ink/engine";
import { dbRemote } from "../adapters/dataStore";
import { getSecureUserIdOrThrow } from "../lib/authGuard";
import {
  encryptPersonalSecret,
  readStoredUserSettings,
  type StoredUserSettings,
} from "../lib/userSecrets";
import { formatSeoulDate } from "./systemToolCore";
import {
  AI_REQUESTS_PER_MINUTE_MAX,
  AI_REQUESTS_PER_MINUTE_MIN,
  getDefaultRequestsPerMinute,
  SUPPORTED_AI_MODELS,
} from "../aiSettings";

const onboardingInputSchema = z.object({
  userNickname: z.string().trim().min(1).max(30),
  aiNickname: z.string().trim().min(1).max(30),
  fullName: z.string().trim().min(1).max(80),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  region: z.string().trim().min(1).max(100),
  heightCm: z.number().positive().optional(),
  weightKg: z.number().positive().optional(),
  geminiApiKey: z.string().trim().optional(),
  weatherApiKey: z.string().trim().optional(),
  removeGeminiApiKey: z.boolean().optional(),
  removeWeatherApiKey: z.boolean().optional(),
  tone: z.enum(["CAT_NYANG", "POLITE", "ANALYTICAL", "CUSTOM"]),
  customInstructions: z.string().max(2000),
  fontScale: z.enum(["SMALL", "MEDIUM", "LARGE"]),
  aiModel: z.enum(SUPPORTED_AI_MODELS),
  aiCapabilityMode: z.enum(["AUTO", "LOW", "BALANCED", "HIGH"]),
  aiReliabilityMode: z.enum(["FAST", "BALANCED", "RELIABLE"]),
  aiRequestsPerMinute: z
    .number()
    .int()
    .min(AI_REQUESTS_PER_MINUTE_MIN)
    .max(AI_REQUESTS_PER_MINUTE_MAX),
}).superRefine(({ birthDate }, context) => {
  const date = new Date(`${birthDate}T00:00:00+09:00`);
  const now = new Date();
  if (
    Number.isNaN(date.getTime()) ||
    date > now ||
    date.getUTCFullYear() < now.getUTCFullYear() - 120
  ) {
    context.addIssue({
      code: "custom",
      path: ["birthDate"],
      message: "올바른 생년월일을 입력해 주세요.",
    });
  }
});

export type OnboardingInput = z.infer<typeof onboardingInputSchema>;

export async function getOnboardingStatusAction() {
  const userId = await getSecureUserIdOrThrow();
  const [profileValue, settings, healthValue, latestMeasurementValue] = await Promise.all([
    dbRemote.get<unknown>(`users/${userId}/profile/master_document`),
    readStoredUserSettings(userId),
    dbRemote.get<unknown>(`users/${userId}/health_profile/master_document`),
    dbRemote.get<unknown>(
      `users/${userId}/health_measurements/health_${formatSeoulDate()}`,
    ),
  ]);
  const profile = userProfileSchema.safeParse(profileValue);
  const health = healthProfileSchema.safeParse(healthValue);
  const savedProfile = profile.success ? profile.data : null;
  const latestMeasurement = healthMeasurementSchema.safeParse(latestMeasurementValue);
  const missingFields = [
    !savedProfile?.nickname && "userNickname",
    (!savedProfile || !findWeatherGrid(savedProfile.region)) && "region",
    !settings?.nickname && "aiNickname",
    !settings?.tone && "tone",
    !settings?.aiModel && "aiModel",
    !settings?.aiReliabilityMode && "aiReliabilityMode",
    !savedProfile && "profile",
  ].filter((value): value is string => Boolean(value));

  return {
    complete: missingFields.length === 0,
    missingFields,
    profile: savedProfile,
    health: health.success ? health.data : null,
    latestWeightKg: latestMeasurement.success
      ? latestMeasurement.data.weightKg
      : undefined,
    settings: {
      nickname: settings?.nickname || "",
      tone: settings?.tone || "POLITE",
      customInstructions: settings?.customInstructions || "정확하고 친절한 생활 비서",
      fontScale: settings?.fontScale || "MEDIUM",
      aiModel: settings?.aiModel || "gemini-3.6-flash",
      aiCapabilityMode: settings?.aiCapabilityMode || "AUTO",
      aiReliabilityMode: settings?.aiReliabilityMode || "BALANCED",
      aiRequestsPerMinute:
        settings?.aiRequestsPerMinute ||
        getDefaultRequestsPerMinute(settings?.aiModel || "gemini-3.6-flash"),
      hasGeminiApiKey: Boolean(settings?.encryptedSecrets?.geminiApiKey),
      hasWeatherApiKey: Boolean(settings?.encryptedSecrets?.weatherApiKey),
    },
  };
}

export async function completeOnboardingAction(rawInput: unknown) {
  try {
    const userId = await getSecureUserIdOrThrow();
    const input = onboardingInputSchema.parse(rawInput);
    const weatherGrid = findWeatherGrid(input.region);
    if (!weatherGrid) {
      throw new Error("기상청에서 지원하는 정확한 시·군·구 지역을 입력해 주세요.");
    }
    const [previousSettings, previousHealth, previousProfile, currentMeasurement] =
      await Promise.all([
        readStoredUserSettings(userId),
        dbRemote.get<unknown>(`users/${userId}/health_profile/master_document`),
        dbRemote.get<unknown>(`users/${userId}/profile/master_document`),
        dbRemote.get<unknown>(
          `users/${userId}/health_measurements/health_${formatSeoulDate()}`,
        ),
      ]);
    const encryptedSecrets = { ...(previousSettings?.encryptedSecrets || {}) };
    if (input.removeGeminiApiKey) delete encryptedSecrets.geminiApiKey;
    else if (input.geminiApiKey) {
      encryptedSecrets.geminiApiKey = encryptPersonalSecret(input.geminiApiKey);
    }
    if (input.removeWeatherApiKey) delete encryptedSecrets.weatherApiKey;
    else if (input.weatherApiKey) {
      encryptedSecrets.weatherApiKey = encryptPersonalSecret(input.weatherApiKey);
    }
    const now = new Date().toISOString();
    const previousProfileParsed = userProfileSchema.safeParse(previousProfile);
    const profile = userProfileSchema.parse({
      nickname: input.userNickname,
      fullName: input.fullName,
      birthDate: input.birthDate,
      region: weatherGrid.location,
      createdAt: previousProfileParsed.success
        ? previousProfileParsed.data.createdAt
        : now,
      updatedAt: now,
    });
    const settings: StoredUserSettings = {
      nickname: input.aiNickname,
      tone: input.tone,
      customInstructions: input.customInstructions,
      fontScale: input.fontScale,
      aiModel: input.aiModel,
      aiCapabilityMode: input.aiCapabilityMode,
      aiReliabilityMode: input.aiReliabilityMode,
      aiRequestsPerMinute: input.aiRequestsPerMinute,
      encryptedSecrets,
      updatedAt: now,
    };
    const previousHealthParsed = healthProfileSchema.safeParse(previousHealth);
    const health = healthProfileSchema.parse({
      ...(previousHealthParsed.success ? previousHealthParsed.data : {}),
      ...(input.heightCm ? { heightCm: input.heightCm } : {}),
      updatedAt: now,
    });
    const documents: Array<{ path: string; data: Record<string, unknown> }> = [
      { path: `users/${userId}/profile/master_document`, data: profile },
      { path: `users/${userId}/settings/master_document`, data: { ...settings } },
      { path: `users/${userId}/health_profile/master_document`, data: health },
    ];
    if (input.weightKg) {
      const previousMeasurementParsed = healthMeasurementSchema.safeParse(currentMeasurement);
      const measurement = healthMeasurementSchema.parse({
        ...(previousMeasurementParsed.success ? previousMeasurementParsed.data : {}),
        id: `health_${formatSeoulDate()}`,
        date: formatSeoulDate(),
        source: "MANUAL",
        weightKg: input.weightKg,
        heightCm: input.heightCm || health.heightCm,
        bmi: calculateBmi(input.weightKg, input.heightCm || health.heightCm),
        calories: previousMeasurementParsed.success ? previousMeasurementParsed.data.calories : 0,
        carbohydrate: previousMeasurementParsed.success ? previousMeasurementParsed.data.carbohydrate : 0,
        protein: previousMeasurementParsed.success ? previousMeasurementParsed.data.protein : 0,
        fat: previousMeasurementParsed.success ? previousMeasurementParsed.data.fat : 0,
        createdAt: previousMeasurementParsed.success
          ? previousMeasurementParsed.data.createdAt
          : now,
        updatedAt: now,
      });
      documents.push({
        path: `users/${userId}/health_measurements/${measurement.id}`,
        data: measurement,
      });
    }
    await dbRemote.batchSet(documents);
    return {
      success: true as const,
      settings: {
        nickname: settings.nickname,
        tone: settings.tone,
        customInstructions: settings.customInstructions,
        fontScale: settings.fontScale,
        aiModel: settings.aiModel || "gemini-3.6-flash",
        aiCapabilityMode: settings.aiCapabilityMode || "AUTO",
        aiReliabilityMode: settings.aiReliabilityMode || "BALANCED",
        aiRequestsPerMinute:
          settings.aiRequestsPerMinute ||
          getDefaultRequestsPerMinute(settings.aiModel || "gemini-3.6-flash"),
        hasGeminiApiKey: Boolean(settings.encryptedSecrets?.geminiApiKey),
        hasWeatherApiKey: Boolean(settings.encryptedSecrets?.weatherApiKey),
      },
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "초기 설정을 저장하지 못했습니다.",
    };
  }
}
