import type { CareLog, CareRoutine } from "../schemas/life";

export interface PendingCareOccurrence {
  id: string;
  routineId: string;
  title: string;
  kind: CareRoutine["kind"];
  instructions?: string;
  scheduledAt: string;
}

const koreaClock = (date: Date) => new Date(date.getTime() + 9 * 60 * 60 * 1000);
const localDate = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

export function pendingCareOccurrences(
  routines: CareRoutine[],
  logs: CareLog[],
  now: Date,
  lookbackDays = 14,
): PendingCareOccurrence[] {
  const resolved = new Set(logs.map((log) => log.id));
  const result: PendingCareOccurrence[] = [];
  const koreaNow = koreaClock(now);
  const start = new Date(koreaNow);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - lookbackDays);

  for (let cursor = new Date(start); cursor <= koreaNow; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = localDate(cursor);
    for (const routine of routines) {
      if (
        !routine.active ||
        date < routine.startDate ||
        (routine.endDate && date > routine.endDate) ||
        !routine.daysOfWeek.includes(cursor.getUTCDay())
      ) continue;

      for (const time of routine.times) {
        const scheduledAt = `${date}T${time}:00+09:00`;
        const scheduled = new Date(scheduledAt);
        const id = `${routine.id}_${date}_${time.replace(":", "")}`;
        if (scheduled <= now && !resolved.has(id)) {
          result.push({
            id,
            routineId: routine.id,
            title: routine.title,
            kind: routine.kind,
            instructions: routine.instructions,
            scheduledAt,
          });
        }
      }
    }
  }
  return result.sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
}
