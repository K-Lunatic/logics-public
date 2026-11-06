// 📂 apps/web/src/actions/schedule.actions.ts (또는 packages/assembler/src/action/schedule.actions.ts)
"use server";

import { z } from "zod";
import { generateText, Output } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  aiScheduleResolutionSchema,
  AIMasterSchedulePayload,
  FunctionalCoreEngine,
} from "@ink/engine";
import { analyzeRequest, resolveModelProfile } from "@ink/ai";
import { getServerSession } from "next-auth";

import { dbRemote } from "../adapters/dataStore";
import { getSecureUserIdOrThrow } from "../lib/authGuard";
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
import { formatSeoulDate } from "./systemToolCore";
import {
  getActiveGroupAction,
} from "./shareCircle.action";
import { readShareSettings } from "../lib/shareSettings";

type SingleScheduleEvent = z.infer<
  typeof aiScheduleResolutionSchema
>["monthEvents"][number];

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  },
  "유효한 날짜를 입력해 주세요.",
);

const scheduleEventSchema = aiScheduleResolutionSchema.shape.monthEvents.element
  .extend({
    id: z.string().min(1).max(160),
    title: z.string().trim().min(1).max(200),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    note: z.string().max(2000).optional(),
  })
  .superRefine((event, context) => {
    if (event.startDate > event.endDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "종료일은 시작일보다 빠를 수 없습니다.",
      });
    }
  });
const smartScheduleChangesSchema = z.object({
  monthEvents: z.array(scheduleEventSchema).max(100).default([]),
  biWeekMilestones:
    aiScheduleResolutionSchema.shape.biWeekMilestones.optional(),
  weekRoutines: aiScheduleResolutionSchema.shape.weekRoutines.optional(),
});

/**
 * 🛡️ [Type Standardizer]: 캘린더 데이터 스키마 정합성을 보장하는 폴백 객체
 */
const defaultSchedulePayload: AIMasterSchedulePayload = {
  monthEvents: [],
  biWeekMilestones: [],
  weekRoutines: { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: [] },
};

// ==========================================
// 📅 일정 하나당 Firestore 문서 하나를 사용한다.
// ==========================================

const EMPTY_SCHEDULE_EVENTS: SingleScheduleEvent[] = [];

async function getScheduleContext() {
  const userId = await getSecureUserIdOrThrow();
  const [session, group] = await Promise.all([
    getServerSession(authOptions),
    getActiveGroupAction(),
  ]);
  return {
    userId,
    group,
    actor: session?.user?.email || session?.user?.name || userId,
    actorName: session?.user?.name || session?.user?.email || "알 수 없는 사용자",
  };
}

async function readSchedule(userId: string): Promise<AIMasterSchedulePayload> {
  return (
    (await dbRemote.get<AIMasterSchedulePayload>(
      `users/${userId}/schedules/master_document`
    )) || { ...defaultSchedulePayload }
  );
}

async function readScheduleEvents(
  userId: string,
  migrateLegacy = false,
): Promise<SingleScheduleEvent[]> {
  const documents = await dbRemote.list<SingleScheduleEvent>(
    `users/${userId}/schedule_events`
  );
  const legacyMaster = await readSchedule(userId);
  const legacyEvents = Array.isArray(legacyMaster.monthEvents)
    ? legacyMaster.monthEvents
    : [];
  if (legacyEvents.length > 0) {
    const existingIds = new Set(documents.map((event) => event.id));
    const missing = legacyEvents.filter(
      (event) => event?.id && !existingIds.has(event.id)
    );
    if (migrateLegacy) {
      await Promise.all([
        ...missing.map((event) =>
          dbRemote.set(`users/${userId}/schedule_events/${event.id}`, event)
        ),
        dbRemote.patch(`users/${userId}/schedules/master_document`, {
          monthEvents: [],
        }),
      ]);
    }
    return [...documents, ...missing];
  }
  return Array.isArray(documents) ? documents : [];
}

export async function listOwnScheduleAction(): Promise<SingleScheduleEvent[]> {
  const userId = await getSecureUserIdOrThrow();
  try {
    return await readScheduleEvents(userId, true);
  } catch (error) {
    console.error("개인 일정 조회 실패:", error);
    throw error;
  }
}

export async function listScheduleAction(): Promise<SingleScheduleEvent[]> {
  try {
    const { userId, group } = await getScheduleContext();
    const own = await readScheduleEvents(userId, true);
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
            const events = await readScheduleEvents(member.userId);
            return events
              .filter((event) =>
                settings.scheduleCategories.includes(event.category)
              )
              .map((event) => ({
                ...event,
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
    console.error("🚨 [listScheduleAction Error]:", error);
    throw error;
  }
}

export async function getSchedulePayloadAction(): Promise<AIMasterSchedulePayload> {
  const userId = await getSecureUserIdOrThrow();
  const [master, monthEvents] = await Promise.all([
    readSchedule(userId),
    listScheduleAction(),
  ]);
  return {
    ...defaultSchedulePayload,
    ...master,
    monthEvents,
    biWeekMilestones: Array.isArray(master.biWeekMilestones)
      ? master.biWeekMilestones
      : [],
    weekRoutines: master.weekRoutines || defaultSchedulePayload.weekRoutines,
  };
}

async function findScheduleTarget(
  id: string,
  context: Awaited<ReturnType<typeof getScheduleContext>>
) {
  const own = await dbRemote.get<SingleScheduleEvent>(
    `users/${context.userId}/schedule_events/${id}`
  );
  if (own) return { sourceUserId: context.userId, event: own };
  if (!context.group) return null;
  const candidates = await Promise.all(
    context.group.members
      .filter((member) => member.userId !== context.userId)
      .map(async (member) => {
        const event = await dbRemote.get<SingleScheduleEvent>(
          `users/${member.userId}/schedule_events/${id}`
        );
        if (!event) return null;
        const settings = await readShareSettings(
          context.group!.id,
          member.userId,
          member.userId ===
          (context.group!.createdById || context.group!.ownerId)
            ? context.group!.shareSettings
            : undefined
        );
        return settings.scheduleCategories.includes(event.category)
          ? { sourceUserId: member.userId, event }
          : null;
      })
  );
  return candidates.find(Boolean) || null;
}

export async function addScheduleAction(
  item: SingleScheduleEvent
): Promise<
  | { success: true; data: SingleScheduleEvent }
  | { success: false; error: string }
> {
  const result = await addSchedulesAction([item]);
  return result.success
    ? { success: true, data: result.data[0]! }
    : { success: false, error: result.error };
}

export async function addSchedulesAction(
  items: SingleScheduleEvent[],
): Promise<
  | { success: true; data: SingleScheduleEvent[] }
  | { success: false; error: string }
> {
  try {
    const context = await getScheduleContext();
    const parsed = z.array(scheduleEventSchema).min(1).max(100).safeParse(items);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || "일정 형식이 올바르지 않습니다.",
      };
    }
    const now = new Date().toISOString();
    const stored = parsed.data.map((event) => {
      const {
        sharedOwnerId: _sharedOwnerId,
        sharedByName: _sharedByName,
        ...ownedEvent
      } = event;
      return {
        ...ownedEvent,
        lastModifiedBy: context.actor,
        lastModifiedByName: context.actorName,
        lastModifiedAt: now,
      };
    });
    await dbRemote.batchSet(
      stored.map((event) => ({
        path: `users/${context.userId}/schedule_events/${event.id}`,
        data: event,
      })),
    );
    return { success: true, data: stored };
  } catch (error) {
    console.error("일정 묶음 추가 실패:", error);
    return { success: false, error: "일정을 저장하지 못했습니다." };
  }
}

export async function updateScheduleAction(
  id: string,
  updates: Partial<SingleScheduleEvent>
): Promise<
  | { success: true; data: SingleScheduleEvent }
  | { success: false; error: string }
> {
  try {
    const context = await getScheduleContext();
    const target = await findScheduleTarget(id, context);
    if (!target) return { success: false, error: "수정할 일정을 찾지 못했습니다." };
    const {
      sharedOwnerId: _sharedOwnerId,
      sharedByName: _sharedByName,
      ...safeUpdates
    } = updates;
    const parsed = scheduleEventSchema.safeParse({
      ...target.event,
      ...safeUpdates,
      id: target.event.id,
    });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "일정 형식이 올바르지 않습니다." };
    }
    const stored = {
      ...parsed.data,
      lastModifiedBy: context.actor,
      lastModifiedByName: context.actorName,
      lastModifiedAt: new Date().toISOString(),
    };
    await dbRemote.patch(
      `users/${target.sourceUserId}/schedule_events/${id}`,
      stored
    );
    return { success: true, data: stored };
  } catch (error) {
    console.error("일정 수정 실패:", error);
    return { success: false, error: "일정 수정 중 오류가 발생했습니다." };
  }
}

export async function deleteScheduleAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const context = await getScheduleContext();
    const target = await findScheduleTarget(id, context);
    if (!target) return { success: false, error: "삭제할 일정을 찾지 못했습니다." };
    await dbRemote.delete(
      `users/${target.sourceUserId}/schedule_events/${id}`
    );
    return { success: true };
  } catch (error) {
    console.error("일정 삭제 실패:", error);
    return { success: false, error: "일정 삭제 중 오류가 발생했습니다." };
  }
}

export async function updateMonthlyGoalAction(monthlyGoal: string): Promise<void> {
  const userId = await getSecureUserIdOrThrow();
  await dbRemote.patch(`users/${userId}/schedules/master_document`, {
    monthlyGoal,
  });
}

// ==========================================
// 🧠 지능형 스케줄러 동기화 관문 (AI Pipeline)
// ==========================================

export async function handleSmartScheduleServerAction(promptText: string) {
  const secureUserId = await getSecureUserIdOrThrow();
  const settings = await readStoredUserSettings(secureUserId);
  const personalApiKey = decryptServerSecret(
    settings?.encryptedSecrets?.geminiApiKey,
  );
  const geminiApiKey =
    personalApiKey ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!geminiApiKey) {
    throw new Error("🚨 AI_API_KEY_NOT_CONFIGURED");
  }

  const [currentMaster, currentEvents] = await Promise.all([
    readSchedule(secureUserId),
    readScheduleEvents(secureUserId, true),
  ]);
  const targetSchedule = { ...currentMaster, monthEvents: currentEvents };
  const google = createGoogleGenerativeAI({ apiKey: geminiApiKey });
  const modelId = (personalApiKey
    ? settings?.aiModel || "gemini-3.6-flash"
    : process.env.GOOGLE_CHAT_MODEL || "gemini-3.6-flash") as SupportedAiModel;
  consumeAiQuotaOrThrow({
    userId: secureUserId,
    modelId,
    requestsPerMinute:
      personalApiKey
        ? settings?.aiRequestsPerMinute ?? defaultRequestsPerMinute(modelId)
        : process.env.GOOGLE_CHAT_REQUESTS_PER_MINUTE ??
          defaultRequestsPerMinute(modelId),
  });
  const profile = resolveModelProfile(
    modelId,
    personalApiKey ? settings?.aiCapabilityMode : "AUTO",
    personalApiKey ? settings?.aiReliabilityMode : "BALANCED",
  );
  const request = analyzeRequest(promptText);
  let extracted: z.infer<typeof smartScheduleChangesSchema> = {
    monthEvents: [],
  };
  for (let pass = 0; pass <= profile.recoveryPasses; pass += 1) {
    const result = await generateText({
      model: google(modelId),
      output: Output.object({ schema: smartScheduleChangesSchema }),
      system: `오늘은 ${formatSeoulDate()}이다. monthEvents에는 새 일정과 실제로 바꿀 일정만 출력한다. 기존 일정의 ID와 isUserDefined 값을 보존하고, 삭제는 수행하지 않는다. biWeekMilestones와 weekRoutines도 변경할 때만 출력한다.`,
      prompt: [
        `기존 상태: ${JSON.stringify(targetSchedule)}`,
        `사용자 요청: ${promptText.slice(0, 4_000)}`,
        ...(pass > 0 && request.expectedCount
          ? [`이전 결과가 누락됐다. 변경 대상 ${request.expectedCount}건 전체를 다시 출력하라.`]
          : []),
      ].join("\n"),
      timeout: { totalMs: profile.timeoutMs },
    });
    extracted = result.output;
    if (
      request.expectedCount === null ||
      extracted.monthEvents.length === request.expectedCount
    ) break;
  }
  if (
    request.expectedCount !== null &&
    extracted.monthEvents.length !== request.expectedCount
  ) {
    return {
      success: false as const,
      error: `${request.expectedCount}건 중 ${extracted.monthEvents.length}건만 추출되어 일정을 변경하지 않았습니다.`,
    };
  }

  const mutationResults = await Promise.all(
    extracted.monthEvents.map((event) =>
      currentEvents.some((current) => current.id === event.id)
        ? updateScheduleAction(event.id, event)
        : addScheduleAction(event)
    ),
  );
  const failed = mutationResults.find((result) => !result.success);
  if (failed && !failed.success) return failed;
  if (extracted.biWeekMilestones || extracted.weekRoutines) {
    await dbRemote.patch(`users/${secureUserId}/schedules/master_document`, {
      ...(extracted.biWeekMilestones
        ? { biWeekMilestones: extracted.biWeekMilestones }
        : {}),
      ...(extracted.weekRoutines
        ? { weekRoutines: extracted.weekRoutines }
        : {}),
    });
  }
  return {
    success: true,
    data: {
      ...currentMaster,
      ...(extracted.biWeekMilestones
        ? { biWeekMilestones: extracted.biWeekMilestones }
        : {}),
      ...(extracted.weekRoutines
        ? { weekRoutines: extracted.weekRoutines }
        : {}),
      monthEvents: await listOwnScheduleAction(),
    },
  };
}

// ==========================================
// 🌐 월별 메타데이터 및 휴일 동적 추출
// ==========================================

export async function fetchMonthMetaAction(year: number, month: number) {
  await getSecureUserIdOrThrow();

  const defaultHolidays: Record<string, string> = {
    "01-01": "신정", "03-01": "삼일절", "05-05": "어린이날", "06-06": "현충일",
    "07-17": "제헌절", "08-15": "광복절", "10-03": "개천절", "10-09": "한글날", "12-25": "성탄절",
  };

  const monthStr = month.toString().padStart(2, "0");
  const holidaysForThisMonth = Object.entries(defaultHolidays).reduce(
    (acc, [mmdd, name]) => {
      if (mmdd.startsWith(monthStr)) acc[`${year}-${mmdd}`] = name;
      return acc;
    },
    {} as Record<string, string>
  );

  return {
    id: `calendar_${year}-${month}`,
    year,
    month,
    calendarDays: FunctionalCoreEngine.computeMonthCalendarGrid(year, month),
    holidays: holidaysForThisMonth,
  };
}
