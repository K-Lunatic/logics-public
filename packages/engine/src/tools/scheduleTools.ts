// 📂 packages/engine/src/tools/scheduleTools.ts

import { tool } from "ai";
import { z } from "zod";
import { AgentToolContext } from "./types";
import { aiScheduleResolutionSchema } from "../schemas/schedule";
import { createLoggedTool } from "./utils";

type SingleScheduleEvent = z.infer<typeof aiScheduleResolutionSchema>["monthEvents"][number];

const COLOR_MAP: Record<string, string> = {
  WORK: "bg-emerald-500/90 text-white",
  UTILITY: "bg-sky-400 text-white",
  PERSONAL: "bg-rose-500 text-white",
  HOLIDAY: "bg-red-500 text-white",
  GLOBAL: "bg-stone-800 text-white",
};

export function createScheduleTools(ctx: AgentToolContext) {
  return {
    // 🚀 [추가]: AI가 일정을 확인하기 위한 List 도구!
    listSchedules: createLoggedTool("listSchedules", ctx, {
      description: "달력(스케줄)에 등록된 모든 일정을 조회합니다. 일정을 묻거나, 특정 일정을 수정(update)/삭제(delete) 해달라고 할 때 반드시 **가장 먼저 이 도구를 호출하여 대상의 정확한 id를 파악**하십시오.",
      parameters: z.object({}),
      execute: async () => {
        ctx.checkAbort();
        ctx.log("🔍 [AI 행동] 스케줄 장부 열람 완료");
        return ctx.getSchedule();
      }
    }),

    addSchedule: createLoggedTool("addSchedule", ctx,{
      description: "새로운 일정(이벤트)을 캘린더 장부에 추가합니다. 일정을 메모해 달라고 할 때 즉시 호출하세요.",
      parameters: z.object({
        title: z.string().describe("일정의 제목"),
        startDate: z.string().describe("시작 날짜 (YYYY-MM-DD 형식)"),
        endDate: z.string().optional().describe("종료 날짜 (YYYY-MM-DD 형식). 특정하지 않으면 시작 날짜와 동일"),
        category: z.enum(["WORK", "UTILITY", "PERSONAL", "HOLIDAY", "GLOBAL"]).optional().describe("일정 카테고리"),
        tasks: z.array(z.string()).optional().describe("일정에 포함된 하위 할 일(Task) 텍스트 목록"),
      }),
      execute: async (req) => {
        ctx.checkAbort();
        const list = ctx.getSchedule() as SingleScheduleEvent[];
        const cat = req.category || "PERSONAL";
        
        // 🚀 UI가 완벽히 렌더링 할 수 있도록 스키마 보정!
        const newSched: SingleScheduleEvent = {
          id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          title: req.title,
          startDate: req.startDate,
          endDate: req.endDate || req.startDate,
          category: cat,
          colorClass: COLOR_MAP[cat] || COLOR_MAP.PERSONAL,
          isUserDefined: true,
          tasks: req.tasks ? req.tasks.map((text, idx) => ({
            id: `task_${Date.now()}_${idx}`,
            text,
            isDone: false
          })) : []
        };

        list.push(newSched);
        ctx.setSchedule(list);
        ctx.log(`📅 [Add Schedule] 성공: "${req.title}"`);
        
        return { status: "success", id: newSched.id, item: newSched };
      }
    }),

    updateSchedule: createLoggedTool("updateSchedule", ctx,{
      description: "기존 일정의 정보나 완료 상태를 수정합니다.",
      parameters: z.object({
        id: z.string().describe("반드시 listSchedules 도구를 먼저 호출하여 획득한 대상 일정의 정확한 고유 ID"),
        updates: z.any().describe("수정할 데이터 객체 (예: { category: 'WORK', startDate: '2026-07-20' })")
      }),
      execute: async ({ id, updates }) => {
        ctx.checkAbort();
        const list = ctx.getSchedule() as SingleScheduleEvent[];
        const idx = list.findIndex(s => s.id === id || s.title === id);
        if (idx === -1) return { status: "error", message: `일정 '${id}'을(를) 찾을 수 없습니다.` };

        const currentCat = (updates.category as string) || list[idx].category;
        const colorClass = COLOR_MAP[currentCat] || list[idx].colorClass;

        list[idx] = { ...list[idx], ...updates, colorClass } as SingleScheduleEvent;
        ctx.setSchedule(list);
        ctx.log(`📅 [Update Schedule] 성공: "${list[idx].title}" 상태 변경`);
        return { status: "success", id, updates };
      }
    }),

    // 🚀 [ID 필수 강조]
    deleteSchedule: createLoggedTool("deleteSchedule", ctx,{
      description: "기존 일정을 영구 삭제합니다.",
      parameters: z.object({
        id: z.string().describe("반드시 listSchedules 도구를 먼저 호출하여 획득한 삭제 대상 일정의 정확한 고유 ID")
      }),
      execute: async ({ id }) => {
        ctx.checkAbort();
        let list = ctx.getSchedule() as SingleScheduleEvent[];
        const idx = list.findIndex(s => s.id === id || s.title === id);
        if (idx === -1) return { status: "error", message: `일정 '${id}'을(를) 찾을 수 없습니다.` };

        const targetTitle = list[idx].title;
        list = list.filter(s => s.id !== id && s.title !== id);
        ctx.setSchedule(list);
        ctx.log(`📅 [Delete Schedule] 성공: "${targetTitle}" 파기 완료`);
        return { status: "success", id };
      }
    })
  };
}