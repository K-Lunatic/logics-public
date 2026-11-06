import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { resolveModelProfile } from "@ink/ai";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  decryptServerSecret,
  readStoredUserSettings,
} from "./userSecrets";
import {
  consumeAiQuotaOrThrow,
  defaultRequestsPerMinute,
} from "./aiRateLimit";
import { type SupportedAiModel } from "../aiSettings";

export const nutritionEstimateSchema = z.object({
  calories: z.number().nonnegative(),
  carbohydrate: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  fat: z.number().nonnegative(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  basis: z.string(),
  missingInformation: z.array(z.string()).max(8),
});

export async function getLifestyleModel(userId: string) {
  const settings = await readStoredUserSettings(userId);
  const personalApiKey = decryptServerSecret(settings?.encryptedSecrets?.geminiApiKey);
  const apiKey = personalApiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("영양 추정에 사용할 Gemini API 키가 없습니다.");
  const modelId = (personalApiKey
    ? settings?.aiModel || "gemini-3.5-flash-lite"
    : process.env.GOOGLE_EXTRACTION_MODEL || "gemini-3.5-flash-lite") as SupportedAiModel;
  const google = createGoogleGenerativeAI({ apiKey });
  const requestsPerMinute =
    personalApiKey
      ? settings?.aiRequestsPerMinute ?? defaultRequestsPerMinute(modelId)
      : process.env.GOOGLE_EXTRACTION_REQUESTS_PER_MINUTE ??
        defaultRequestsPerMinute(modelId);
  return {
    userId,
    model: google(modelId),
    modelId,
    google,
    requestsPerMinute,
    profile: resolveModelProfile(
      modelId,
      personalApiKey ? settings?.aiCapabilityMode : "AUTO",
      personalApiKey ? settings?.aiReliabilityMode : "BALANCED",
    ),
  };
}

export async function estimateMealNutritionForUser(
  userId: string,
  input: { title: string; ingredients: string[]; recipe?: string; servingDescription?: string },
) {
  const { model, modelId, requestsPerMinute } = await getLifestyleModel(userId);
  consumeAiQuotaOrThrow({ userId, modelId, requestsPerMinute });
  const { output } = await generateText({
    model,
    output: Output.object({ schema: nutritionEstimateSchema }),
    system: `한국에서 일반적으로 사용하는 식재료와 1인분을 기준으로 식단의 예상 영양소를 추정한다.
- 반드시 탄수화물(g), 단백질(g), 지방(g), 열량(kcal)을 숫자로 반환한다.
- 식재료 양, 조리유, 소스, 1인분 크기가 없으면 합리적인 보통 1인분을 사용하되 missingInformation에 명시한다.
- 열량은 가능한 한 탄수화물*4 + 단백질*4 + 지방*9와 일관되게 맞춘다.
- 의료적 확정값처럼 표현하지 말고 confidence를 보수적으로 정한다.`,
    prompt: JSON.stringify(input),
  });
  return output;
}
