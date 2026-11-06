import { generateText } from "ai";
import type { RecipeReference } from "@ink/engine";
import { getLifestyleModel } from "./mealNutrition";
import { fallbackRecipeReferences } from "./mealReferenceFallback";
import { consumeAiQuotaOrThrow } from "./aiRateLimit";

export { fallbackRecipeReferences } from "./mealReferenceFallback";

function safeUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function youtubeThumbnail(url: string) {
  const parsed = new URL(url);
  const id = parsed.hostname === "youtu.be"
    ? parsed.pathname.slice(1)
    : parsed.hostname.endsWith("youtube.com")
      ? parsed.searchParams.get("v")
      : null;
  return id && /^[\w-]{6,20}$/.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined;
}

export async function findPublicImage(query: string) {
  try {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrlimit: "5",
      prop: "pageimages|info",
      piprop: "thumbnail",
      pithumbsize: "800",
      inprop: "url",
      format: "json",
      origin: "*",
    });
    const response = await fetch(`https://ko.wikipedia.org/w/api.php?${params}`, {
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    if (!response.ok) return undefined;
    const json = await response.json() as {
      query?: {
        pages?: Record<string, {
          title?: string;
          fullurl?: string;
          thumbnail?: { source?: string };
        }>;
      };
    };
    return Object.values(json.query?.pages || {}).flatMap((page) => {
      const url = safeUrl(page.fullurl);
      const imageUrl = safeUrl(page.thumbnail?.source);
      return url && imageUrl ? [{
        title: page.title || query,
        url,
        imageUrl,
      }] : [];
    })[0];
  } catch {
    return undefined;
  }
}

export async function findReferenceImageForUser(userId: string, query: string) {
  try {
    const { model, google, modelId, requestsPerMinute } = await getLifestyleModel(userId);
    consumeAiQuotaOrThrow({ userId, modelId, requestsPerMinute });
    const result = await generateText({
      model,
      maxRetries: 0,
      tools: {
        google_search: google.tools.googleSearch({
          searchTypes: { imageSearch: {} },
        }),
      },
      prompt: `"${query}" 물품을 정확하게 보여주는 대표 이미지를 하나 찾아 줘.`,
    });
    const metadata = result.providerMetadata?.google as {
      groundingMetadata?: {
        groundingChunks?: Array<{
          image?: { title?: string; sourceUri?: string; imageUri?: string };
        }>;
      };
    } | undefined;
    for (const chunk of metadata?.groundingMetadata?.groundingChunks || []) {
      const url = safeUrl(chunk.image?.sourceUri);
      const imageUrl = safeUrl(chunk.image?.imageUri);
      if (url && imageUrl) {
        return { title: chunk.image?.title || query, url, imageUrl, fallback: false };
      }
    }
  } catch {
    // 개인 키 할당량이 없거나 이미지 검색 미지원이면 공개 이미지 검색으로 전환한다.
  }
  const image = await findPublicImage(query);
  return image ? { ...image, fallback: true } : undefined;
}

export async function findRecipeReferencesForUser(
  userId: string,
  query: string,
  limit = 6,
): Promise<RecipeReference[]> {
  const { model, google, modelId, requestsPerMinute } = await getLifestyleModel(userId);
  const prompt = `"${query}"의 실제 조리 레시피를 검색해 줘. 만개의레시피 같은 레시피 사이트와 YouTube 조리 영상을 우선하고, 메뉴와 직접 관련된 결과만 사용해.`;
  let result;
  try {
    consumeAiQuotaOrThrow({ userId, modelId, requestsPerMinute });
    result = await generateText({
      model,
      maxRetries: 0,
      tools: {
        google_search: google.tools.googleSearch({
          searchTypes: { webSearch: {}, imageSearch: {} },
        }),
      },
      prompt,
    });
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    if (!/quota|rate.?limit|429|resource_exhausted/i.test(message)) {
      try {
        consumeAiQuotaOrThrow({ userId, modelId, requestsPerMinute });
        result = await generateText({
          model,
          maxRetries: 0,
          tools: { google_search: google.tools.googleSearch({}) },
          prompt,
        });
      } catch {
        result = undefined;
      }
    }
  }
  if (!result) {
    return fallbackRecipeReferences(query, await findPublicImage(query))
      .slice(0, Math.max(1, Math.min(limit, 10)));
  }
  const verifiedAt = new Date().toISOString();
  const images = new Map<string, string>();
  const metadata = result.providerMetadata?.google as {
    groundingMetadata?: {
      groundingChunks?: Array<{ image?: { sourceUri?: string; imageUri?: string } }>;
    };
  } | undefined;
  for (const chunk of metadata?.groundingMetadata?.groundingChunks || []) {
    const source = safeUrl(chunk.image?.sourceUri);
    const image = safeUrl(chunk.image?.imageUri);
    if (source && image) images.set(source, image);
  }

  const seen = new Set<string>();
  return result.sources.flatMap((source) => {
    if (source.sourceType !== "url") return [];
    const url = safeUrl(source.url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    const host = new URL(url).hostname.replace(/^www\./, "");
    const isYoutube = host === "youtu.be" || host.endsWith("youtube.com");
    return [{
      title: source.title?.trim() || host,
      url,
      sourceType: isYoutube ? "YOUTUBE" as const : "WEB" as const,
      sourceName: host,
      imageUrl: images.get(url) || (isYoutube ? youtubeThumbnail(url) : undefined),
      verifiedAt,
    }];
  }).slice(0, Math.max(1, Math.min(limit, 10)));
}
