"use client";

import { useRef } from "react";
import {
  useTimeTreeCalendar,
  CategoryType,
  CATEGORY_LIST,
  CATEGORY_OPTIONS,
  COLOR_MAP,
  CalendarEvent, // 🚀 [추가]: 어댑터 규격의 타입 수입냥!
} from "@ink/assembler";

type CalendarContextType = ReturnType<typeof useTimeTreeCalendar>;

function ArrowLeftIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-3 h-3 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="3"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

export function CalendarHeader({ c }: { c: CalendarContextType }) {
  return (
    <div className="px-6 py-4 border-b border-stone-100 bg-stone-50/50 flex flex-col sm:flex-row gap-4 justify-between items-center">
      <div className="flex items-center gap-3">
        <div className="w-9 h-10 bg-stone-900 text-white rounded-xl flex items-center justify-center font-mono font-black text-xs select-none">
          INK
        </div>
        <div>
          <h3 className="font-extrabold text-stone-900 text-base leading-none">
            InkTree 스마트 캘린더
          </h3>
          <p className="text-[9px] text-stone-400 font-mono mt-1 uppercase tracking-widest">
            {c.isSyncing
              ? "⏳ 클라우드 동기화 중..."
              : "⚡ 하이브리드 영속성 엔진 기동 중"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center border border-stone-200/70 rounded-xl bg-white p-0.5 shadow-4xs">
          <button
            onClick={c.handlePrevMonth}
            className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-50 rounded-lg cursor-pointer"
          >
            <ArrowLeftIcon />
          </button>
          <button
            onClick={() => {
              const d = new Date();
              const year = d.getFullYear();
              const month = d.getMonth() + 1;
              const todayStr = `${year}-${String(month).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              c.setCurrentYear(year);
              c.setCurrentMonth(month);
              c.setSelectedDate(todayStr);
            }}
            className="px-3 py-1 text-xs font-bold text-stone-700 hover:bg-stone-50 rounded-md transition-colors cursor-pointer"
          >
            Today
          </button>
          <button
            onClick={c.handleNextMonth}
            className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-50 rounded-lg cursor-pointer"
          >
            <ArrowRightIcon />
          </button>
        </div>
        <span className="text-sm font-black text-stone-900 tracking-tight select-none">
          {c.currentYear}년 {c.currentMonth}월
        </span>
      </div>
    </div>
  );
}

export function CalendarLeftGrid({
  c,
  onOpenMobilePanel,
  dayMarkers = {},
  showScheduleEvents = true,
}: {
  c: CalendarContextType;
  onOpenMobilePanel?: () => void;
  dayMarkers?: Record<string, Array<{ color: string; label: string }>>;
  showScheduleEvents?: boolean;
}) {
  const d = new Date();
  const realTodayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const lastTapRef = useRef({ key: "", time: 0 });

  const openOnSecondTap = (key: string, time: number, open: () => void) => {
    if (!onOpenMobilePanel) return;
    if (lastTapRef.current.key === key && time - lastTapRef.current.time < 400) {
      lastTapRef.current = { key: "", time: 0 };
      open();
      onOpenMobilePanel();
      return;
    }
    lastTapRef.current = { key, time };
  };

  return (
    <div className="flex w-full flex-col bg-white">
      <div className="grid grid-cols-7 text-center py-2 border-b border-stone-100 bg-stone-50/20 font-mono select-none">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName, idx) => (
          <span
            key={dayName}
            className={`text-[10px] font-bold uppercase tracking-wider ${idx === 0 ? "text-red-400" : idx === 6 ? "text-sky-400" : "text-stone-400"}`}
          >
            {dayName}
          </span>
        ))}
      </div>
      <div className="flex-1 flex flex-col divide-y divide-stone-100 border-b border-stone-100 select-none">
        {c.calendarWeeks.map((week, wIdx) => {
          const weekPlacedEvents = showScheduleEvents ? c.getWeekPlacedEvents(week) : [];
          const mobileOverflow = weekPlacedEvents.filter(({ trackIdx }) => trackIdx > 2);
          const desktopOverflow = weekPlacedEvents.filter(({ trackIdx }) => trackIdx > 3);
          const openOverflow = (event: CalendarEvent) => {
            const visibleDate =
              event.startDate < week[0].dateStr ? week[0].dateStr : event.startDate;
            c.setSelectedDate(visibleDate);
            c.setRightPanelMode("VIEW");
            onOpenMobilePanel?.();
          };
          return (
            <div
              key={wIdx}
              className="relative min-h-[84px] flex-1 w-full group sm:min-h-[96px] xl:min-h-0"
            >
              <div className="absolute inset-0 grid grid-cols-7 divide-x divide-stone-100">
                {week.map((day, dIdx) => {
                  const isToday = day.dateStr === realTodayStr;
                  const isSelected = day.dateStr === c.selectedDate;
                  return (
                    <div
                      key={day.dateStr}
                      onClick={(clickEvent) => {
                        c.setSelectedDate(day.dateStr);
                        openOnSecondTap(`day:${day.dateStr}`, clickEvent.timeStamp, () =>
                          c.setRightPanelMode("VIEW"),
                        );
                      }}
                      onDoubleClick={() => {
                        if (!onOpenMobilePanel) c.handleDateDoubleClick(day.dateStr);
                      }}
                      className={`touch-manipulation p-1.5 flex flex-col h-full transition-colors relative ${day.isCurrentMonth ? "bg-white" : "bg-stone-50/30 text-stone-300"} ${isSelected ? "bg-stone-50/80 ring-2 ring-stone-900 ring-inset z-10" : ""}`}
                    >
                      <span
                        className={`text-[11px] font-black w-5 h-5 flex items-center justify-center rounded-full ${isToday ? "bg-stone-900 text-white shadow-xs" : dIdx === 0 ? "text-red-400" : dIdx === 6 ? "text-sky-400" : "text-stone-700"}`}
                      >
                        {day.dayNumber}
                      </span>
                      {dayMarkers[day.dateStr]?.length ? (
                        <div
                          className="absolute right-1.5 top-2 flex gap-0.5"
                          aria-label={dayMarkers[day.dateStr].map((marker) => marker.label).join(", ")}
                        >
                          {dayMarkers[day.dateStr].slice(0, 3).map((marker) => (
                            <span
                              key={`${marker.label}-${marker.color}`}
                              className={`h-1.5 w-1.5 rounded-full ${marker.color}`}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="absolute top-7 left-0 right-0 bottom-1 grid grid-cols-7 gap-y-1 auto-rows-[17px] pointer-events-none z-20 overflow-hidden">
                {weekPlacedEvents.map(
                  ({ event, startCol, endCol, trackIdx }) => {
                    const startsThisWeek = event.startDate >= week[0].dateStr;
                    const endsThisWeek = event.endDate <= week[6].dateStr;
                    return (
                      <div
                        key={event.id}
                        style={{
                          gridColumnStart: startCol,
                          gridColumnEnd: endCol,
                          gridRowStart: trackIdx,
                        }}
                        className={`${trackIdx <= 2 ? "flex" : trackIdx === 3 ? "hidden sm:flex" : "hidden"} text-[9px] px-2 leading-none transition-all truncate hover:brightness-95 items-center shadow-4xs pointer-events-auto cursor-pointer font-bold ${COLOR_MAP[event.category as CategoryType] || "bg-stone-800 text-white"} ${startsThisWeek ? "rounded-l-lg ml-1" : ""} ${endsThisWeek ? "rounded-r-lg mr-1" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          c.setSelectedDate(event.startDate);
                          openOnSecondTap(`event:${event.id}`, e.timeStamp, () =>
                            c.setRightPanelMode("VIEW"),
                          );
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (!onOpenMobilePanel) {
                            c.triggerEditMode(event as CalendarEvent);
                          }
                        }}
                      >
                        <span className="truncate tracking-tight">
                          {event.title}
                        </span>
                      </div>
                    );
                  },
                )}
              </div>
              {mobileOverflow.length > 0 && (
                <button
                  type="button"
                  onClick={() => openOverflow(mobileOverflow[0].event as CalendarEvent)}
                  className="absolute bottom-1 right-1 z-30 rounded-md bg-white/95 px-1.5 py-0.5 text-[9px] font-black text-stone-600 shadow-sm sm:hidden"
                >
                  +{mobileOverflow.length}개
                </button>
              )}
              {desktopOverflow.length > 0 && (
                <button
                  type="button"
                  onClick={() => openOverflow(desktopOverflow[0].event as CalendarEvent)}
                  className="absolute bottom-1 right-1 z-30 hidden rounded-md bg-white/95 px-1.5 py-0.5 text-[9px] font-black text-stone-600 shadow-sm sm:block"
                >
                  +{desktopOverflow.length}개
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarRightPanel({
  c,
  compact = false,
}: {
  c: CalendarContextType;
  compact?: boolean;
}) {
  return (
    <div className="min-h-0 bg-stone-50/50 p-5 flex flex-col h-full justify-between overflow-hidden">
      {c.mutationError && (
        <p role="alert" className="mb-3 shrink-0 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {c.mutationError}
        </p>
      )}
      {c.panelMode === "VIEW" ? (
        <div className="space-y-5 flex-1 flex flex-col overflow-hidden">
          <div className={`${compact ? "hidden" : ""} bg-white border border-stone-200/60 p-4 rounded-2xl shadow-4xs shrink-0`}>
            <h4 className="text-[10px] font-mono font-black text-stone-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5 select-none">
              🎯 Monthly Goal (이중 실시간 동기화)
            </h4>
            <textarea
              value={c.monthlyGoal}
              onChange={(e) => c.setMonthlyGoal(e.target.value)}
              onBlur={(e) => c.commitTransaction(c.events, e.target.value)}
              className="w-full text-xs font-bold text-stone-700 bg-transparent resize-none focus:outline-none focus:bg-stone-50 border-0 p-1 rounded-lg leading-relaxed"
              rows={3}
              placeholder="이번 달 목표를 기입해라냥..."
            />
          </div>
          <div className={`${compact ? "hidden" : ""} shrink-0 rounded-2xl border border-stone-200/60 bg-white p-4 shadow-4xs`}>
            <h4 className="mb-2 text-[10px] font-black uppercase tracking-widest text-stone-500">
              🎯 2주 스프린트 역산
            </h4>
            <div className="grid gap-2">
              <input
                value={c.goalPlanInput}
                onChange={(event) => c.setGoalPlanInput(event.target.value)}
                placeholder="예: 3개월 뒤 바디프로필"
                className="rounded-xl border border-stone-200 px-3 py-2 text-xs"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={c.goalTargetDate}
                  onChange={(event) => c.setGoalTargetDate(event.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-stone-200 px-2 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={c.handleCreateGoalPlan}
                  disabled={c.isMutating || !c.goalPlanInput.trim()}
                  className="rounded-xl bg-stone-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                >
                  6단계 생성
                </button>
              </div>
              {c.goalPlanMessage && (
                <p className="text-[10px] text-stone-500">{c.goalPlanMessage}</p>
              )}
            </div>
          </div>
          <div className="flex-1 bg-white border border-stone-200/60 p-4 rounded-2xl shadow-4xs flex flex-col overflow-hidden">
            <div className="flex justify-between items-center border-b border-stone-100 pb-2.5 mb-3 select-none">
              <span className="text-xs font-black text-stone-900 font-mono tracking-wider">
                📅 INFO: {c.selectedDate}
              </span>
              <span className="text-[9px] text-stone-400 font-mono font-semibold">
                Click ✏️ to Update
              </span>
            </div>
            <div className="scrollbar-hidden overscroll-contain space-y-3 flex-1 overflow-y-auto pr-1">
              {c.getEventsForDate(c.selectedDate).length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-16 select-none">
                  <span className="text-base">🐾</span>
                  <p className="text-xs text-stone-400 mt-2 font-medium">
                    선택 날짜에 기록이 없다냥.
                    <br />
                    빈칸 더블클릭 기입 단자 작동!
                  </p>
                </div>
              ) : (
                c.getEventsForDate(c.selectedDate).map((e) => (
                  <div
                    key={e.id}
                    className="p-3 bg-stone-50/80 border border-stone-200/40 rounded-xl space-y-2"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2 max-w-[75%]">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${(COLOR_MAP[e.category] || "bg-stone-800").split(" ")[0]}`}
                        />
                        <span className="text-xs font-extrabold text-stone-800 truncate">
                          {e.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => c.triggerEditMode(e)}
                          className="text-stone-400 hover:text-stone-900 cursor-pointer p-0.5"
                        >
                          <EditIcon />
                        </button>
                        <button
                          onClick={() => c.handleDeleteEvent(e.id)}
                          className="text-stone-400 hover:text-red-500 cursor-pointer p-0.5"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                    {e.sharedByName && (
                      <p className="text-[9px] font-bold text-violet-600">
                        {e.sharedByName}님이 공개한 일정
                      </p>
                    )}
                    {e.tasks && e.tasks.length > 0 && (
                      <div className="pt-1.5 border-t border-stone-200/60 space-y-1">
                        {e.tasks.map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center gap-2 text-[10px] text-stone-600 font-medium"
                          >
                            <button
                              onClick={() => c.handleToggleTaskDone(e.id, t.id)}
                              className={`w-3.5 h-3.5 rounded border border-stone-300 flex items-center justify-center cursor-pointer transition-colors ${t.isDone ? "bg-stone-900 border-stone-900" : "bg-white"}`}
                            >
                              {t.isDone && <CheckIcon />}
                            </button>
                            <span
                              className={
                                t.isDone
                                  ? "line-through text-stone-400 font-normal"
                                  : "text-stone-700"
                              }
                            >
                              {t.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {e.lastModifiedByName && (
                      <p className="text-[9px] text-stone-400">
                        마지막 수정: {e.lastModifiedByName}
                        {e.lastModifiedAt
                          ? ` · ${new Date(e.lastModifiedAt).toLocaleString("ko-KR")}`
                          : ""}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <form
          onSubmit={c.handleSaveForm}
          className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-3xs flex flex-col gap-4 flex-1 overflow-hidden"
        >
          <div className="border-b border-stone-100 pb-2 flex justify-between items-center">
            <span className="text-xs font-black text-rose-600 uppercase tracking-widest font-mono">
              {c.editingEventId ? "📝 메모리 수정창" : "➕ 새 일정 추가창"}
            </span>
            <span className="text-[10px] font-mono font-bold text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
              {c.selectedDate}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-stone-400 uppercase tracking-wider">
              일정 이름
            </label>
            <input
              type="text"
              required
              placeholder="예: 단축근무 정산 및 행낭 인계"
              value={c.formTitle}
              onChange={(e) => c.setFormTitle(e.target.value)}
              className="w-full border border-stone-200 rounded-xl p-2.5 text-xs font-bold text-stone-800 focus:outline-none focus:border-stone-400 bg-stone-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-stone-400 uppercase tracking-wider">
              일정 분류
            </label>
            <select
              value={c.formCategory}
              onChange={(e) =>
                c.setFormCategory(e.target.value as CategoryType)
              }
              className="w-full border border-stone-200 rounded-xl p-2.5 text-xs font-bold text-stone-700 bg-stone-50 cursor-pointer focus:outline-none focus:border-stone-400"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-stone-400 uppercase tracking-wider">
                시작 날짜
              </label>
              <input
                type="date"
                value={c.formStart}
                onChange={(e) => c.setFormStart(e.target.value)}
                className="w-full border border-stone-200 rounded-xl p-2 text-[11px] font-medium bg-stone-50 text-stone-800"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-stone-400 uppercase tracking-wider">
                종료 날짜
              </label>
              <input
                type="date"
                value={c.formEnd}
                onChange={(e) => c.setFormEnd(e.target.value)}
                className="w-full border border-stone-200 rounded-xl p-2 text-[11px] font-medium bg-stone-50 text-stone-800"
              />
            </div>
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <label className="text-[10px] font-black text-stone-400 uppercase tracking-wider mb-1">
              📋 하위 소분 업무 팩토리
            </label>
            <div className="flex gap-1.5 mb-2 shrink-0">
              <input
                type="text"
                placeholder="세부 할 일을 입력해라냥..."
                value={c.taskInput}
                onChange={(e) => c.setTaskTasksInput(e.target.value)}
                className="flex-1 border border-stone-200 rounded-xl p-2 text-xs bg-stone-50 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    c.handleAddTaskInForm();
                  }
                }}
              />
              <button
                type="button"
                onClick={c.handleAddTaskInForm}
                className="bg-stone-900 text-white text-xs font-black px-3.5 rounded-xl cursor-pointer"
              >
                +
              </button>
            </div>
            <div className="scrollbar-hidden overscroll-contain flex-1 overflow-y-auto space-y-1 border border-stone-100 rounded-xl p-2 bg-stone-50/50 max-h-28">
              {c.formTasks.length === 0 ? (
                <span className="text-[10px] text-stone-400 block text-center py-4 italic">
                  태스크가 없다냥 🐾
                </span>
              ) : (
                c.formTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex justify-between items-center bg-white border border-stone-200/50 px-2 py-1.5 rounded-lg text-[10px] text-stone-700"
                  >
                    <span className="truncate max-w-[85%]">▪️ {t.text}</span>
                    <button
                      type="button"
                      onClick={() =>
                        c.setFormTasks((prev) =>
                          prev.filter((x) => x.id !== t.id),
                        )
                      }
                      className="text-stone-400 hover:text-red-500 font-extrabold cursor-pointer"
                    >
                      x
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-100 shrink-0">
            <button
              type="button"
              onClick={() => c.setRightPanelMode("VIEW")}
              className="bg-stone-100 text-stone-700 font-bold p-2.5 rounded-xl text-xs cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              className="bg-stone-900 text-white font-bold p-2.5 rounded-xl text-xs cursor-pointer"
            >
              장부 저장
            </button>
          </div>
        </form>
      )}
      <div className={`${compact ? "hidden" : ""} mt-4 pt-4 border-t border-stone-100 grid grid-cols-2 sm:grid-cols-3 gap-2 shrink-0`}>
        {CATEGORY_LIST.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() =>
              c.setEnabledCategories((prev) => ({
                ...prev,
                [cat.id]: !prev[cat.id],
              }))
            }
            className={`p-2 rounded-xl text-[10px] font-bold border text-left flex items-center gap-2 transition-all cursor-pointer ${c.enabledCategories[cat.id] ? "bg-white border-stone-300 text-stone-800 shadow-5xs" : "bg-stone-100/50 border-stone-200 text-stone-400 opacity-60"}`}
          >
            <span className={`w-2 h-2 rounded-full ${cat.color}`} />
            <span className="truncate">{cat.label || cat.id}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
