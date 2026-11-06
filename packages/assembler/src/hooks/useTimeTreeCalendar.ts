// 📂 packages/assembler/src/hooks/useTimeTreeCalendar.ts
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useDataStore } from "./useDataStore";
import {
  AIMasterSchedulePayload,
  computeCalendarWeeks,
  getWeekPlacedEventsCore,
} from "@ink/engine";
import {
  addScheduleAction,
  deleteScheduleAction,
  getSchedulePayloadAction,
  updateMonthlyGoalAction,
  updateScheduleAction,
} from "../action/schedule.actions";
import { createProgressiveGoalAction } from "../action/smartLife.actions";

// 📌 캘린더 전용 데이터 규격 및 기본값
export type CategoryType = "WORK" | "UTILITY" | "PERSONAL" | "HOLIDAY" | "GLOBAL";
export type RightPanelMode = "VIEW" | "EDIT";

export interface ChecklistTask {
  id: string;
  text: string;
  isDone: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  note?: string;
  category: CategoryType;
  colorClass?: string;
  tasks?: ChecklistTask[];
  isUserDefined?: boolean;
  sharedOwnerId?: string;
  sharedByName?: string;
  lastModifiedByName?: string;
  lastModifiedAt?: string;
  [key: string]: unknown;
}

export const COLOR_MAP: Record<CategoryType, string> = {
  WORK: "bg-blue-600 text-white",
  UTILITY: "bg-amber-600 text-white",
  PERSONAL: "bg-emerald-600 text-white",
  HOLIDAY: "bg-rose-600 text-white",
  GLOBAL: "bg-purple-600 text-white",
};

export const CATEGORY_OPTIONS: { value: CategoryType; label: string }[] = [
  { value: "WORK", label: "💼 업무" },
  { value: "UTILITY", label: "⚡ 공과금/살림" },
  { value: "PERSONAL", label: "🏡 개인" },
  { value: "HOLIDAY", label: "🎉 휴일" },
  { value: "GLOBAL", label: "🌐 공유" },
];

export const CATEGORY_LIST = Object.entries(COLOR_MAP).map(([id, color]) => ({
  id: id as CategoryType,
  color,
  label: id,
}));

export const INITIAL_SEED_EVENTS: CalendarEvent[] = [];

const getSafeLocalTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * 🗓️ [타임트리 캘린더 통합 제어 커스텀 훅]
 * useDataStore 기반 오프라인-퍼스트 및 서버 액션 원자적 동기화
 */
export function useTimeTreeCalendar() {
  const todayDate = new Date();
  const [currentYear, setCurrentYear] = useState<number>(todayDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(todayDate.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string>(getSafeLocalTodayString());

  const [panelMode, setRightPanelMode] = useState<RightPanelMode>("VIEW");

  const [enabledCategories, setEnabledCategories] = useState<Record<CategoryType, boolean>>({
    WORK: true,
    UTILITY: true,
    PERSONAL: true,
    HOLIDAY: true,
    GLOBAL: true,
  });

  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState<CategoryType>("PERSONAL");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formTasks, setFormTasks] = useState<ChecklistTask[]>([]);
  const [taskInput, setTaskTasksInput] = useState("");
  const [isMutating, setIsMutating] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [goalPlanInput, setGoalPlanInput] = useState("");
  const [goalTargetDate, setGoalTargetDate] = useState("");
  const [goalPlanMessage, setGoalPlanMessage] = useState("");

  // 🚀 [FIX]: fetcher & updater 시그니처 호환 어댑터 래핑
  const {
    data: scheduleMaster,
    updateData: setScheduleMaster,
    loading: isSyncing,
  } = useDataStore<AIMasterSchedulePayload>({
    key: "schedules",
    fetcher: getSchedulePayloadAction,
  });

  // 이벤트 추출
  const events = useMemo(() => {
    const stored = (scheduleMaster?.monthEvents as CalendarEvent[]) || INITIAL_SEED_EVENTS;
    return stored.map((event) => ({
      ...event,
      colorClass: COLOR_MAP[event.category] || "bg-stone-800 text-white",
    }));
  }, [scheduleMaster]);

  const [monthlyGoal, setMonthlyGoal] = useState<string>("");

  useEffect(() => {
    const customMaster = scheduleMaster as AIMasterSchedulePayload & { monthlyGoal?: string };
    if (customMaster?.monthlyGoal !== undefined) {
      setMonthlyGoal(customMaster.monthlyGoal);
    }
  }, [scheduleMaster]);

  const fetchCloudData = useCallback(async () => {
    await setScheduleMaster(await getSchedulePayloadAction());
  }, [setScheduleMaster]);

  const commitTransaction = useCallback(
    async (nextEvents: CalendarEvent[], nextGoal?: string) => {
      const updatedPayload = {
        monthEvents: nextEvents as unknown as AIMasterSchedulePayload["monthEvents"],
        biWeekMilestones: scheduleMaster?.biWeekMilestones || [],
        weekRoutines: scheduleMaster?.weekRoutines || {
          MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: []
        },
        ...(nextGoal !== undefined || monthlyGoal
          ? { monthlyGoal: nextGoal !== undefined ? nextGoal : monthlyGoal }
          : {})
      } as AIMasterSchedulePayload;

      await setScheduleMaster(updatedPayload);
      if (nextGoal !== undefined) await updateMonthlyGoalAction(nextGoal);
    },
    [scheduleMaster, monthlyGoal, setScheduleMaster]
  );

  const setEvents = useCallback(
    (nextEvents: CalendarEvent[] | ((prev: CalendarEvent[]) => CalendarEvent[])) => {
      const resolved = typeof nextEvents === "function" ? nextEvents(events) : nextEvents;
      commitTransaction(resolved);
    },
    [events, commitTransaction]
  );

  const calendarWeeks = useMemo(() => {
    return computeCalendarWeeks(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => enabledCategories[e.category]);
  }, [events, enabledCategories]);

  const getEventsForDate = (dateStr: string) => {
    return filteredEvents.filter(
      (e) => dateStr >= e.startDate && dateStr <= e.endDate,
    );
  };

  const getWeekPlacedEvents = (
    week: Parameters<typeof getWeekPlacedEventsCore>[0],
  ) => {
    return getWeekPlacedEventsCore(
      week,
      filteredEvents as unknown as Parameters<
        typeof getWeekPlacedEventsCore
      >[1],
    );
  };

  const handlePrevMonth = () => {
    const date = new Date(currentYear, currentMonth - 2, 1);
    setCurrentYear(date.getFullYear());
    setCurrentMonth(date.getMonth() + 1);
    setSelectedDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`);
  };

  const handleNextMonth = () => {
    const date = new Date(currentYear, currentMonth, 1);
    setCurrentYear(date.getFullYear());
    setCurrentMonth(date.getMonth() + 1);
    setSelectedDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`);
  };

  const handleDateDoubleClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    setEditingEventId(null);
    setFormTitle("");
    setFormCategory("PERSONAL");
    setFormStart(dateStr);
    setFormEnd(dateStr);
    setFormTasks([]);
    setTaskTasksInput("");
    setRightPanelMode("EDIT");
  };

  const triggerEditMode = (evt: CalendarEvent) => {
    setEditingEventId(evt.id);
    setFormTitle(evt.title);
    setFormCategory(evt.category);
    setFormStart(evt.startDate);
    setFormEnd(evt.endDate);
    setFormTasks(evt.tasks ? [...evt.tasks] : []);
    setTaskTasksInput("");
    setRightPanelMode("EDIT");
  };

  const handleAddTaskInForm = () => {
    if (!taskInput.trim()) return;
    setFormTasks((prev) => [
      ...prev,
      {
        id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        text: taskInput.trim(),
        isDone: false,
      },
    ]);
    setTaskTasksInput("");
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || isMutating) return;

    const colorClass = COLOR_MAP[formCategory] || "bg-stone-800 text-white";
    let nextEvents: CalendarEvent[] = [...events];
    let savedEvent: CalendarEvent;

    if (editingEventId) {
      const current = events.find((event) => event.id === editingEventId);
      if (!current) return;
      savedEvent = {
        ...current,
        title: formTitle.trim(),
        startDate: formStart,
        endDate: formEnd,
        category: formCategory,
        colorClass,
        tasks: formTasks,
      };
      nextEvents = events.map((evt) =>
        evt.id === editingEventId ? savedEvent : evt,
      );
    } else {
      savedEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: formTitle.trim(),
        startDate: formStart,
        endDate: formEnd,
        category: formCategory,
        colorClass,
        tasks: formTasks,
        isUserDefined: true,
      };
      nextEvents.push(savedEvent);
    }

    setIsMutating(true);
    setMutationError("");
    try {
      const result = editingEventId
        ? await updateScheduleAction(editingEventId, savedEvent)
        : await addScheduleAction(
            savedEvent as Parameters<typeof addScheduleAction>[0]
          );
      if (!result.success) throw new Error(result.error);
      nextEvents = editingEventId
        ? events.map((event) =>
            event.id === editingEventId
              ? (result.data as CalendarEvent)
              : event,
          )
        : [...events, result.data as CalendarEvent];
      await commitTransaction(nextEvents);
      setEditingEventId(null);
      setRightPanelMode("VIEW");
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "일정을 저장하지 못했습니다.",
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (isMutating) return;
    setIsMutating(true);
    setMutationError("");
    try {
      const result = await deleteScheduleAction(id);
      if (!result.success) throw new Error(result.error);
      await commitTransaction(events.filter((e) => e.id !== id));
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "일정을 삭제하지 못했습니다.",
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleToggleTaskDone = async (eventId: string, taskId: string) => {
    if (isMutating) return;
    const nextEvents = events.map((evt) => {
      if (evt.id === eventId && evt.tasks)
        return {
          ...evt,
          tasks: evt.tasks.map((t) =>
            t.id === taskId ? { ...t, isDone: !t.isDone } : t,
          ),
        };
      return evt;
    });
    const changed = nextEvents.find((event) => event.id === eventId);
    if (!changed) return;
    setIsMutating(true);
    setMutationError("");
    try {
      const result = await updateScheduleAction(eventId, {
        tasks: changed.tasks,
      });
      if (!result.success) throw new Error(result.error);
      await commitTransaction(
        nextEvents.map((event) =>
          event.id === eventId ? (result.data as CalendarEvent) : event,
        ),
      );
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "세부 업무를 수정하지 못했습니다.",
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleCreateGoalPlan = async () => {
    if (!goalPlanInput.trim() || isMutating) return;
    setIsMutating(true);
    setGoalPlanMessage("");
    try {
      const result = await createProgressiveGoalAction(
        goalPlanInput,
        goalTargetDate || undefined
      );
      if (!result.success || !("data" in result)) {
        setGoalPlanMessage(result.error || "목표 계획을 만들지 못했습니다.");
        return;
      }
      await commitTransaction([
        ...events,
        ...(result.data as CalendarEvent[]),
      ]);
      setGoalPlanMessage("6개의 2주 스프린트를 일정에 등록했습니다.");
      setGoalPlanInput("");
    } finally {
      setIsMutating(false);
    }
  };

  return {
    currentYear,
    setCurrentYear,
    currentMonth,
    setCurrentMonth,
    selectedDate,
    setSelectedDate,
    panelMode,
    setRightPanelMode,
    isSyncing,
    isMutating,
    mutationError,
    monthlyGoal,
    setMonthlyGoal,
    events,
    setEvents,
    enabledCategories,
    setEnabledCategories,
    editingEventId,
    formTitle,
    setFormTitle,
    formCategory,
    setFormCategory,
    formStart,
    setFormStart,
    formEnd,
    setFormEnd,
    formTasks,
    setFormTasks,
    taskInput,
    setTaskTasksInput,
    calendarWeeks,
    getEventsForDate,
    getWeekPlacedEvents,
    handlePrevMonth,
    handleNextMonth,
    handleDateDoubleClick,
    triggerEditMode,
    handleAddTaskInForm,
    handleSaveForm,
    handleDeleteEvent,
    handleToggleTaskDone,
    goalPlanInput,
    setGoalPlanInput,
    goalTargetDate,
    setGoalTargetDate,
    goalPlanMessage,
    handleCreateGoalPlan,
    commitTransaction,
    fetchCloudData,
  };
}
