// 📂 packages/engine/src/core/calendarCore.ts (또는 export 단자)

export type CategoryType = "WORK" | "UTILITY" | "PERSONAL" | "HOLIDAY" | "GLOBAL";

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
  category: CategoryType;
  colorClass: string;
  tasks?: ChecklistTask[];
}

export interface CalendarDay {
  dateStr: string;
  dayNumber: number;
  isCurrentMonth: boolean;
}

/**
 * 📅 July, 2026 등 특정 년/월의 7일 격자 매트릭스를 연산하는 순수 수학 함수냥
 */
export function computeCalendarWeeks(currentYear: number, currentMonth: number): CalendarDay[][] {
  const firstDayInstance = new Date(currentYear, currentMonth - 1, 1);
  const startDayOfWeek = firstDayInstance.getDay(); 
  const totalDaysInMonth = new Date(currentYear, currentMonth, 0).getDate();

  const weeksGrid: CalendarDay[][] = [];
  let currentWeek: CalendarDay[] = [];

  const prevMonthLastDay = new Date(currentYear, currentMonth - 1, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const prevDay = prevMonthLastDay - i;
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    currentWeek.push({
      dateStr: `${prevYear}-${prevMonth < 10 ? `0${prevMonth}` : prevMonth}-${prevDay < 10 ? `0${prevDay}` : prevDay}`,
      dayNumber: prevDay, isCurrentMonth: false,
    });
  }

  for (let day = 1; day <= totalDaysInMonth; day++) {
    if (currentWeek.length === 7) {
      weeksGrid.push(currentWeek);
      currentWeek = [];
    }
    currentWeek.push({
      dateStr: `${currentYear}-${currentMonth < 10 ? `0${currentMonth}` : currentMonth}-${day < 10 ? `0${day}` : day}`,
      dayNumber: day, isCurrentMonth: true,
    });
  }

  let nextMonthDay = 1;
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
  while (currentWeek.length < 7) {
    currentWeek.push({
      dateStr: `${nextYear}-${nextMonth < 10 ? `0${nextMonth}` : nextMonth}-${nextMonthDay < 10 ? `0${nextMonthDay}` : nextMonthDay}`,
      dayNumber: nextMonthDay, isCurrentMonth: false,
    });
    nextMonthDay++;
  }
  weeksGrid.push(currentWeek);
  return weeksGrid;
}

export interface PlacedEventResult {
  event: CalendarEvent;
  startCol: number;
  endCol: number;
  trackIdx: number;
}

/**
 * 🚀 장기 일정이 중첩 없이 우아하게 가로지르도록 레이어(Track)를 동적 배정하는 코어 알고리즘이다냥
 */
export function getWeekPlacedEventsCore(
  week: CalendarDay[], 
  filteredEvents: CalendarEvent[]
): PlacedEventResult[] {
  const weekStartStr = week[0].dateStr;
  const weekEndStr = week[6].dateStr;
  
  const weekEvents = filteredEvents.filter(e => e.startDate <= weekEndStr && e.endDate >= weekStartStr);

  const sortedEvents = [...weekEvents].sort((a, b) => {
    const aLen = new Date(a.endDate).getTime() - new Date(a.startDate).getTime();
    const bLen = new Date(b.endDate).getTime() - new Date(b.startDate).getTime();
    if (bLen !== aLen) return bLen - aLen;
    return a.startDate.localeCompare(b.startDate);
  });

  const trackOccupancy: boolean[][] = [];
  const placed: PlacedEventResult[] = [];

  sortedEvents.forEach(evt => {
    let startIdx = 0;
    if (evt.startDate > weekStartStr) startIdx = week.findIndex(d => d.dateStr === evt.startDate);
    if (startIdx === -1) startIdx = 0;

    let endIdx = 6;
    if (evt.endDate < weekEndStr) endIdx = week.findIndex(d => d.dateStr === evt.endDate);
    if (endIdx === -1) endIdx = 6;

    let trackIdx = 0;
    while (true) {
      if (!trackOccupancy[trackIdx]) trackOccupancy[trackIdx] = Array(7).fill(false);
      let isFree = true;
      for (let col = startIdx; col <= endIdx; col++) {
        if (trackOccupancy[trackIdx][col]) { isFree = false; break; }
      }
      if (isFree) {
        for (let col = startIdx; col <= endIdx; col++) trackOccupancy[trackIdx][col] = true;
        break;
      }
      trackIdx++;
    }

    placed.push({
      event: evt,
      startCol: startIdx + 1,
      endCol: endIdx + 2,
      trackIdx: trackIdx + 1,
    });
  });

  return placed;
}
