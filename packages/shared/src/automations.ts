import { z } from "zod";
import { PRIORITIES, SETTABLE_PROJECT_STATUSES, type Priority } from "./projects.ts";
import { STATUS_CATEGORIES, type StatusCategory } from "./taskStatuses.ts";

// Automation rules (PRD §11.15): "when <trigger>, if <conditions>, then
// <actions>". Shared by the API (which checks and runs them) and the web
// builder (which edits them and shows the summary sentence).

export const MAX_CONDITIONS = 10;
export const MAX_ACTIONS = 5;
/** A rule's own actions may set off other rules, at most this deep (PRD §11.15.2). */
export const MAX_CHAIN_DEPTH = 3;
/** Rules that fail this many times in a row are switched off. */
export const MAX_CONSECUTIVE_FAILURES = 20;
/** Runs per organization per hour (BUSINESS has a higher cap). */
export const RUNS_PER_HOUR = { default: 1_000, BUSINESS: 10_000 } as const;

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export const TRIGGER_TYPES = [
  "TASK_CREATED",
  "TASK_STATUS_CHANGED",
  "TASK_ASSIGNED",
  "TASK_PRIORITY_CHANGED",
  "TASK_DUE_SOON",
  "TASK_COMPLETED",
  "ALL_PROJECT_TASKS_COMPLETED",
  "COMMENT_ADDED",
] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("TASK_CREATED") }),
  z.object({
    type: z.literal("TASK_STATUS_CHANGED"),
    /** Only when the task enters a column of this category, or this exact column. */
    toCategory: z.enum(STATUS_CATEGORIES).optional(),
    toStatusId: z.uuid().optional(),
  }),
  z.object({ type: z.literal("TASK_ASSIGNED") }),
  z.object({ type: z.literal("TASK_PRIORITY_CHANGED"), to: z.enum(PRIORITIES).optional() }),
  z.object({
    type: z.literal("TASK_DUE_SOON"),
    hours: z.number().int().min(1).max(168).default(24),
  }),
  z.object({ type: z.literal("TASK_COMPLETED") }),
  z.object({ type: z.literal("ALL_PROJECT_TASKS_COMPLETED") }),
  z.object({ type: z.literal("COMMENT_ADDED") }),
]);
export type Trigger = z.infer<typeof triggerSchema>;

// ---------------------------------------------------------------------------
// Conditions: all must pass (AND)
// ---------------------------------------------------------------------------

export const CONDITION_FIELDS = [
  "status.category",
  "statusId",
  "priority",
  "assigneeIds",
  "labelIds",
  "dueDate",
  "estimatedHours",
] as const;
export type ConditionField = (typeof CONDITION_FIELDS)[number];

export const CONDITION_OPS = [
  "eq",
  "neq",
  "in",
  "notIn",
  "contains",
  "gte",
  "lte",
  "isEmpty",
  "isNotEmpty",
] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

const conditionValue = z.union([
  z.string().max(100),
  z.number(),
  z.array(z.string().max(100)).max(50),
  z.null(),
]);

export const conditionSchema = z
  .object({
    field: z.enum(CONDITION_FIELDS),
    op: z.enum(CONDITION_OPS),
    value: conditionValue.optional(),
  })
  .refine((c) => c.op === "isEmpty" || c.op === "isNotEmpty" || c.value !== undefined, {
    message: "This condition needs a value",
    path: ["value"],
  })
  .refine((c) => (c.op !== "in" && c.op !== "notIn") || Array.isArray(c.value), {
    message: "Choose one or more values",
    path: ["value"],
  });
export type Condition = z.infer<typeof conditionSchema>;

/** What conditions are checked against: the task as it is now. */
export interface TaskSnapshot {
  statusId: string;
  statusCategory: StatusCategory;
  priority: Priority;
  assigneeIds: string[];
  labelIds: string[];
  /** YYYY-MM-DD or null. */
  dueDate: string | null;
  estimatedHours: number | null;
}

function fieldValue(task: TaskSnapshot, field: ConditionField): string | number | string[] | null {
  switch (field) {
    case "status.category":
      return task.statusCategory;
    case "statusId":
      return task.statusId;
    case "priority":
      return task.priority;
    case "assigneeIds":
      return task.assigneeIds;
    case "labelIds":
      return task.labelIds;
    case "dueDate":
      return task.dueDate;
    case "estimatedHours":
      return task.estimatedHours;
  }
}

const PRIORITY_RANK: Record<Priority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 };

/** Makes priorities comparable with gte/lte ("priority at least HIGH"). */
const comparable = (field: ConditionField, value: unknown) =>
  field === "priority" && typeof value === "string" && value in PRIORITY_RANK
    ? PRIORITY_RANK[value as Priority]
    : value;

export function conditionPasses(task: TaskSnapshot, condition: Condition): boolean {
  const actual = fieldValue(task, condition.field);
  const expected = condition.value;
  const list = Array.isArray(actual) ? actual : actual === null ? [] : [String(actual)];
  switch (condition.op) {
    case "isEmpty":
      return list.length === 0;
    case "isNotEmpty":
      return list.length > 0;
    case "eq":
      return Array.isArray(actual) ? false : actual === expected;
    case "neq":
      return Array.isArray(actual) ? false : actual !== expected;
    case "in":
      return Array.isArray(expected) && list.some((value) => expected.includes(value));
    case "notIn":
      return Array.isArray(expected) && !list.some((value) => expected.includes(value));
    case "contains":
      return typeof expected === "string" && list.includes(expected);
    case "gte":
    case "lte": {
      const a = comparable(condition.field, actual);
      const b = comparable(condition.field, expected);
      if (a === null || a === undefined || b === null || b === undefined || Array.isArray(a))
        return false;
      // Dates are YYYY-MM-DD text, which compares correctly as text.
      return condition.op === "gte" ? a >= b : a <= b;
    }
  }
}

export const conditionsPass = (task: TaskSnapshot, conditions: Condition[]) =>
  conditions.every((condition) => conditionPasses(task, condition));

// ---------------------------------------------------------------------------
// Actions, run in order as the automation (not as a person)
// ---------------------------------------------------------------------------

export const RECIPIENT_ROLES = ["PROJECT_MANAGER", "ORG_ADMINS", "ASSIGNEES", "REPORTER"] as const;
export type RecipientRole = (typeof RECIPIENT_ROLES)[number];

const recipients = z
  .object({
    roles: z.array(z.enum(RECIPIENT_ROLES)).max(4).default([]),
    userIds: z.array(z.uuid()).max(20).default([]),
  })
  .refine((r) => r.roles.length + r.userIds.length > 0, { message: "Choose who to tell" });

const message = z.string().trim().min(1).max(500);

export const ACTION_TYPES = [
  "NOTIFY",
  "SEND_EMAIL",
  "SET_STATUS",
  "SET_PRIORITY",
  "SET_ASSIGNEES",
  "ADD_LABEL",
  "SET_DUE_DATE",
  "ADD_COMMENT",
  "UPDATE_PROJECT_STATUS",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("NOTIFY"), recipients, message }),
  z.object({
    type: z.literal("SEND_EMAIL"),
    recipients,
    subject: z.string().trim().min(1).max(150),
    message,
  }),
  z
    .object({
      type: z.literal("SET_STATUS"),
      statusId: z.uuid().optional(),
      /** The first column of this category in the task's project. */
      category: z.enum(STATUS_CATEGORIES).optional(),
    })
    .refine((a) => !!a.statusId !== !!a.category, { message: "Choose a column or a category" }),
  z.object({ type: z.literal("SET_PRIORITY"), priority: z.enum(PRIORITIES) }),
  z.object({
    type: z.literal("SET_ASSIGNEES"),
    userIds: z.array(z.uuid()).min(1).max(20),
    mode: z.enum(["replace", "add"]).default("add"),
  }),
  z.object({ type: z.literal("ADD_LABEL"), labelId: z.uuid() }),
  z
    .object({
      type: z.literal("SET_DUE_DATE"),
      /** Days from the day the rule runs (0 = today). */
      relativeDays: z.number().int().min(0).max(365).optional(),
      date: z.iso.date().optional(),
    })
    .refine((a) => (a.relativeDays === undefined) !== (a.date === undefined), {
      message: "Choose a number of days or a date",
    }),
  z.object({ type: z.literal("ADD_COMMENT"), body: z.string().trim().min(1).max(2_000) }),
  z.object({ type: z.literal("UPDATE_PROJECT_STATUS"), status: z.enum(SETTABLE_PROJECT_STATUSES) }),
]);
export type Action = z.infer<typeof actionSchema>;

// ---------------------------------------------------------------------------
// Whole rules
// ---------------------------------------------------------------------------

const ruleFields = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  /** Empty: every project in the workspace (organization admins only). */
  projectId: z.uuid().nullable().default(null),
  trigger: triggerSchema,
  conditions: z.array(conditionSchema).max(MAX_CONDITIONS).default([]),
  actions: z.array(actionSchema).min(1, "Add at least one action").max(MAX_ACTIONS),
  isEnabled: z.boolean().default(true),
});

export const createAutomationSchema = ruleFields;
export type CreateAutomationInput = z.input<typeof createAutomationSchema>;
export const updateAutomationSchema = ruleFields.omit({ projectId: true }).partial();
export const dryRunSchema = z.object({ taskId: z.uuid() });

// ---------------------------------------------------------------------------
// Ready-made rules (PRD §11.15.3)
// ---------------------------------------------------------------------------

export interface Recipe {
  id: string;
  name: string;
  description: string;
  rule: Pick<CreateAutomationInput, "trigger" | "conditions" | "actions">;
}

export const RECIPES: Recipe[] = [
  {
    id: "notify-pm-on-done",
    name: "Tell project managers when a task is done",
    description: "When a task moves to a Done column, notify the project managers.",
    rule: {
      trigger: { type: "TASK_COMPLETED" },
      actions: [
        {
          type: "NOTIFY",
          recipients: { roles: ["PROJECT_MANAGER"], userIds: [] },
          message: "A task was completed",
        },
      ],
    },
  },
  {
    id: "due-soon-reminder",
    name: "Remind assignees a day before the due date",
    description: "24 hours before a task is due, notify its assignees with your message.",
    rule: {
      trigger: { type: "TASK_DUE_SOON", hours: 24 },
      conditions: [{ field: "status.category", op: "neq", value: "DONE" }],
      actions: [
        {
          type: "NOTIFY",
          recipients: { roles: ["ASSIGNEES"], userIds: [] },
          message: "This task is due tomorrow",
        },
      ],
    },
  },
  {
    id: "notify-assignee",
    name: "Email people when they are assigned",
    description: "When someone is assigned a task, email them.",
    rule: {
      trigger: { type: "TASK_ASSIGNED" },
      actions: [
        {
          type: "SEND_EMAIL",
          recipients: { roles: ["ASSIGNEES"], userIds: [] },
          subject: "You have a new task",
          message: "A task was assigned to you. Open it to see the details.",
        },
      ],
    },
  },
  {
    id: "urgent-escalation",
    name: "Escalate urgent tasks to admins",
    description: "When a task's priority becomes Urgent, notify the organization admins.",
    rule: {
      trigger: { type: "TASK_PRIORITY_CHANGED", to: "URGENT" },
      actions: [
        {
          type: "NOTIFY",
          recipients: { roles: ["ORG_ADMINS"], userIds: [] },
          message: "A task was marked urgent",
        },
      ],
    },
  },
  {
    id: "auto-complete-project",
    name: "Complete the project when every task is done",
    description:
      "When the last open task is done, set the project to Completed and tell the managers.",
    rule: {
      trigger: { type: "ALL_PROJECT_TASKS_COMPLETED" },
      actions: [
        { type: "UPDATE_PROJECT_STATUS", status: "COMPLETED" },
        {
          type: "NOTIFY",
          recipients: { roles: ["PROJECT_MANAGER"], userIds: [] },
          message: "Every task is done: the project is now Completed",
        },
      ],
    },
  },
  {
    id: "blocked-notify-pm",
    name: "Tell project managers when a task is blocked",
    description: "When a task enters a Blocked column, notify the project managers.",
    rule: {
      trigger: { type: "TASK_STATUS_CHANGED", toCategory: "BLOCKED" },
      actions: [
        {
          type: "NOTIFY",
          recipients: { roles: ["PROJECT_MANAGER"], userIds: [] },
          message: "A task is blocked",
        },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// The summary sentence (PRD §11.15.4)
// ---------------------------------------------------------------------------

const words = (value: string) => value.toLowerCase().replaceAll("_", " ");
const ROLE_WORDS: Record<RecipientRole, string> = {
  PROJECT_MANAGER: "project managers",
  ORG_ADMINS: "organization admins",
  ASSIGNEES: "assignees",
  REPORTER: "the reporter",
};
const FIELD_WORDS: Record<ConditionField, string> = {
  "status.category": "status category",
  statusId: "column",
  priority: "priority",
  assigneeIds: "assignees",
  labelIds: "labels",
  dueDate: "due date",
  estimatedHours: "estimate",
};
const OP_WORDS: Record<ConditionOp, string> = {
  eq: "is",
  neq: "is not",
  in: "is one of",
  notIn: "is none of",
  contains: "include",
  gte: "is at least",
  lte: "is at most",
  isEmpty: "is empty",
  isNotEmpty: "is set",
};

function describeTrigger(trigger: Trigger): string {
  switch (trigger.type) {
    case "TASK_CREATED":
      return "a task is created";
    case "TASK_STATUS_CHANGED":
      return trigger.toCategory
        ? `a task's status changes to ${words(trigger.toCategory)}`
        : trigger.toStatusId
          ? "a task moves to the chosen column"
          : "a task's status changes";
    case "TASK_ASSIGNED":
      return "someone is assigned a task";
    case "TASK_PRIORITY_CHANGED":
      return trigger.to
        ? `a task's priority becomes ${words(trigger.to)}`
        : "a task's priority changes";
    case "TASK_DUE_SOON":
      return `a task is due within ${trigger.hours ?? 24} hours`;
    case "TASK_COMPLETED":
      return "a task is completed";
    case "ALL_PROJECT_TASKS_COMPLETED":
      return "every task in the project is completed";
    case "COMMENT_ADDED":
      return "someone comments on a task";
  }
}

function describeCondition(condition: Condition): string {
  const value = Array.isArray(condition.value)
    ? condition.value.map(words).join(" or ")
    : condition.value === undefined || condition.value === null
      ? ""
      : words(String(condition.value));
  const ids = condition.field === "statusId" || condition.field.endsWith("Ids");
  const shown =
    ids && condition.op !== "isEmpty" && condition.op !== "isNotEmpty" ? "the chosen ones" : value;
  return `${FIELD_WORDS[condition.field]} ${OP_WORDS[condition.op]}${shown ? ` ${shown}` : ""}`;
}

function describeRecipients(r: { roles?: RecipientRole[]; userIds?: string[] }) {
  const parts = (r.roles ?? []).map((role) => ROLE_WORDS[role]);
  const people = r.userIds?.length ?? 0;
  if (people) parts.push(people === 1 ? "1 person" : `${people} people`);
  return parts.join(" and ") || "nobody";
}

function describeAction(action: Action): string {
  switch (action.type) {
    case "NOTIFY":
      return `notify ${describeRecipients(action.recipients)}`;
    case "SEND_EMAIL":
      return `email ${describeRecipients(action.recipients)}`;
    case "SET_STATUS":
      return action.category
        ? `move it to ${words(action.category)}`
        : "move it to the chosen column";
    case "SET_PRIORITY":
      return `set priority to ${words(action.priority)}`;
    case "SET_ASSIGNEES":
      return action.mode === "replace" ? "replace its assignees" : "add assignees";
    case "ADD_LABEL":
      return "add a label";
    case "SET_DUE_DATE":
      return action.date
        ? `set the due date to ${action.date}`
        : `set the due date ${action.relativeDays === 0 ? "to today" : `${action.relativeDays} days ahead`}`;
    case "ADD_COMMENT":
      return "add a comment";
    case "UPDATE_PROJECT_STATUS":
      return `set the project to ${words(action.status)}`;
  }
}

/** "When a task's status changes to done, if priority is urgent, then notify project managers." */
export function describeAutomation(rule: {
  trigger: Trigger;
  conditions?: Condition[];
  actions: Action[];
}) {
  const conditions = rule.conditions ?? [];
  const when = `When ${describeTrigger(rule.trigger)}`;
  const ifPart = conditions.length ? `, if ${conditions.map(describeCondition).join(" and ")}` : "";
  const then = rule.actions.map(describeAction).join(", then ");
  return `${when}${ifPart}, then ${then}.`;
}

// ---------------------------------------------------------------------------
// What the API answers
// ---------------------------------------------------------------------------

export interface AutomationSummary {
  id: string;
  name: string;
  description: string | null;
  workspaceId: string;
  projectId: string | null;
  isEnabled: boolean;
  trigger: Trigger;
  conditions: Condition[];
  actions: Action[];
  summary: string;
  runCount: number;
  lastRunAt: string | null;
  consecutiveFailures: number;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  canManage: boolean;
}

export const EXECUTION_STATUSES = ["SUCCESS", "FAILED", "SKIPPED"] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export interface AutomationExecutionSummary {
  id: string;
  status: ExecutionStatus;
  /** What set it off: the event name and the task's key. */
  trigger: { event: string; taskKey: string | null };
  /** One line per action, or why it was skipped. */
  result: string[];
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** A dry run: would the rule fire for this task, and what would it do? */
export interface DryRunResult {
  matches: boolean;
  /** Each condition and whether it passes. */
  conditions: { text: string; passes: boolean }[];
  /** What each action would do, in plain words. */
  actions: string[];
}
