// Calendar dates as plain "2026-11-19" text (PRD A-19). Due dates have no time
// of day, so comparing and adding days on this text is exact, with no time
// zone surprises. Only "today" depends on where the person is.

/** A calendar date like "2026-11-19". */
export type DateOnly = string;

const parse = (date: DateOnly) => new Date(`${date}T00:00:00Z`);
const format = (date: Date): DateOnly => date.toISOString().slice(0, 10);

/** Today's date for someone in `timeZone` (e.g. "Asia/Kolkata"); UTC if the zone is unknown. */
export function todayIn(timeZone: string, now = new Date()): DateOnly {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return format(now);
  }
}

/** The hour of the day (0–23) for someone in `timeZone`; UTC if the zone is unknown. */
export function hourIn(timeZone: string, now = new Date()): number {
  try {
    const hour = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" })
      .formatToParts(now)
      .find((part) => part.type === "hour")?.value;
    return Number(hour ?? now.getUTCHours());
  } catch {
    return now.getUTCHours();
  }
}

export function addDays(date: DateOnly, days: number): DateOnly {
  const result = parse(date);
  result.setUTCDate(result.getUTCDate() + days);
  return format(result);
}

/** 0 = Monday … 6 = Sunday (weeks start on Monday). */
export const dayOfWeek = (date: DateOnly) => (parse(date).getUTCDay() + 6) % 7;
export const startOfWeek = (date: DateOnly) => addDays(date, -dayOfWeek(date));
export const startOfMonth = (date: DateOnly) => `${date.slice(0, 7)}-01`;

export function addMonths(date: DateOnly, months: number): DateOnly {
  const result = parse(startOfMonth(date));
  result.setUTCMonth(result.getUTCMonth() + months);
  return format(result);
}

/** The 42 days (6 weeks) a month calendar shows, starting on a Monday. */
export function monthGrid(date: DateOnly): DateOnly[] {
  const first = startOfWeek(startOfMonth(date));
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

/** Monday to Sunday of the week that contains `date`. */
export function weekDays(date: DateOnly): DateOnly[] {
  const first = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}

/** The groups on the My Tasks page (PRD §11.6.11). */
export const DUE_GROUPS = ["OVERDUE", "TODAY", "THIS_WEEK", "LATER", "NO_DATE"] as const;
export type DueGroup = (typeof DUE_GROUPS)[number];

/** "This week" means after today and up to Sunday. */
export function dueGroup(dueDate: DateOnly | null, today: DateOnly): DueGroup {
  if (!dueDate) return "NO_DATE";
  if (dueDate < today) return "OVERDUE";
  if (dueDate === today) return "TODAY";
  return dueDate <= addDays(startOfWeek(today), 6) ? "THIS_WEEK" : "LATER";
}

/** Overdue = due before today and not done (PRD §11.6.3). */
export const isOverdue = (dueDate: DateOnly | null, category: string, today: DateOnly) =>
  !!dueDate && dueDate < today && category !== "DONE";
