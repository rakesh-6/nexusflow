import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import { z } from "zod";
import type { DueGroup } from "./dates.ts";
import {
  PRIORITIES,
  type LabelSummary,
  type PersonSummary,
  type Priority,
  type ProjectAccess,
  type ProjectRole,
} from "./projects.ts";
import { richTextDocSchema, type RichTextDoc } from "./richText.ts";
import { STATUS_CATEGORIES, type StatusCategory } from "./taskStatuses.ts";

// Tasks (PRD §11.6, §11.7), shared by the API and the web app.

export const MAX_LABELS_PER_TASK = 20;
export const MAX_ASSIGNEES_PER_TASK = 20;
export const MAX_BULK_TASKS = 100;
/** Cards a board column shows before "Load more" (PRD AC-VIEW-05). */
export const BOARD_COLUMN_PAGE = 200;
export const TASK_TRASH_DAYS = 30;

export const TASK_SORT_FIELDS = [
  "position",
  "priority",
  "dueDate",
  "createdAt",
  "updatedAt",
  "title",
  "estimatedHours",
  "number",
] as const;
export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];
/** A sort field, newest/highest first when it starts with "-", e.g. "-priority". */
export type TaskSort = TaskSortField | `-${TaskSortField}`;

/** "NEX" and 42 -> "NEX-42". */
export const taskKey = (projectKey: string, number: number) => `${projectKey}-${number}`;

/** "nex-42" -> { projectKey: "NEX", number: 42 }, or null. */
export function parseTaskKey(key: string): { projectKey: string; number: number } | null {
  const match = /^([A-Za-z0-9]{2,6})-(\d{1,9})$/.exec(key.trim());
  if (!match) return null;
  return { projectKey: (match[1] as string).toUpperCase(), number: Number(match[2]) };
}

// ---------------------------------------------------------------------------
// Card order (fractional indexing, PRD §11.6.6)
// ---------------------------------------------------------------------------

/** A position between two neighbours (null = column edge), or null if they are out of order. */
export function positionBetween(after: string | null, before: string | null): string | null {
  if (after !== null && before !== null && after >= before) return null;
  try {
    return generateKeyBetween(after, before);
  } catch {
    return null;
  }
}

/** `count` evenly spread positions, used to renumber a whole column. */
export const freshPositions = (count: number, after: string | null = null) =>
  generateNKeysBetween(after, null, count);

/** Keys grow a little with every move between the same two cards; renumber past this. */
export const MAX_POSITION_LENGTH = 50;

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/**
 * True if "blocking blocks blocked" would close a loop, e.g. A→B exists and
 * someone adds B→A, or A→B→C exists and someone adds C→A (PRD AC-TASK-03).
 */
export function wouldCreateCycle(
  edges: readonly { blockingTaskId: string; blockedTaskId: string }[],
  blockingTaskId: string,
  blockedTaskId: string,
): boolean {
  if (blockingTaskId === blockedTaskId) return true;
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    next.set(edge.blockingTaskId, [...(next.get(edge.blockingTaskId) ?? []), edge.blockedTaskId]);
  }
  // Can we already get from `blocked` to `blocking`? Then the new edge closes a loop.
  const seen = new Set<string>();
  const stack = [blockedTaskId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === blockingTaskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(next.get(current) ?? []));
  }
  return false;
}

/** Contributors delete tasks they created; project managers delete any (PRD §11.6.10). */
export const canDeleteTask = (access: ProjectAccess, createdById: string, userId: string) =>
  access.canManage || (access.canContribute && createdById === userId);

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const dateOnly = z.iso.date({ message: "Use a date like 2026-11-18" });
const hours = z
  .number()
  .min(0, "Use 0 or more")
  .max(9999, "Use at most 9,999 hours")
  .transform((value) => Math.round(value * 100) / 100);
const estimate = z
  .number()
  .min(0, "Use 0 or more")
  .max(9999, "Use at most 9,999 hours")
  .refine((value) => Number.isInteger(Math.round(value * 1e6) / 2.5e5), "Use steps of 0.25 hours");
const ids = (max: number, message: string) => z.array(z.uuid()).max(max, message);

const taskFields = z.object({
  title: z.string().trim().min(1, "Give the task a title").max(200, "Use at most 200 characters"),
  description: richTextDocSchema.nullable(),
  statusId: z.uuid(),
  priority: z.enum(PRIORITIES),
  assigneeIds: ids(MAX_ASSIGNEES_PER_TASK, "Use at most 20 assignees"),
  labelIds: ids(MAX_LABELS_PER_TASK, "Use at most 20 labels"),
  milestoneId: z.uuid().nullable(),
  startDate: dateOnly.nullable(),
  dueDate: dateOnly.nullable(),
  estimatedHours: estimate.nullable(),
  actualHours: hours.nullable(),
});

const dueAfterStart = (value: { startDate?: string | null; dueDate?: string | null }) =>
  !value.startDate || !value.dueDate || value.dueDate >= value.startDate;
const dueAfterStartIssue = {
  message: "The due date must be on or after the start date",
  path: ["dueDate"],
};

export const createTaskSchema = taskFields
  .partial()
  .required({ title: true })
  .extend({
    priority: z.enum(PRIORITIES).default("MEDIUM"),
    assigneeIds: taskFields.shape.assigneeIds.default([]),
    labelIds: taskFields.shape.labelIds.default([]),
    parentTaskId: z.uuid().optional(),
  })
  .refine(dueAfterStart, dueAfterStartIssue);

/** Partial changes plus the version you last saw (PRD §11.6.7). */
export const updateTaskSchema = taskFields
  .partial()
  .extend({
    /** Make it a subtask of another task, or null to make it a normal task again. */
    parentTaskId: z.uuid().nullable().optional(),
    version: z.number().int().min(1),
  })
  .refine(dueAfterStart, dueAfterStartIssue);

/** Put the task in `statusId`, after `afterTaskId` and before `beforeTaskId` (both optional). */
export const moveTaskSchema = z.object({
  statusId: z.uuid(),
  afterTaskId: z.uuid().nullable().optional(),
  beforeTaskId: z.uuid().nullable().optional(),
  version: z.number().int().min(1),
});

const bulkSetSchema = z
  .object({
    statusId: z.uuid().optional(),
    priority: z.enum(PRIORITIES).optional(),
    addAssigneeIds: ids(MAX_ASSIGNEES_PER_TASK, "Use at most 20 people").optional(),
    removeAssigneeIds: ids(MAX_ASSIGNEES_PER_TASK, "Use at most 20 people").optional(),
    addLabelIds: ids(MAX_LABELS_PER_TASK, "Use at most 20 labels").optional(),
    removeLabelIds: ids(MAX_LABELS_PER_TASK, "Use at most 20 labels").optional(),
    dueDate: dateOnly.nullable().optional(),
    milestoneId: z.uuid().nullable().optional(),
  })
  .refine((set) => Object.values(set).some((value) => value !== undefined), {
    message: "Choose something to change",
  });

/** Change or delete up to 100 tasks at once, all or nothing (PRD §11.6.9). */
export const bulkTaskSchema = z
  .object({
    taskIds: z
      .array(z.uuid())
      .min(1, "Select at least one task")
      .max(MAX_BULK_TASKS, "Select at most 100 tasks"),
    set: bulkSetSchema.optional(),
    action: z.literal("delete").optional(),
  })
  .refine((body) => (body.set ? !body.action : !!body.action), {
    message: 'Send either "set" or "action"',
  });

export const dependencySchema = z.object({
  otherTaskId: z.uuid(),
  /** BLOCKED_BY: the other task must finish first. BLOCKS: this task must finish first. */
  direction: z.enum(["BLOCKED_BY", "BLOCKS"]),
});

/** Query values arrive as text; lists may repeat (?a=1&a=2) or use commas (?a=1,2). */
const list = <T extends z.ZodType>(item: T, max = 50) =>
  z.preprocess((value) => {
    if (value === undefined || value === "") return undefined;
    const items = Array.isArray(value) ? value : String(value).split(",");
    return items.map((entry) => String(entry).trim()).filter(Boolean);
  }, z.array(item).max(max).optional());

const sortValue = z
  .string()
  .regex(new RegExp(`^-?(${TASK_SORT_FIELDS.join("|")})$`), "Unknown sort field")
  .transform((value) => value as TaskSort);

/** Task list filters (PRD §11.6.8). */
export const taskQuerySchema = z.object({
  statusId: list(z.uuid()),
  category: list(z.enum(STATUS_CATEGORIES)),
  priority: list(z.enum(PRIORITIES)),
  /** Person ids, "me" or "unassigned". */
  assigneeId: list(z.union([z.enum(["me", "unassigned"]), z.uuid()])),
  labelId: list(z.uuid()),
  milestoneId: list(z.uuid()),
  /** "null" for top-level tasks only, or a parent task's id. */
  parentTaskId: z.union([z.literal("null"), z.uuid()]).optional(),
  dueFrom: dateOnly.optional(),
  dueTo: dateOnly.optional(),
  createdFrom: dateOnly.optional(),
  createdTo: dateOnly.optional(),
  hasDueDate: z.stringbool().optional(),
  overdue: z.stringbool().optional(),
  hasAttachments: z.stringbool().optional(),
  q: z.string().trim().max(200).optional(),
  sort: list(sortValue, 3),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(BOARD_COLUMN_PAGE).default(50),
});

export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
export type BulkTaskInput = z.input<typeof bulkTaskSchema>;
export type TaskQuery = z.output<typeof taskQuerySchema>;

/** The filters the web app sends (a subset of TaskQuery, as plain values). */
export interface TaskFilters {
  statusId?: string[];
  category?: StatusCategory[];
  priority?: Priority[];
  assigneeId?: string[];
  labelId?: string[];
  milestoneId?: string[];
  parentTaskId?: "null" | string;
  dueFrom?: string;
  dueTo?: string;
  hasDueDate?: boolean;
  overdue?: boolean;
  q?: string;
  sort?: TaskSort[];
}

/** Turns filters into a query string the API understands, e.g. "priority=HIGH,LOW&limit=50". */
export function taskFiltersToQuery(filters: TaskFilters, extra: Record<string, string> = {}) {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries({ ...filters, ...extra })) {
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
      continue;
    }
    const text = Array.isArray(value) ? value.join(",") : String(value);
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(text)}`);
  }
  return pairs.join("&");
}

// ---------------------------------------------------------------------------
// What the API answers
// ---------------------------------------------------------------------------

export interface TaskStatusRef {
  id: string;
  name: string;
  color: string;
  category: StatusCategory;
}

export interface TaskSummary {
  id: string;
  key: string;
  number: number;
  projectId: string;
  title: string;
  status: TaskStatusRef;
  priority: Priority;
  assignees: PersonSummary[];
  labels: LabelSummary[];
  milestone: { id: string; name: string } | null;
  parentTaskId: string | null;
  startDate: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  position: string;
  /** Send it back when changing the task, so two people cannot overwrite each other. */
  version: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reporter: PersonSummary;
  createdById: string;
  subtaskCount: number;
  doneSubtaskCount: number;
  /** Blocking tasks that are not done yet (the card shows a chain icon). */
  openBlockerCount: number;
  commentCount: number;
  attachmentCount: number;
}

export interface TaskLink {
  dependencyId: string;
  id: string;
  key: string;
  title: string;
  status: TaskStatusRef;
}

export interface TaskDetail extends TaskSummary {
  description: RichTextDoc | null;
  project: { id: string; key: string; name: string; workspaceId: string };
  parent: { id: string; key: string; title: string } | null;
  subtasks: TaskSummary[];
  blockedBy: TaskLink[];
  blocks: TaskLink[];
  canEdit: boolean;
  canDelete: boolean;
}

export interface BoardColumn {
  statusId: string;
  /** All matching tasks in the column; `tasks` holds the first page. */
  total: number;
  tasks: TaskSummary[];
  /** Pass to the task list (with this statusId) to load the next cards, or null. */
  nextCursor: string | null;
}

/** Someone who may be assigned tasks in a project (contributors and managers). */
export interface AssignablePerson extends PersonSummary {
  role: ProjectRole;
}

export interface MyTask extends TaskSummary {
  project: { id: string; key: string; name: string };
  group: DueGroup;
}

export interface MyTasksResult {
  today: string;
  tasks: MyTask[];
  /** Each project's columns, for the quick status change. */
  projects: { id: string; key: string; name: string; statuses: TaskStatusRef[] }[];
}

export interface TrashedTask {
  id: string;
  key: string;
  title: string;
  deletedAt: string;
  /** The last moment it can be restored. */
  purgeAfter: string;
}

export interface ActivityEntry {
  id: string;
  action: string;
  actorName: string;
  changes: unknown;
  metadata: unknown;
  createdAt: string;
}

/** One changed field in an activity entry. */
export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}
