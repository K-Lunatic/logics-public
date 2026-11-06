"use server";

import { z } from "zod";
import { getSecureUserIdOrThrow } from "../lib/authGuard";
import {
  encryptPersonalSecret,
  readStoredUserSettings,
  writeStoredUserSettings,
  type StoredUserSettings,
} from "../lib/userSecrets";
import {
  AI_REQUESTS_PER_MINUTE_MAX,
  AI_REQUESTS_PER_MINUTE_MIN,
  getDefaultRequestsPerMinute,
  SUPPORTED_AI_MODELS,
} from "../aiSettings";

const publicSettingsSchema = z.object({
  nickname: z.string().trim().min(1).max(30),
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
});

export interface PublicUserSettings extends z.infer<typeof publicSettingsSchema> {
  hasGeminiApiKey: boolean;
  hasWeatherApiKey: boolean;
}

export interface SaveUserSettingsInput extends z.infer<typeof publicSettingsSchema> {
  geminiApiKey?: string;
  weatherApiKey?: string;
  removeGeminiApiKey?: boolean;
  removeWeatherApiKey?: boolean;
}

const DEFAULT_SETTINGS: Omit<PublicUserSettings, "hasGeminiApiKey" | "hasWeatherApiKey"> = {
  nickname: "Ink",
  tone: "CAT_NYANG",
  customInstructions: "유능하고 정확한 생활 비서",
  fontScale: "MEDIUM",
  aiModel: "gemini-3.6-flash",
  aiCapabilityMode: "AUTO",
  aiReliabilityMode: "BALANCED",
  aiRequestsPerMinute: getDefaultRequestsPerMinute("gemini-3.6-flash"),
};

function toPublic(settings: StoredUserSettings | null): PublicUserSettings {
  return {
    nickname: settings?.nickname || DEFAULT_SETTINGS.nickname,
    tone: settings?.tone || DEFAULT_SETTINGS.tone,
    customInstructions: settings?.customInstructions || DEFAULT_SETTINGS.customInstructions,
    fontScale: settings?.fontScale || DEFAULT_SETTINGS.fontScale,
    aiModel: settings?.aiModel || DEFAULT_SETTINGS.aiModel,
    aiCapabilityMode:
      settings?.aiCapabilityMode || DEFAULT_SETTINGS.aiCapabilityMode,
    aiReliabilityMode:
      settings?.aiReliabilityMode || DEFAULT_SETTINGS.aiReliabilityMode,
    aiRequestsPerMinute:
      settings?.aiRequestsPerMinute || DEFAULT_SETTINGS.aiRequestsPerMinute,
    hasGeminiApiKey: Boolean(settings?.encryptedSecrets?.geminiApiKey),
    hasWeatherApiKey: Boolean(settings?.encryptedSecrets?.weatherApiKey),
  };
}

export async function getUserSettingsAction(): Promise<PublicUserSettings> {
  const userId = await getSecureUserIdOrThrow();
  return toPublic(await readStoredUserSettings(userId));
}

export async function saveUserSettingsAction(
  input: SaveUserSettingsInput
): Promise<PublicUserSettings> {
  const userId = await getSecureUserIdOrThrow();
  const publicSettings = publicSettingsSchema.parse(input);
  const previous = await readStoredUserSettings(userId);
  const encryptedSecrets = { ...(previous?.encryptedSecrets || {}) };

  if (input.removeGeminiApiKey) delete encryptedSecrets.geminiApiKey;
  else if (input.geminiApiKey?.trim()) {
    encryptedSecrets.geminiApiKey = encryptPersonalSecret(input.geminiApiKey.trim());
  }
  if (input.removeWeatherApiKey) delete encryptedSecrets.weatherApiKey;
  else if (input.weatherApiKey?.trim()) {
    encryptedSecrets.weatherApiKey = encryptPersonalSecret(input.weatherApiKey.trim());
  }

  const next: StoredUserSettings = {
    ...publicSettings,
    encryptedSecrets,
    updatedAt: new Date().toISOString(),
  };
  await writeStoredUserSettings(userId, next);
  return toPublic(next);
}
