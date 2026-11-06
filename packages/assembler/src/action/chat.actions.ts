// 📂 apps/web/src/actions/chat.actions.ts
"use server";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { AIEngineOrchestrator, isMutationToolName } from "@ink/ai";
import { z } from "zod";
import {
  createChatEngine,
  LivingItemPayload,
  AIMasterSchedulePayload,
  ChatMessage,
  getWeatherByUserLocation,
  prepareLivingItemUpdate,
  userProfileSchema,
} from "@ink/engine";
import { getSecureUserIdOrThrow } from "../lib/authGuard";

import {
  drive,
  PersonaSettings,
  StoredTool,
  mergeTools,
  toLLM,
} from "../../";
import { dbRemote } from "../adapters/dataStore";
import { runPipeline } from "../engine/pipeline";
import { chatAgentAction } from "./chatAgentAction";
import {
  addItemAction,
  deleteInventoryItemAction,
  listOwnInventoryAction,
  updateInventoryItemAction,
} from "./inventory.action";
import {
  listOwnScheduleAction,
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
import { progressRegistry, appendLog, getStorageDriver } from "./shared";
import {
  decryptServerSecret,
  getPersonalSecretForUser,
  readStoredUserSettings,
} from "../lib/userSecrets";
import {
  defaultRequestsPerMinute,
  consumeAiQuotaOrThrow,
} from "../lib/aiRateLimit";
import {
  AI_REQUESTS_PER_MINUTE_MAX,
  AI_REQUESTS_PER_MINUTE_MIN,
  type SupportedAiModel,
} from "../aiSettings";
import { getDefaultSystemTools } from "../tools/systemToolCatalog";
import { executeSystemTool } from "./systemToolExecutor";
import {
  formatSeoulDate,
  hasToolUpdate,
  toolFailure,
} from "./systemToolCore";

interface ChatMessagePart {
  type: "text" | "image" | "file";
  text?: string;
  image?: string;
  data?: string;
  mimeType?: string;
}

const chatPersonaSchema = z.object({
  nickname: z.string().trim().min(1).max(30).optional(),
  tone: z.enum(["CAT_NYANG", "POLITE", "ANALYTICAL", "CUSTOM"]).optional(),
  customInstructions: z.string().max(2000).optional(),
  aiModel: z.enum([
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-pro-preview",
  ]).optional(),
  aiCapabilityMode: z.enum(["AUTO", "LOW", "BALANCED", "HIGH"]).optional(),
  aiReliabilityMode: z.enum(["FAST", "BALANCED", "RELIABLE"]).optional(),
  aiRequestsPerMinute: z
    .number()
    .int()
    .min(AI_REQUESTS_PER_MINUTE_MIN)
    .max(AI_REQUESTS_PER_MINUTE_MAX)
    .optional(),
}).optional();

// 🛠️ [Helper] Base64 문자열을 drive.put 규격인 Blob으로 변환하는 서버 유틸리티
function base64ToBlob(base64: string, mimeType: string): Blob {
  const base64Data = base64.includes(",") ? base64.split(",")[1] : base64;
  const buffer = Buffer.from(base64Data, "base64");
  return new Blob([buffer], { type: mimeType });
}

// 🛠️ [Helper]: 배열 또는 { list: [...] } 객체 구조를 안전하게 순수 배열 T[]로 변환
function extractArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && data !== null) {
    if ("list" in data && Array.isArray((data as { list: unknown }).list)) {
      return (data as { list: T[] }).list;
    }
    return Object.values(data) as T[];
  }
  return [];
}

export async function proxyFetchChatHistory() {
  try {
    const secureUserId = await getSecureUserIdOrThrow();
    const rawHistory = await createChatEngine(getStorageDriver(secureUserId)).getPureChatHistory();
    return extractArray<ChatMessage>(rawHistory);
  } catch {
    return [];
  }
}

/**
 * 💬 [Dynamic Code Execution Agent]
 * 정밀 계층 경로(`users/{{userID}}/...`) 기반 멀티모달 AI 에이전트 실행 단자
 */
export async function executeAndSaveChatServerAction(
  messages: unknown[],
  personaSettings?: PersonaSettings
) {
  const secureUserId = await getSecureUserIdOrThrow();
  if (!Array.isArray(messages)) throw new Error("대화 형식이 올바르지 않습니다.");
  const safeMessages = messages.slice(-24);
  if (Buffer.byteLength(JSON.stringify(safeMessages), "utf8") > 500_000) {
    throw new Error("한 번에 보낼 수 있는 대화 크기를 초과했습니다.");
  }
  const safePersona = chatPersonaSchema.parse(personaSettings);
  const [storedSettings, profileValue] = await Promise.all([
    readStoredUserSettings(secureUserId),
    dbRemote.get<unknown>(`users/${secureUserId}/profile/master_document`),
  ]);
  const profile = userProfileSchema.safeParse(profileValue);
  const effectivePersona: PersonaSettings = {
    nickname: safePersona?.nickname ?? storedSettings?.nickname,
    userNickname: profile.success ? profile.data.nickname : undefined,
    tone: safePersona?.tone ?? storedSettings?.tone,
    customInstructions:
      safePersona?.customInstructions ?? storedSettings?.customInstructions,
    aiModel: safePersona?.aiModel ?? storedSettings?.aiModel,
    aiCapabilityMode:
      safePersona?.aiCapabilityMode ?? storedSettings?.aiCapabilityMode,
    aiReliabilityMode:
      safePersona?.aiReliabilityMode ?? storedSettings?.aiReliabilityMode,
    aiRequestsPerMinute:
      safePersona?.aiRequestsPerMinute ?? storedSettings?.aiRequestsPerMinute,
  };

  let transactionBucket: LivingItemPayload[] = [];
  let scheduleBucket: AIMasterSchedulePayload = {
    monthEvents: [],
    biWeekMilestones: [],
    weekRoutines: { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: [] },
  };

  let isDirty = false;
  let isScheduleDirty = false;
  let initialInventory: LivingItemPayload[] = [];
  let inventoryLoad: Promise<void> | null = null;
  const ensureInventory = () => {
    if (!inventoryLoad) {
      inventoryLoad = listOwnInventoryAction().then((inventory) => {
        transactionBucket = inventory;
        initialInventory = inventory;
        appendLog(secureUserId, `📥 물류 ${inventory.length}건 필요 시 동기화`);
      });
    }
    return inventoryLoad;
  };

  progressRegistry.set(secureUserId, "🚀 [BOOT] 지능형 에이전트 코드 인터프리터 기동.");

  try {
    const { agentResult, historySyncTask } = await chatAgentAction.execute(
      { 
        userId: secureUserId, 
        messages: safeMessages as Record<string, unknown>[],
        persona: effectivePersona,
      },
      {
        prepareContext: async () => {
          appendLog(secureUserId, "📥 필요한 장부만 선택적으로 동기화");
        },

        fetchChatHistory: async (uid) => {
          const raw = await createChatEngine(getStorageDriver(uid)).getPureChatHistory();
          return extractArray<ChatMessage>(raw);
        },

        saveChatHistory: async (uid, history) => {
          try {
            // 🚀 [FIX]: history가 객체({ list: [...] })나 undefined라도 안전하게 배열 추출
            const rawList = extractArray<ChatMessage>(history);

            const cleanedHistory = await Promise.all(
              rawList.map(async (m) => {
                let finalContent = "";

                if (Array.isArray(m.content)) {
                  let textAccumulator = "";
                  const mediaLinks: string[] = [];

                  for (const part of (m.content as ChatMessagePart[])) {
                    if (part.type === "text") {
                      textAccumulator += (part.text ?? "") + " ";
                    } else if (part.type === "image" && part.image) {
                      try {
                        const mime = "image/webp";
                        const blob = base64ToBlob(part.image, mime);
                        const res = await drive.put("chat_media", `INK_IMG_${Date.now()}.webp`, blob);
                        
                        const cdnUrl = (res as { url?: string; id?: string }).url 
                          || `https://drive.google.com/uc?id=${(res as { id?: string }).id}`;
                        
                        mediaLinks.push(`![살림 첨부 이미지](${cdnUrl})`);
                      } catch {
                        mediaLinks.push(`[❌ 이미지 아카이브 실패]`);
                      }
                    } else if (part.type === "file" && part.data) {
                      try {
                        const mime = part.mimeType || "application/pdf";
                        const blob = base64ToBlob(part.data, mime);
                        const extension = mime.split("/")[1] || "pdf";
                        const res = await drive.put("chat_media", `INK_DOC_${Date.now()}.${extension}`, blob);
                        
                        const cdnUrl = (res as { url?: string; id?: string }).url 
                          || `https://drive.google.com/uc?id=${(res as { id?: string }).id}`;
                          
                        mediaLinks.push(`[📎 첨부 문서 보기](${cdnUrl})`);
                      } catch {
                        mediaLinks.push(`[❌ 문서 아카이브 실패]`);
                      }
                    }
                  }

                  finalContent = textAccumulator.trim();
                  if (mediaLinks.length > 0) finalContent += "\n\n" + mediaLinks.join("\n");
                } else {
                  finalContent = (m.content as string) ?? "";
                }

                return {
                  ...m,
                  role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
                  content: finalContent,
                  timestamp: m.timestamp || new Date().toISOString(),
                };
              })
            );

            await createChatEngine(getStorageDriver(uid)).saveChatHistory({ list: cleanedHistory });
          } catch (e) {
            console.error("🚨 대화 기록 저장 장애:", e);
          }
        },

        runAIWorkflow: async (system, cleanedMessages) => {
          const [userToolsRaw, systemToolsRaw] = await Promise.all([
            dbRemote.get<unknown>(
              `users/${secureUserId}/tools/master_document`,
            ),
            dbRemote.get<unknown>("system", "tools"),
          ]);
          const personalApiKey = decryptServerSecret(
            storedSettings?.encryptedSecrets?.geminiApiKey,
          );
          const activeApiKey =
            personalApiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

          if (!activeApiKey) {
            throw new Error("🚨 사용 가능한 Gemini API Key가 설정되지 않았습니다냥.");
          }

          const userTools = extractArray<StoredTool>(userToolsRaw);
          const systemTools = mergeTools(
            getDefaultSystemTools(),
            extractArray<StoredTool>(systemToolsRaw)
          );

          // 예약된 시스템 ID와 실행 설명은 사용자 정의 툴이 덮어쓸 수 없다.
          const activeStoredTools = mergeTools(userTools, systemTools);
          const storedToolsById = new Map(
            activeStoredTools.map((tool) => [tool.id, tool]),
          );
          const storedToolMutates = (
            tool: StoredTool,
            visited = new Set<string>(),
          ): boolean => {
            if (isMutationToolName(tool.id)) {
              return true;
            }
            if (visited.has(tool.id)) return false;
            const nextVisited = new Set(visited).add(tool.id);
            return tool.blocks.some((block) => {
              if (block.type !== "OPERATION" || !block.toolId) return false;
              if (isMutationToolName(block.toolId)) {
                return true;
              }
              const child = storedToolsById.get(block.toolId);
              return child ? storedToolMutates(child, nextVisited) : false;
            });
          };
          const mutationToolNames = new Set<string>();
          
          const executableLlmTools: Record<string, any> = {};
          const findInventoryItem = (target: string) => {
            const normalized = target.trim().toLocaleLowerCase("ko-KR");
            return transactionBucket.find(
              (item) =>
                item.id === target ||
                item.name.trim().toLocaleLowerCase("ko-KR") === normalized
            );
          };
          const listInventoryTool = {
            description: "현재 사용자의 전체 재고를 ID와 저장된 모든 속성까지 조회합니다. 수정·삭제 전 정확한 ID 확인에 사용합니다.",
            inputSchema: z.object({}),
            execute: async () => {
              await ensureInventory();
              return transactionBucket;
            },
          };
          const getInventoryTool = {
            description: "물품 ID 또는 정확한 이름으로 한 건의 모든 속성을 조회합니다.",
            inputSchema: z.object({
              id: z.string().min(1).describe("inventory.list가 반환한 물품 ID 또는 정확한 이름"),
            }),
            execute: async ({ id }: { id: string }) => {
              await ensureInventory();
              const item = findInventoryItem(id);
              return item
                ? { success: true, item }
                : { success: false, message: "물품을 찾지 못했습니다. inventory.list로 정확한 ID를 확인해 주세요." };
            },
          };
          const addInventoryTool = {
            description: "재고에 물품 하나를 추가합니다.",
            inputSchema: z.object({
              name: z.string().min(1),
              domainType: z.enum(["FOOD", "MEDICINE", "CLOTHES", "BOOK", "HOUSEHOLD", "ETC"]).optional(),
              quantity: z.number().min(0).optional(),
              unit: z.enum(["개", "알", "포", "g", "kg", "ml", "L", "장", "박스", "권"]).optional(),
              location: z.string().optional(),
              expirationDate: z.string().optional(),
            }),
            execute: async (args: {
              name: string;
              domainType?: LivingItemPayload["domainType"];
              quantity?: number;
              unit?: LivingItemPayload["unit"];
              location?: string;
              expirationDate?: string;
            }) => {
              await ensureInventory();
              if (
                args.domainType &&
                ["FOOD", "MEDICINE"].includes(args.domainType) &&
                !args.expirationDate
              ) {
                return { success: false, message: "식품과 의약품에는 소비기한이 필요합니다." };
              }
              const now = new Date().toISOString();
              const domainType = args.domainType || "ETC";
              const domainDefaults =
                domainType === "FOOD"
                  ? { storageCondition: "ROOM", isOpened: false, openedDate: null, category: "INGREDIENT", expirationDate: args.expirationDate || "" }
                  : domainType === "MEDICINE"
                    ? { type: "ORAL", form: "TABLET", efficacy: "", sideEffects: [], dosage: "", expirationDate: args.expirationDate || "" }
                    : domainType === "CLOTHES"
                      ? { category: "TOP", season: ["ALL"], thickness: "NORMAL", lastWornDate: null, isDirty: false, laundryCycleDays: 7 }
                      : domainType === "BOOK"
                        ? { author: "", readingStatus: "UNREAD" }
                        : {};
              const item = {
                id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                ...args,
                ...domainDefaults,
                domainType,
                quantity: args.quantity ?? 1,
                unit: args.unit || "개",
                locationId: null,
                status: "STORED",
                tags: [],
                createdAt: now,
                updatedAt: now,
              } as unknown as LivingItemPayload;
              transactionBucket = [...transactionBucket, item];
              isDirty = true;
              return { success: true, message: `${item.name} 추가 완료`, item };
            },
          };
          const updateInventoryTool = {
            description: "inventory.list 또는 inventory.get으로 확인한 ID를 사용해 기존 물품의 속성을 수정합니다.",
            inputSchema: z.object({
              id: z.string().min(1).describe("inventory.list가 반환한 정확한 물품 ID"),
              name: z.string().optional(),
              quantity: z.number().min(0).optional(),
              unit: z.enum(["개", "알", "포", "g", "kg", "ml", "L", "장", "박스", "권"]).optional(),
              domainType: z.enum(["FOOD", "MEDICINE", "CLOTHES", "BOOK", "HOUSEHOLD", "ETC"]).optional(),
              location: z.string().optional(),
              locationId: z.string().nullable().optional(),
              status: z.enum(["INBOX", "STORED", "CONSUMED", "DISCARDED"]).optional(),
              sku: z.string().optional(),
              price: z.number().min(0).optional(),
              imageUrl: z.string().optional(),
              tags: z.array(z.string()).optional(),
              note: z.string().optional(),
              expirationDate: z.string().optional(),
              purchaseDate: z.string().optional(),
              category: z.enum([
                "INGREDIENT", "READY_MEAL", "BEVERAGE", "SNACK", "FRESH",
                "TOP", "BOTTOM", "OUTER", "UNDERWEAR", "ACC",
              ]).optional(),
              storageCondition: z.enum(["ROOM", "REFRIGERATED", "FROZEN"]).optional(),
              isOpened: z.boolean().optional(),
              openedDate: z.string().nullable().optional(),
              type: z.enum(["ORAL", "EXTERNAL"]).optional(),
              form: z.enum(["TABLET", "CAPSULE", "LIQUID", "OINTMENT", "BANDAGE"]).optional(),
              efficacy: z.string().optional(),
              sideEffects: z.array(z.string()).optional(),
              dosage: z.string().optional(),
              season: z.array(z.enum(["SPRING", "SUMMER", "AUTUMN", "WINTER", "ALL"])).optional(),
              thickness: z.enum(["THIN", "NORMAL", "THICK"]).optional(),
              lastWornDate: z.string().nullable().optional(),
              isDirty: z.boolean().optional(),
              laundryCycleDays: z.number().min(0).optional(),
              color: z.string().optional(),
              author: z.string().optional(),
              publisher: z.string().optional(),
              readingStatus: z.enum(["UNREAD", "READING", "FINISHED"]).optional(),
              rating: z.number().min(0).max(5).optional(),
              summary: z.string().optional(),
            }),
            execute: async ({ id, ...updates }: { id: string; [key: string]: unknown }) => {
              await ensureInventory();
              const target = findInventoryItem(id);
              if (!target) return { success: false, message: "물품을 찾지 못했습니다. inventory.list로 정확한 ID를 확인해 주세요." };
              const validated = prepareLivingItemUpdate(
                target as unknown as Record<string, unknown>,
                updates,
              );
              if (!validated.success) {
                const fields = [...new Set(
                  validated.error.issues.map((issue) => issue.path.join(".") || "물품"),
                )].join(", ");
                return {
                  success: false,
                  message: `수정할 수 없는 속성입니다: ${fields}`,
                };
              }
              const updatedItem = validated.data;
              transactionBucket = transactionBucket.map((item) =>
                item.id === target.id ? updatedItem : item
              );
              isDirty = true;
              return { success: true, message: `${target.name} 수정 완료`, item: updatedItem };
            },
          };
          const deleteInventoryTool = {
            description: "inventory.list 또는 inventory.get으로 확인한 ID를 사용해 물품 한 건을 삭제합니다.",
            inputSchema: z.object({
              id: z.string().min(1).describe("inventory.list가 반환한 정확한 물품 ID"),
            }),
            execute: async ({ id }: { id: string }) => {
              await ensureInventory();
              const target = findInventoryItem(id);
              const next = target
                ? transactionBucket.filter((item) => item.id !== target.id)
                : transactionBucket;
              if (next.length === transactionBucket.length) {
                return { success: false, message: "물품을 찾지 못했습니다. inventory.list로 정확한 ID를 확인해 주세요." };
              }
              transactionBucket = next;
              isDirty = true;
              return { success: true, message: `${target!.name} 삭제 완료`, deletedItem: target };
            },
          };

          const scheduleCategory = z.enum(["WORK", "UTILITY", "PERSONAL", "HOLIDAY", "GLOBAL"]);
          const scheduleInput = z.object({
            title: z.string().min(1),
            date: z.string().optional(),
            startTime: z.string().optional(),
            endTime: z.string().optional(),
            category: scheduleCategory.optional(),
            note: z.string().optional(),
          });
          const scheduleUpdateInput = scheduleInput.partial()
            .extend({ id: z.string().min(1) })
            .refine(
              (input) => hasToolUpdate(input),
              "변경할 일정 속성을 하나 이상 입력해 주세요.",
            );
          const runScheduleMutation = async (
            toolId: string,
            input: Record<string, unknown>,
          ) => {
            const result = await executeSystemTool(toolId, input);
            if (!toolFailure(result)) {
              scheduleBucket.monthEvents = await listOwnScheduleAction();
              isScheduleDirty = true;
            }
            return result;
          };
          const listScheduleTool = {
            description: "현재 사용자의 전체 일정을 조회합니다.",
            inputSchema: z.object({}),
            execute: async () => executeSystemTool("sys-schedule-list", {}),
          };
          const addScheduleTool = {
            description: "일정 한 건을 추가합니다.",
            inputSchema: scheduleInput,
            execute: async (args: z.infer<typeof scheduleInput>) =>
              runScheduleMutation("sys-schedule-add", args),
          };
          const updateScheduleTool = {
            description: "ID 또는 제목으로 일정 한 건을 수정합니다.",
            inputSchema: scheduleUpdateInput,
            execute: async (input: z.infer<typeof scheduleUpdateInput>) =>
              runScheduleMutation("sys-schedule-update", input),
          };
          const deleteScheduleTool = {
            description: "ID 또는 제목으로 일정 한 건을 삭제합니다.",
            inputSchema: z.object({ id: z.string() }),
            execute: async (input: { id: string }) =>
              runScheduleMutation("sys-schedule-delete", input),
          };
          const inputSchemaForStoredTool = (storedTool: StoredTool) => {
            const inputBlock = storedTool.blocks.find((block) => block.type === "INPUT");
            const shape: Record<string, z.ZodTypeAny> = {};
            for (const param of inputBlock?.inputParams || []) {
              let value: z.ZodTypeAny =
                param.type === "number"
                  ? z.number()
                  : param.type === "boolean"
                    ? z.boolean()
                    : param.type === "json"
                      ? z.unknown()
                      : z.string();
              if (param.description) value = value.describe(param.description);
              shape[param.key] = param.required ? value : value.optional();
            }
            return z.object(shape);
          };
          const trustedTools: Record<string, any> = {
            "sys-environment-get-weather": {
              description: "도시의 현재 또는 미래 시간별 날씨를 조회합니다.",
              inputSchema: z.object({
                city: z.string().describe("도시명 (예: 서울특별시, Seoul)"),
                date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("조회 날짜 YYYY-MM-DD"),
                time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional().describe("조회 시각 HH:mm"),
              }),
              execute: async ({ city, date, time }: { city: string; date?: string; time?: string }) => {
                try {
                  const weatherApiKey =
                    (await getPersonalSecretForUser(secureUserId, "weatherApiKey")) ||
                    process.env.WEATHER_API_KEY ||
                    "";
                  return {
                    success: true,
                    data: await getWeatherByUserLocation(
                      city,
                      weatherApiKey,
                      { date, time },
                    ),
                  };
                } catch (error) {
                  const code = error instanceof Error ? error.message : "WEATHER_UNKNOWN_ERROR";
                  return {
                    success: false,
                    error: code.startsWith("WEATHER_LOCATION_NOT_FOUND")
                      ? "지역을 찾지 못했습니다. 시·군·구까지 포함해 입력해 주세요."
                      : code === "WEATHER_FORECAST_OUT_OF_RANGE"
                        ? "기상청 단기예보 범위를 벗어난 날짜입니다."
                        : "날씨 정보를 불러오지 못했습니다.",
                  };
                }
              },
            },
            "sys-finance-list": {
              description: "지정한 달의 가계부, 예산, 자산, 메모를 조회합니다.",
              inputSchema: z.object({
                month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
              }),
              execute: async ({ month }: { month?: string }) =>
                getFinanceBookAction(month || formatSeoulDate().slice(0, 7)),
            },
            "sys-finance-transaction-add": {
              description: "수입 또는 지출 내역 한 건을 추가합니다.",
              inputSchema: z.object({
                type: z.enum(["INCOME", "EXPENSE"]),
                amount: z.number().positive(),
                category: z.string().min(1),
                assetAccount: z.string().default("현금"),
                description: z.string().min(1),
                date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                isFixed: z.boolean().optional(),
              }),
              execute: async (input: {
                type: "INCOME" | "EXPENSE";
                amount: number;
                category: string;
                assetAccount: string;
                description: string;
                date: string;
                isFixed?: boolean;
              }) => ({
                success: true,
                data: await createFinanceTransactionAction(input),
              }),
            },
            "sys-finance-transaction-delete": {
              description: "거래 ID로 가계부 내역을 삭제합니다.",
              inputSchema: z.object({
                id: z.string(),
                scope: z.enum(["ONE", "SERIES"]).optional(),
              }),
              execute: async ({ id, scope }: { id: string; scope?: "ONE" | "SERIES" }) => {
                await deleteFinanceTransactionAction(id, scope);
                return { success: true, message: "가계부 내역을 삭제했습니다." };
              },
            },
            "sys-finance-transaction-update": {
              description: "거래 ID로 가계부 내역을 수정합니다.",
              inputSchema: z.object({
                id: z.string(),
                type: z.enum(["INCOME", "EXPENSE"]).optional(),
                amount: z.number().positive().optional(),
                category: z.string().min(1).optional(),
                assetAccount: z.string().min(1).optional(),
                description: z.string().min(1).optional(),
                date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
                isFixed: z.boolean().optional(),
                scope: z.enum(["ONE", "SERIES"]).optional(),
              }),
              execute: async ({ id, scope, ...updates }: {
                id: string;
                scope?: "ONE" | "SERIES";
                [key: string]: unknown;
              }) => {
                await updateFinanceTransactionAction(id, updates, scope);
                return { success: true, message: "가계부 내역을 수정했습니다." };
              },
            },
            "sys-finance-budget-set": {
              description: "지정한 달의 예산을 설정합니다.",
              inputSchema: z.object({
                month: z.string().regex(/^\d{4}-\d{2}$/),
                budget: z.number().min(0),
              }),
              execute: async ({ month, budget }: { month: string; budget: number }) => {
                await saveFinanceBudgetAction(month, budget);
                return { success: true, message: `${month} 예산을 설정했습니다.` };
              },
            },
            "sys-finance-asset-add": {
              description: "보유 자산을 등록합니다.",
              inputSchema: z.object({
                name: z.string().min(1),
                category: z.string().min(1),
                balance: z.number(),
                note: z.string().optional(),
              }),
              execute: async (input: {
                name: string;
                category: string;
                balance: number;
                note?: string;
              }) => {
                const now = new Date().toISOString();
                const asset = await saveFinanceAssetAction({
                  id: `asset_${crypto.randomUUID()}`,
                  ...input,
                  note: input.note || "",
                  createdAt: now,
                  updatedAt: now,
                });
                return { success: true, data: asset };
              },
            },
            "sys-finance-asset-delete": {
              description: "자산 ID로 보유 자산을 삭제합니다.",
              inputSchema: z.object({ id: z.string() }),
              execute: async ({ id }: { id: string }) => {
                await deleteFinanceAssetAction(id);
                return { success: true, message: "자산을 삭제했습니다." };
              },
            },
            "sys-finance-asset-update": {
              description: "자산 ID로 보유 자산을 수정합니다.",
              inputSchema: z.object({
                id: z.string(),
                name: z.string().min(1).optional(),
                category: z.string().min(1).optional(),
                balance: z.number().optional(),
                note: z.string().optional(),
              }),
              execute: async ({ id, ...updates }: {
                id: string;
                name?: string;
                category?: string;
                balance?: number;
                note?: string;
              }) => {
                const book = await getFinanceBookAction(formatSeoulDate().slice(0, 7));
                const current = book.assets.find((asset) => asset.id === id);
                if (!current) return { success: false, message: "자산을 찾지 못했습니다." };
                return {
                  success: true,
                  data: await saveFinanceAssetAction(
                    {
                      ...current,
                      ...updates,
                      updatedAt: new Date().toISOString(),
                    },
                    updates.balance !== undefined,
                  ),
                };
              },
            },
            "sys-inventory-list": listInventoryTool,
            "sys-inventory-get": getInventoryTool,
            "sys-inventory-add": addInventoryTool,
            "sys-inventory-update": updateInventoryTool,
            "sys-inventory-delete": deleteInventoryTool,
            "sys-inventory-batch-add": {
              description: "여러 재고를 추가합니다.",
              inputSchema: z.object({ items: z.array(addInventoryTool.inputSchema) }),
              execute: async ({ items }: { items: Array<Parameters<typeof addInventoryTool.execute>[0]> }) =>
                Promise.all(items.map((item) => addInventoryTool.execute(item))),
            },
            "sys-inventory-batch-update": {
              description: "여러 재고를 수정합니다.",
              inputSchema: z.object({ updatesList: z.array(updateInventoryTool.inputSchema) }),
              execute: async ({ updatesList }: { updatesList: Array<Parameters<typeof updateInventoryTool.execute>[0]> }) =>
                Promise.all(updatesList.map((item) => updateInventoryTool.execute(item))),
            },
            "sys-schedule-list": listScheduleTool,
            "sys-schedule-add": addScheduleTool,
            "sys-schedule-update": updateScheduleTool,
            "sys-schedule-delete": deleteScheduleTool,
            "sys-schedule-batch-add": {
              description: "여러 일정을 추가합니다.",
              inputSchema: z.object({ events: z.array(scheduleInput) }),
              execute: async ({ events }: { events: Array<z.infer<typeof scheduleInput>> }) =>
                runScheduleMutation("sys-schedule-batch-add", { events }),
            },
            "sys-schedule-batch-update": {
              description: "여러 일정을 수정합니다.",
              inputSchema: z.object({ updatesList: z.array(scheduleUpdateInput) }),
              execute: async ({ updatesList }: { updatesList: Array<z.infer<typeof scheduleUpdateInput>> }) =>
                runScheduleMutation("sys-schedule-batch-update", { updatesList }),
            },
          };

          // 기본 카탈로그에 새 도메인 툴을 추가할 때 채팅 실행기를 중복 작성하지 않는다.
          for (const storedTool of activeStoredTools) {
            if (!storedTool.id.startsWith("sys-") || trustedTools[storedTool.id]) continue;
            trustedTools[storedTool.id] = {
              description: storedTool.description,
              inputSchema: inputSchemaForStoredTool(storedTool),
              execute: async (input: Record<string, unknown>) =>
                executeSystemTool(storedTool.id, input),
            };
          }

          for (const tool of activeStoredTools) {
            const safeName = tool.id.replace(/[^a-zA-Z0-9_-]/g, "_");
            if (storedToolMutates(tool)) mutationToolNames.add(safeName);
            const trustedTool = trustedTools[tool.id];
            if (trustedTool && tool.status === "ACTIVE") {
              executableLlmTools[safeName] = {
                ...trustedTool,
                description: tool.description || trustedTool.description,
                strict: true,
              };
              continue;
            }
            if (tool.status !== "ACTIVE" || tool.blocks.some((block) => block.type === "CODE")) continue;
            
            // 1. JSON 스펙의 INPUT 파라미터를 Zod 스키마로 동적 번역
            executableLlmTools[safeName] = {
              description: `${tool.name} (${tool.blocks.map((b) => b.title).join(" -> ")})`,
              inputSchema: inputSchemaForStoredTool(tool),
              
              execute: async (args: any) => {
                appendLog(secureUserId, `⚙️ [Dynamic Code Engine] '${tool.name}' 파이프라인 가동 중...`);
                const res = await runPipeline(
                  secureUserId,
                  tool,
                  args,
                  new Set(),
                  async (toolId, nativeArgs) => {
                    const nativeTool = trustedTools[toolId];
                    if (!nativeTool?.execute) {
                      throw new Error(`실행 가능한 기본 도구를 찾지 못했습니다: ${toolId}`);
                    }
                    return nativeTool.execute(nativeArgs);
                  },
                );
                return res.success
                  ? res.result
                  : { success: false, error: res.error };
              }
            };
          }

          const google = createGoogleGenerativeAI({ apiKey: activeApiKey });
          const modelId = (personalApiKey
            ? effectivePersona.aiModel || "gemini-3.6-flash"
            : process.env.GOOGLE_CHAT_MODEL || "gemini-3.6-flash") as SupportedAiModel;
          consumeAiQuotaOrThrow({
            userId: secureUserId,
            modelId,
            requestsPerMinute:
              personalApiKey
                ? effectivePersona.aiRequestsPerMinute ??
                  defaultRequestsPerMinute(modelId)
                : process.env.GOOGLE_CHAT_REQUESTS_PER_MINUTE ??
                  defaultRequestsPerMinute(modelId),
          });
          const model = google(modelId);

          const workflow = await AIEngineOrchestrator.runAgentWorkflow({
            model,
            modelId,
            system,
            messages: cleanedMessages,
            tools: executableLlmTools,
            capabilityMode: personalApiKey
              ? effectivePersona.aiCapabilityMode
              : "AUTO",
            reliabilityMode: personalApiKey
              ? effectivePersona.aiReliabilityMode
              : "BALANCED",
            mutationToolNames: [...mutationToolNames],
          });
          const modelProfile = workflow.modelProfile;
          appendLog(
            secureUserId,
            `🧠 ${modelId} · ${modelProfile.capability} · 최대 ${modelProfile.recoveryPasses}회 누락 복구`,
          );
          return workflow;
        },
      }
    );

    // 각 항목을 독립 문서로 반영해 동시 요청 간 배열 덮어쓰기를 방지한다.
    if (isDirty) {
      const nextIds = new Set(transactionBucket.map((item) => item.id));
      const results = await Promise.all([
        ...initialInventory
          .filter((item) => !nextIds.has(item.id))
          .map((item) => deleteInventoryItemAction(item.id)),
        ...transactionBucket
          .filter((item) => {
            const initial = initialInventory.find((entry) => entry.id === item.id);
            return !initial || JSON.stringify(initial) !== JSON.stringify(item);
          })
          .map((item) =>
            initialInventory.some((initial) => initial.id === item.id)
              ? updateInventoryItemAction(item.id, item)
              : addItemAction(item)
          ),
      ]);
      const failed = results.find((result) => !result.success);
      if (failed && !failed.success) throw new Error(failed.error);
    }
    await historySyncTask();

    // 🚀 4. UI 응답용 백틱 정제 및 JSON 'message' 필드 본문 문장 파싱
    let cleanUiReply = agentResult.text ? agentResult.text.trim() : "";
    if (cleanUiReply.startsWith("```")) {
      cleanUiReply = cleanUiReply.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }

    try {
      const parsed = JSON.parse(cleanUiReply);
      if (parsed && typeof parsed.message === "string" && parsed.message.trim() !== "") {
        cleanUiReply = parsed.message.trim();
      }
    } catch {
      // 파싱 실패 시 원본 텍스트 유지
    }

    progressRegistry.delete(secureUserId);
    return {
      reply: cleanUiReply,
      mutatedItems: isDirty ? transactionBucket : undefined,
      mutatedSchedules: isScheduleDirty ? scheduleBucket.monthEvents : undefined,
      mutatedSchedule: isScheduleDirty ? scheduleBucket : undefined,
    };
  } catch (error) {
    progressRegistry.delete(secureUserId);
    throw error;
  }
}
