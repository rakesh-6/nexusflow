import { z } from "zod";
import { addDays, type DateOnly } from "./dates.ts";
import type { PersonSummary, Priority } from "./projects.ts";
import type { StatusCategory } from "./taskStatuses.ts";

// Dashboard and analytics (PRD §11.12), shared by the API and the web app.

export const DEFAULT_RANGE_DAYS = 30;
export const MAX_RANGE_DAYS = 366;
/** Weekly capacity used for workload (PRD A-10). */
export const WEEKLY_CAPACITY_HOURS = 40;

/** Project health thresholds (PRD §11.12.3). */
export const HEALTH_RULES = {
  offTrackOverdueRatio: 0.2,
  atRiskOverdueRatio: 0.1,
  offTrackBehind: 0.25,
  atRiskBehind: 0.1,
} as const;

export const HEALTH = ["ON_TRACK", "AT_RISK", "OFF_TRACK", "NOT_SCHEDULED"] as const;
export type ProjectHealth = (typeof HEALTH)[number];

/**
 * How a project is doing: behind schedule (time used vs. work done), too many
 * overdue tasks, or past its end date while unfinished (PRD §11.12.3).
 */
export function projectHealth(input: {
  progress: number;
  startDate: DateOnly | null;
  endDate: DateOnly | null;
  openTasks: number;
  overdueTasks: number;
  today: DateOnly;
}): ProjectHealth {
  const overdueRatio = input.openTasks === 0 ? 0 : input.overdueTasks / input.openTasks;
  if (!input.startDate || !input.endDate) {
    if (overdueRatio >= HEALTH_RULES.offTrackOverdueRatio) return "OFF_TRACK";
    if (overdueRatio >= HEALTH_RULES.atRiskOverdueRatio) return "AT_RISK";
    return "NOT_SCHEDULED";
  }
  const day = (value: string) => new Date(`${value}T00:00:00Z`).getTime();
  const total = Math.max(day(input.endDate) - day(input.startDate), 1);
  const elapsed = Math.min(Math.max((day(input.today) - day(input.startDate)) / total, 0), 1);
  const behind = elapsed - input.progress / 100;
  if (
    (input.endDate < input.today && input.progress < 100) ||
    overdueRatio >= HEALTH_RULES.offTrackOverdueRatio ||
    behind >= HEALTH_RULES.offTrackBehind
  ) {
    return "OFF_TRACK";
  }
  if (overdueRatio >= HEALTH_RULES.atRiskOverdueRatio || behind >= HEALTH_RULES.atRiskBehind) {
    return "AT_RISK";
  }
  return "ON_TRACK";
}

const dateOnly = z.iso.date({ message: "Use a date like 2026-11-18" });

export const analyticsQuerySchema = z
  .object({
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    /** Only this project (the project Overview tab). */
    projectId: z.uuid().optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "The start must be on or before the end",
    path: ["from"],
  });

/** The days a range covers, both ends included. */
export const rangeDays = (from: DateOnly, to: DateOnly) =>
  Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
  ) + 1;

/** The requested range, or the last 30 days ending today. */
export function resolveRange(
  query: { from?: string | undefined; to?: string | undefined },
  today: DateOnly,
) {
  const to = query.to ?? today;
  const from = query.from ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  return { from, to };
}

/** Day buckets for short ranges, weeks up to four months, months beyond. */
export const granularityFor = (days: number) =>
  days <= 31 ? "day" : days <= 120 ? "week" : "month";

// ---------------------------------------------------------------------------
// What the API answers
// ---------------------------------------------------------------------------

export interface AnalyticsTiles {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  completedTasks: number;
  /** Tasks completed inside the chosen range. */
  completedInRange: number;
}

export interface ProjectStats {
  id: string;
  key: string;
  name: string;
  total: number;
  done: number;
  open: number;
  overdue: number;
  progress: number;
  health: ProjectHealth;
}

export interface WorkloadRow extends PersonSummary {
  openTasks: number;
  estimatedHours: number;
  /** Estimated hours of open tasks due in the next 7 days ÷ 40 h. */
  utilization: number;
}

export interface DeadlineRow {
  id: string;
  key: string;
  title: string;
  dueDate: string;
  priority: Priority;
  projectName: string;
}

export interface Analytics {
  range: { from: string; to: string; granularity: "day" | "week" | "month" };
  tiles: AnalyticsTiles;
  trend: { date: string; completed: number; created: number }[];
  byCategory: { category: StatusCategory; count: number }[];
  byPriority: { priority: Priority; count: number }[];
  projects: ProjectStats[];
  workload: WorkloadRow[];
  upcoming: DeadlineRow[];
  activity: {
    id: string;
    action: string;
    actorName: string;
    metadata: unknown;
    createdAt: string;
  }[];
  mine: {
    completed: number;
    actualHours: number;
    onTimeRate: number | null;
    avgCycleDays: number | null;
  };
}

// --- Search (PRD §11.13) ---------------------------------------------------------

export const SEARCH_TYPES = ["task", "project", "team", "user", "comment"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "Type something to search for").max(200),
  types: z
    .preprocess(
      (value) => (typeof value === "string" ? value.split(",").filter(Boolean) : value),
      z.array(z.enum(SEARCH_TYPES)).min(1),
    )
    .optional(),
  workspaceId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export interface SearchHit {
  id: string;
  title: string;
  /** A second line, e.g. the project name or an excerpt. */
  subtitle: string | null;
  /** The web address the result opens, e.g. "/acme/general/tasks/NEX-42". */
  path: string;
}

export type SearchResults = Record<SearchType, { items: SearchHit[]; total: number }>;
