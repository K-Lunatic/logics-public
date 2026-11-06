// 📂 apps/web/src/actions/inventory.action.ts
"use server";

import { z } from "zod";
import { generateText, Output } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  LivingItemPayload,
  livingItemSchema,
  prepareLivingItemUpdate,
} from "@ink/engine";
import { analyzeRequest, resolveModelProfile } from "@ink/ai";
import { getServerSession } from "next-auth";
import { getSecureUserIdOrThrow } from "../lib/authGuard";
// 🚀 [Pure Bone] 표준 Remote 데이터 어댑터 및 인증 단자 수입
import { dbRemote } from "../adapters/dataStore";
import { authOptions } from "../lib/auth";
import {
  decryptServerSecret,
  readStoredUserSettings,
} from "../lib/userSecrets";
import {
  consumeAiQuotaOrThrow,
  defaultRequestsPerMinute,
} from "../lib/aiRateLimit";
import { type SupportedAiModel } from "../aiSettings";
import {
  getActiveGroupAction,
  type ShareGroup,
} from "./shareCircle.action";
import { readShareSettings } from "../lib/shareSettings";
import { findReferenceImageForUser } from "../lib/mealReferences";

// ==========================================
// 📦 물품 하나당 Firestore 문서 하나를 사용한다.
// ==========================================

async function getInventoryContext() {
  const userId = await getSecureUserIdOrThrow();
  const [session, group] = await Promise.all([
    getServerSession(authOptions),
    getActiveGroupAction(),
  ]);
  return {
    userId,
    group,
    actor: session?.user?.email || session?.user?.name || userId,
    actorName: session?.user?.name || session?.user?.email || "알 수 없음",
  };
}

async function readInventory(
  userId: string,
  migrateLegacy = false,
): Promise<LivingItemPayload[]> {
  const documents = await dbRemote.list<LivingItemPayload>(
    `users/${userId}/inventory_items`
  );
  const legacy = await dbRemote.get<unknown>(
    `users/${userId}/inventory/master_document`
  );
  const legacyItems = Array.isArray(legacy)
    ? (legacy as LivingItemPayload[])
    : legacy &&
        typeof legacy === "object" &&
        "list" in legacy &&
        Array.isArray((legacy as { list: unknown }).list)
      ? ((legacy as { list: LivingItemPayload[] }).list)
      : [];

  if (legacyItems.length > 0) {
    const existingIds = new Set(documents.map((item) => item.id));
    const missing = legacyItems.filter(
      (item) => item?.id && !existingIds.has(item.id)
    );
    if (migrateLegacy) {
      await Promise.all([
        ...missing.map((item) =>
          dbRemote.set(`users/${userId}/inventory_items/${item.id}`, item)
        ),
        dbRemote.set(`users/${userId}/inventory/master_document`, []),
      ]);
    }
    return [...documents, ...missing];
  }

  return Array.isArray(documents) ? documents : [];
}

export async function listOwnInventoryAction(): Promise<LivingItemPayload[]> {
  const userId = await getSecureUserIdOrThrow();
  try {
    return await readInventory(userId, true);
  } catch (error) {
    console.error("물품 목록 조회 실패:", error);
    throw error;
  }
}

export async function listInventoryAction(): Promise<LivingItemPayload[]> {
  try {
    const { userId, group } = await getInventoryContext();
    const own = await readInventory(userId, true);
    if (!group) return own;

    const sharedLists = await Promise.all(
      group.members
        .filter((member) => member.userId !== userId)
        .map(async (member) => {
          try {
            const settings = await readShareSettings(
              group.id,
              member.userId,
              member.userId === (group.createdById || group.ownerId)
                ? group.shareSettings
                : undefined
            );
            const inventory = await readInventory(member.userId);
            return inventory
              .filter((item) =>
                settings.inventoryCategories.includes(item.domainType)
              )
              .map((item) => ({
                ...item,
                sharedOwnerId: member.userId,
                sharedByName: member.name,
              }));
          } catch {
            return [];
          }
        })
    );
    return [...own, ...sharedLists.flat()];
  } catch (error) {
    console.error("공유 물품 목록 조회 실패:", error);
    throw error;
  }
}

export type InventoryActionResult<T = LivingItemPayload[]> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function searchInventoryImageAction(name: string) {
  try {
    const userId = await getSecureUserIdOrThrow();
    const query = z.string().trim().min(1).max(200).parse(name);
    const image = await findReferenceImageForUser(userId, query);
    return image
      ? {
          success: true as const,
          data: image,
          warning: image.fallback
            ? "Gemini 대신 공개 이미지 검색 결과를 사용했습니다."
            : undefined,
        }
      : { success: false as const, error: "알맞은 공개 이미지를 찾지 못했습니다." };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "이미지를 찾지 못했습니다.",
    };
  }
}

async function findInventoryTarget(
  id: string,
  context: Awaited<ReturnType<typeof getInventoryContext>>
) {
  const own = await dbRemote.get<LivingItemPayload>(
    `users/${context.userId}/inventory_items/${id}`
  );
  if (own) return { sourceUserId: context.userId, item: own };
  if (!context.group) return null;

  const candidates = await Promise.all(
    context.group.members
      .filter((member) => member.userId !== context.userId)
      .map(async (member) => {
        const item = await dbRemote.get<LivingItemPayload>(
          `users/${member.userId}/inventory_items/${id}`
        );
        if (!item) return null;
        const settings = await readShareSettings(
          context.group!.id,
          member.userId,
          member.userId ===
          (context.group!.createdById || context.group!.ownerId)
            ? context.group!.shareSettings
            : undefined
        );
        return settings.inventoryCategories.includes(item.domainType)
          ? { sourceUserId: member.userId, item }
          : null;
      })
  );
  return candidates.find(Boolean) || null;
}

export async function addItemAction(
  item: LivingItemPayload
): Promise<InventoryActionResult<LivingItemPayload>> {
  try {
    const { userId, actor, actorName } = await getInventoryContext();
    const now = new Date().toISOString();
    const {
      sharedOwnerId: _sharedOwnerId,
      sharedByName: _sharedByName,
      ...ownedItem
    } = item;
    const updatedItem = {
      ...ownedItem,
      lastModifiedBy: actor,
      lastModifiedByName: actorName,
      lastModifiedAt: now,
      updatedAt: now,
    };
    const parsedItem = livingItemSchema.safeParse(updatedItem);
    if (!parsedItem.success) {
      return { success: false, error: "물품 필수 속성이 올바르지 않습니다." };
    }
    await dbRemote.set(
      `users/${userId}/inventory_items/${parsedItem.data.id}`,
      parsedItem.data,
    );
    return { success: true, data: parsedItem.data };
  } catch (error) {
    console.error("물품 추가 실패:", error);
    return { success: false, error: "물품을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

export async function updateInventoryItemAction(
  id: string,
  updates: Partial<LivingItemPayload>
): Promise<InventoryActionResult<LivingItemPayload>> {
  try {
    const context = await getInventoryContext();
    const target = await findInventoryTarget(id, context);
    if (!target) return { success: false, error: "수정할 물품을 찾지 못했습니다." };
    const now = new Date().toISOString();
    const {
      sharedOwnerId: _sharedOwnerId,
      sharedByName: _sharedByName,
      ...safeUpdates
    } = updates;
    const validated = prepareLivingItemUpdate(
      target.item as unknown as Record<string, unknown>,
      safeUpdates as Record<string, unknown>,
      now,
    );
    if (!validated.success) {
      const fields = [...new Set(
        validated.error.issues.map((issue) => issue.path.join(".") || "물품"),
      )].join(", ");
      return {
        success: false,
        error: `수정한 물품 속성이 올바르지 않습니다: ${fields}`,
      };
    }
    const audited = {
      ...validated.data,
      lastModifiedBy: context.actor,
      lastModifiedByName: context.actorName,
      lastModifiedAt: now,
      updatedAt: now,
    };
    await dbRemote.patch(
      `users/${target.sourceUserId}/inventory_items/${id}`,
      audited
    );
    return {
      success: true,
      data: { ...target.item, ...audited } as LivingItemPayload,
    };
  } catch (error) {
    console.error("물품 수정 실패:", error);
    return { success: false, error: "물품 수정 중 서버 통신 오류가 발생했습니다." };
  }
}

export async function deleteInventoryItemAction(
  id: string
): Promise<InventoryActionResult<{ id: string }>> {
  try {
    const context = await getInventoryContext();
    const target = await findInventoryTarget(id, context);
    if (!target) return { success: true, data: { id } };
    await dbRemote.delete(
      `users/${target.sourceUserId}/inventory_items/${id}`
    );
    return { success: true, data: { id } };
  } catch (error) {
    console.error("물품 삭제 실패:", error);
    return { success: false, error: "물품 삭제 중 서버 통신 오류가 발생했습니다." };
  }
}

export async function consumeInventoryItemAction(
  id: string,
  source: "INVENTORY" | "MEDICINE" = "INVENTORY"
): Promise<InventoryActionResult<LivingItemPayload>> {
  try {
    const context = await getInventoryContext();
    const target = await findInventoryTarget(id, context);
    if (!target) return { success: false, error: "차감할 물품을 찾지 못했습니다." };
    const documentPath = `users/${target.sourceUserId}/inventory_items/${id}`;
    const now = new Date().toISOString();
    let updated: LivingItemPayload | null = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const versioned = await dbRemote.getVersioned<LivingItemPayload>(documentPath);
      if (!versioned) return { success: false, error: "차감할 물품을 찾지 못했습니다." };
      if (versioned.data.quantity <= 0) {
        return { success: false, error: "남은 수량이 없습니다." };
      }
      const quantity = versioned.data.quantity - 1;
      const changed = await dbRemote.patchIfUnchanged(
        documentPath,
        {
          quantity,
          lastModifiedBy: context.actor,
          lastModifiedByName: context.actorName,
          lastModifiedAt: now,
          updatedAt: now,
        },
        versioned.updateTime,
      );
      if (changed) {
        updated = { ...versioned.data, quantity, updatedAt: now };
        break;
      }
    }

    if (!updated) {
      return {
        success: false,
        error: "다른 기기에서 수량을 변경하고 있습니다. 다시 시도해 주세요.",
      };
    }

    const logId = `log_${crypto.randomUUID()}`;
    try {
      await dbRemote.set(`users/${context.userId}/inventory_logs/${logId}`, {
        id: logId,
        action: "SUBTRACT",
        source,
        itemId: id,
        itemName: target.item.name,
        quantityChange: -1,
        timestamp: now,
        lastModifiedBy: context.actor,
      });
    } catch (logError) {
      console.warn("수량 차감 감사 로그 저장 실패:", logError);
    }
    return { success: true, data: updated };
  } catch (error) {
    console.error("물품 수량 차감 실패:", error);
    return { success: false, error: "수량 차감 중 오류가 발생했습니다." };
  }
}

const manualItemSchema = z.object({
  name: z.string().min(1),
  domainType: z.enum(["FOOD", "MEDICINE", "CLOTHES", "BOOK", "HOUSEHOLD", "ETC"]),
  quantity: z.number().min(0),
  unit: z.enum(["개", "알", "포", "g", "kg", "ml", "L", "장", "박스", "권"]),
  location: z.string().optional(),
  expirationDate: z.string().optional(),
  sku: z.string().optional(),
});

export async function createItemAction(
  input: z.infer<typeof manualItemSchema>
): Promise<InventoryActionResult<LivingItemPayload>> {
  const result = await createItemsAction([input]);
  return result.success
    ? { success: true, data: result.data[0]! }
    : result;
}

export async function createItemsAction(
  inputs: Array<z.infer<typeof manualItemSchema>>,
): Promise<InventoryActionResult<LivingItemPayload[]>> {
  try {
    const data = z.array(manualItemSchema).min(1).max(80).parse(inputs);
    const { userId, actor, actorName } = await getInventoryContext();
    const now = new Date().toISOString();
    const items = data.map((entry) => {
      const domainDefaults =
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
        ...domainDefaults,
        locationId: null,
        status: "STORED",
        tags: [],
        createdAt: now,
        updatedAt: now,
        lastModifiedBy: actor,
        lastModifiedByName: actorName,
        lastModifiedAt: now,
      });
    });
    await dbRemote.batchSet(
      items.map((item) => ({
        path: `users/${userId}/inventory_items/${item.id}`,
        data: item,
      })),
    );
    return { success: true, data: items };
  } catch (error) {
    console.error("물품 묶음 추가 실패:", error);
    return { success: false, error: "물품을 저장하지 못했습니다." };
  }
}

/**
 * 🚀 [Batched Mutation & Audit Logging]
 * 수량 증감(diff)과 정밀 계층 문서 업데이트, 감사 로그 적재를 단일 연산으로 처리냥!
 */
export async function batchedUpdateInventoryServerAction(
  targetId: string,
  diff: number,
  updates: unknown
) {
  const secureUserId = await getSecureUserIdOrThrow();
  const payloadUpdates = updates as Partial<LivingItemPayload>;
  const list = await listInventoryAction();
  const target = list.find((item) => item.id === targetId);
  if (!target) throw new Error("물품을 찾을 수 없습니다.");
  const targetItemName = target.name;
  const result = await updateInventoryItemAction(targetId, {
    ...payloadUpdates,
    quantity: Math.max(0, (target.quantity || 0) + diff),
  });
  if (!result.success) return result;

  // 2. 감사 로그(Audit Log) 계층 경로 적재
  const actionType = diff > 0 ? "ADD" : diff < 0 ? "SUBTRACT" : "UPDATE";
  const newLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    action: actionType,
    itemName: targetItemName,
    quantityChange: diff,
    timestamp: new Date().toISOString(),
  };

  await dbRemote.set(
    `users/${secureUserId}/inventory_logs/${newLog.id}`,
    newLog
  );

  return { success: true };
}

// ==========================================
// 🌪️ 대량 물품 AI 자동 등록 파이프라인
// ==========================================

export async function bulkRegisterItemsAction(userMessage: string) {
  const userId = await getSecureUserIdOrThrow();
  const settings = await readStoredUserSettings(userId);
  const personalApiKey = decryptServerSecret(
    settings?.encryptedSecrets?.geminiApiKey,
  );
  const geminiApiKey =
    personalApiKey ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!geminiApiKey) {
    return {
      success: false,
      report: "Gemini API 키가 설정되지 않았습니다.",
      processedCount: 0,
    };
  }

  try {
    const google = createGoogleGenerativeAI({ apiKey: geminiApiKey });
    const modelId = (personalApiKey
      ? settings?.aiModel || "gemini-3.5-flash-lite"
      : process.env.GOOGLE_EXTRACTION_MODEL || "gemini-3.5-flash-lite") as SupportedAiModel;
    const profile = resolveModelProfile(
      modelId,
      personalApiKey ? settings?.aiCapabilityMode : "AUTO",
      personalApiKey ? settings?.aiReliabilityMode : "BALANCED",
    );
    const request = analyzeRequest(userMessage);
    let items: z.infer<typeof manualItemSchema>[] = [];
    for (let pass = 0; pass <= profile.recoveryPasses; pass += 1) {
      consumeAiQuotaOrThrow({
        userId,
        modelId,
        requestsPerMinute:
          personalApiKey
            ? settings?.aiRequestsPerMinute ?? defaultRequestsPerMinute(modelId)
            : process.env.GOOGLE_EXTRACTION_REQUESTS_PER_MINUTE ??
              defaultRequestsPerMinute(modelId),
      });
      const { output } = await generateText({
        model: google(modelId),
        output: Output.object({
          schema: z.object({
            items: z.array(manualItemSchema).min(1).max(80),
          }),
        }),
        system:
          "사용자의 물품 등록 요청을 저장 가능한 구조로 변환한다. 명시되지 않은 수량은 1, 단위는 개, 분류는 ETC로 정한다. 보이지 않거나 언급되지 않은 소비기한은 만들지 않는다.",
        prompt: [
          userMessage.slice(0, 4_000),
          ...(pass > 0 && request.expectedCount
            ? [`이전 추출이 누락됐다. 반드시 총 ${request.expectedCount}건 전체를 다시 출력하라.`]
            : []),
        ].join("\n"),
        timeout: { totalMs: profile.timeoutMs },
      });
      items = output.items;
      if (
        request.expectedCount === null ||
        items.length === request.expectedCount
      ) break;
    }
    if (
      request.expectedCount !== null &&
      items.length !== request.expectedCount
    ) {
      return {
        success: false,
        report: `${request.expectedCount}건 중 ${items.length}건만 추출되어 아무것도 저장하지 않았습니다.`,
        processedCount: 0,
      };
    }
    const result = await createItemsAction(items);
    if (!result.success) {
      return { success: false, report: result.error, processedCount: 0 };
    }
    return {
      success: true,
      report: `${result.data.length}개 물품을 등록했습니다.`,
      processedCount: result.data.length,
    };
  } catch (error) {
    console.error("🚨 [Bulk Registration Action Fails]:", error);
    return {
      success: false,
      report: "물품 요청을 분석하거나 저장하지 못했습니다.",
      processedCount: 0,
    };
  }
}
