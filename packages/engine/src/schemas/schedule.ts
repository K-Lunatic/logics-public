// 📂 packages/engine/src/schemas/schedule.ts
import { z } from "zod";

/**
 * 🗓️ [마스터 스케줄 상세 장부 스펙]
 * - AI가 추론하고 시스템이 저장하는 공통 스케줄 데이터 규격입니다.
 */
export const aiScheduleResolutionSchema = z.object({
  monthEvents: z.array(
    z.object({
      category: z.enum(["WORK", "UTILITY", "PERSONAL", "HOLIDAY", "GLOBAL"]),
      colorClass: z.string(),
      endDate: z.string(),
      isUserDefined: z.boolean().default(true),
  sharedOwnerId: z.string().optional(),
  sharedByName: z.string().optional(),
      lastModifiedBy: z.string().optional(),
      lastModifiedByName: z.string().optional(),
      lastModifiedAt: z.string().optional(),
      id: z.string(),
      startDate: z.string(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      note: z.string().optional(),
      tasks: z
        .array(
          z.object({
            id: z.string(),
            text: z.string(),
            isDone: z.boolean(),
          }),
        )
        .optional(),
      title: z.string(),
    }),
  ),
  biWeekMilestones: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      targetWeek: z.number(),
      isAchieved: z.boolean(),
    }),
  ),
  weekRoutines: z.record(
    z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
    z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        timeSlot: z.string(),
        durationMinutes: z.number(),
        isCompleted: z.boolean(),
        category: z.enum(["HEALTH", "WORK", "HOUSECHORE", "STUDY"]),
      }),
    ),
  ),
});

// 외부 패키지가 땡겨 쓸 수 있도록 깨끗하게 추론 타입 수출
export type AIMasterSchedulePayload = z.infer<
  typeof aiScheduleResolutionSchema
>;
