import {
  actionSchema,
  conditionSchema,
  conditionsPass,
  MAX_CHAIN_DEPTH,
  MAX_CONSECUTIVE_FAILURES,
  PLAN_LIMITS,
  RUNS_PER_HOUR,
  taskKey,
  triggerSchema,
  type Action,
  type Condition,
  type TaskSnapshot,
  type Trigger,
  type TriggerType,
} from "@nexusflow/shared";
import { z } from "zod";
import type { Automation, Prisma } from "../../generated/prisma/client.ts";
import { onEvent, type DomainEvent } from "../../lib/events.ts";
import { enqueue } from "../../lib/jobs.ts";
import { logger } from "../../lib/logger.ts";
import { prisma } from "../../lib/prisma.ts";
import { notify } from "../notifications/notifications.service.ts";
import { toDateOnly } from "../projects/access.ts";
import {
  automationTaskSelect,
  runAction,
  type AutomationTask,
  type RunContext,
} from "./automations.actions.ts";

// The automation engine (PRD §11.15.2). Task and comment events become
// "automation.evaluate" jobs; the job finds the rules whose trigger matches,
// checks their conditions against the task as it is now, and runs their
// actions in order. Every run is written to the execution log.

/** What an "automation.evaluate" job carries. */
export interface EvaluateJob {
  event: string;
  orgId: string;
  projectId: string;
  taskIds: string[];
  /** Fields the change touched (from the task history), e.g. ["status"]. */
  fields: string[];
  /** Rules whose actions led to this event, oldest first. */
  origin: string[];
  /** For TASK_DUE_SOON runs: the due date, so a rule reminds once per date. */
  dueDate?: string;
  /** For TASK_DUE_SOON runs: only this rule. */
  automationId?: string;
}

const WATCHED = new Set(["task:created", "task:updated", "task:bulk-updated", "comment:created"]);

/** Turns task and comment events into evaluation jobs. Returns a stop function. */
export function startAutomationBridge() {
  return onEvent((event) => {
    const job = jobFor(event);
    if (job) {
      enqueue("automation.evaluate", job as unknown as Record<string, unknown>).catch(
        (error: unknown) => logger.error({ err: error }, "Could not queue automation evaluation"),
      );
    }
  });
}

const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export function jobFor(event: DomainEvent): EvaluateJob | null {
  if (!WATCHED.has(event.name) || !event.projectId) return null;
  const data = (event.data ?? {}) as Record<string, unknown>;
  const taskIds = typeof data["taskId"] === "string" ? [data["taskId"]] : strings(data["taskIds"]);
  if (taskIds.length === 0) return null;
  return {
    event: event.name,
    orgId: event.orgId,
    projectId: event.projectId,
    taskIds,
    fields: strings(data["fields"]),
    origin: strings(data["origin"]),
  };
}

/** Which trigger types an event sets off for a task (before trigger params). */
function firedTriggers(job: EvaluateJob, task: AutomationTask): Set<TriggerType> {
  const fired = new Set<TriggerType>();
  if (job.event === "task:created") fired.add("TASK_CREATED");
  if (job.event === "comment:created") fired.add("COMMENT_ADDED");
  if (job.event === "automation:due-soon") fired.add("TASK_DUE_SOON");
  if (job.event === "task:updated" || job.event === "task:bulk-updated") {
    if (job.fields.includes("status")) {
      fired.add("TASK_STATUS_CHANGED");
      if (task.status.category === "DONE") fired.add("TASK_COMPLETED");
    }
    if (job.fields.includes("assignees") && task.assignees.length > 0) fired.add("TASK_ASSIGNED");
    if (job.fields.includes("priority")) fired.add("TASK_PRIORITY_CHANGED");
  }
  return fired;
}

/** Does the rule's trigger, with its options, match this task? */
function triggerMatches(trigger: Trigger, fired: Set<TriggerType>, task: AutomationTask) {
  if (!fired.has(trigger.type)) return false;
  if (trigger.type === "TASK_STATUS_CHANGED") {
    if (trigger.toCategory && task.status.category !== trigger.toCategory) return false;
    if (trigger.toStatusId && task.statusId !== trigger.toStatusId) return false;
  }
  if (trigger.type === "TASK_PRIORITY_CHANGED" && trigger.to && task.priority !== trigger.to) {
    return false;
  }
  return true;
}

export const snapshotOf = (task: AutomationTask): TaskSnapshot => ({
  statusId: task.statusId,
  statusCategory: task.status.category,
  priority: task.priority,
  assigneeIds: task.assignees.map((a) => a.userId),
  labelIds: task.labels.map((l) => l.labelId),
  dueDate: toDateOnly(task.dueDate),
  estimatedHours: task.estimatedHours === null ? null : Number(task.estimatedHours),
});

/** A stored rule, read back with its JSON checked (a broken one is skipped). */
export function parseRule(automation: Automation) {
  const parsed = z
    .object({
      trigger: triggerSchema,
      conditions: z.array(conditionSchema),
      actions: z.array(actionSchema),
    })
    .safeParse({
      trigger: automation.trigger,
      conditions: automation.conditions,
      actions: automation.actions,
    });
  return parsed.success
    ? (parsed.data as { trigger: Trigger; conditions: Condition[]; actions: Action[] })
    : null;
}

/** Enabled rules that apply to a project: its own and its workspace's. */
async function rulesFor(orgId: string, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true, deletedAt: true },
  });
  if (!project || project.deletedAt) return [];
  return prisma.automation.findMany({
    where: {
      organizationId: orgId,
      workspaceId: project.workspaceId,
      isEnabled: true,
      deletedAt: null,
      OR: [{ projectId }, { projectId: null }],
    },
    orderBy: { createdAt: "asc" },
  });
}

/** The job: evaluates every matching rule for every task in the event. */
export async function evaluateAutomations(job: EvaluateJob) {
  const rules = await rulesFor(job.orgId, job.projectId);
  if (rules.length === 0) return 0;
  const organization = await prisma.organization.findUnique({
    where: { id: job.orgId },
    select: { id: true, slug: true, deletedAt: true, subscription: { select: { planTier: true } } },
  });
  if (!organization || organization.deletedAt) return 0;
  // Free has no automations; rules kept from a paid plan wait quietly (PRD §11.14.5).
  if ((organization.subscription?.planTier ?? "FREE") === "FREE") return 0;

  let runs = 0;
  for (const taskId of job.taskIds) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, organizationId: job.orgId, deletedAt: null },
      select: automationTaskSelect,
    });
    if (!task) continue;
    const fired = firedTriggers(job, task);
    // The last open task done: the project-wide trigger fires too.
    if (fired.has("TASK_COMPLETED") && (await allTasksDone(task.project.id))) {
      fired.add("ALL_PROJECT_TASKS_COMPLETED");
    }
    for (const automation of rules) {
      if (job.automationId && automation.id !== job.automationId) continue;
      const rule = parseRule(automation);
      if (!rule || !triggerMatches(rule.trigger, fired, task)) continue;
      if (!conditionsPass(snapshotOf(task), rule.conditions)) continue;
      await runRule(automation, rule.actions, { organization, task, job });
      runs++;
    }
  }
  return runs;
}

async function allTasksDone(projectId: string) {
  const open = await prisma.task.count({
    where: { projectId, deletedAt: null, status: { category: { not: "DONE" } } },
  });
  return open === 0;
}

// ---------------------------------------------------------------------------
// One run
// ---------------------------------------------------------------------------

interface RunInput {
  organization: { id: string; slug: string; subscription: { planTier: string } | null };
  task: AutomationTask;
  job: EvaluateJob;
}

const startOfMonth = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** Why a run must not happen, or null when it may. */
async function skipReason(automation: Automation, { organization, job }: RunInput) {
  if (job.origin.includes(automation.id))
    return "Skipped: this rule already ran in this chain (loop guard)";
  if (job.origin.length >= MAX_CHAIN_DEPTH) {
    return `Skipped: rules set off by rules stop after ${MAX_CHAIN_DEPTH} steps`;
  }
  const tier = (organization.subscription?.planTier ?? "FREE") as keyof typeof PLAN_LIMITS;
  const now = new Date();
  const [lastHour, thisMonth] = await Promise.all([
    prisma.automationExecution.count({
      where: {
        organizationId: organization.id,
        startedAt: { gte: new Date(now.getTime() - 3_600_000) },
      },
    }),
    prisma.automationExecution.count({
      where: {
        organizationId: organization.id,
        status: { not: "SKIPPED" },
        startedAt: { gte: startOfMonth(now) },
      },
    }),
  ]);
  const hourly = tier === "BUSINESS" ? RUNS_PER_HOUR.BUSINESS : RUNS_PER_HOUR.default;
  if (lastHour >= hourly) return `Skipped: more than ${hourly} runs in the last hour`;
  const monthly = PLAN_LIMITS[tier].maxAutomationRunsPerMonth;
  if (monthly !== null && thisMonth >= monthly) {
    return `Skipped: the ${tier} plan allows ${monthly} runs a month`;
  }
  return null;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runRule(automation: Automation, actions: Action[], input: RunInput) {
  const { organization, task, job } = input;
  const triggerEvent = {
    event: job.event,
    taskId: task.id,
    taskKey: taskKey(task.project.key, task.number),
    origin: job.origin,
    ...(job.dueDate ? { dueDate: job.dueDate } : {}),
  } satisfies Prisma.InputJsonValue;
  const reason = await skipReason(automation, input);
  if (reason) {
    await prisma.automationExecution.create({
      data: {
        organizationId: organization.id,
        automationId: automation.id,
        triggerEvent,
        status: "SKIPPED",
        result: [reason],
        finishedAt: new Date(),
      },
    });
    return;
  }

  const execution = await prisma.automationExecution.create({
    data: {
      organizationId: organization.id,
      automationId: automation.id,
      triggerEvent,
      status: "SUCCESS",
    },
  });
  const ctx: RunContext = {
    automation,
    organization,
    task,
    origin: [...job.origin, automation.id],
  };
  const result: string[] = [];
  try {
    for (const action of actions) {
      // An action that fails is tried 3 times in all, waiting a little longer each time.
      for (let attempt = 1; ; attempt++) {
        try {
          result.push(await runAction(ctx, action));
          break;
        } catch (error) {
          if (attempt >= 3) throw error;
          await wait(200 * 2 ** attempt);
        }
      }
    }
    await prisma.$transaction([
      prisma.automationExecution.update({
        where: { id: execution.id },
        data: { result, finishedAt: new Date() },
      }),
      prisma.automation.update({
        where: { id: automation.id },
        data: { runCount: { increment: 1 }, lastRunAt: new Date(), consecutiveFailures: 0 },
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Failed";
    await recordFailure(automation, execution.id, result, message, organization.id);
  }
}

async function recordFailure(
  automation: Automation,
  executionId: string,
  result: string[],
  message: string,
  organizationId: string,
) {
  await prisma.automationExecution.update({
    where: { id: executionId },
    data: { status: "FAILED", result, error: message, finishedAt: new Date() },
  });
  const updated = await prisma.automation.update({
    where: { id: automation.id },
    data: {
      consecutiveFailures: { increment: 1 },
      lastRunAt: new Date(),
      runCount: { increment: 1 },
    },
    select: { consecutiveFailures: true },
  });
  if (updated.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    await prisma.automation.update({ where: { id: automation.id }, data: { isEnabled: false } });
    notify({
      type: "AUTOMATION_ALERT",
      orgId: organizationId,
      workspaceId: automation.workspaceId,
      ...(automation.projectId ? { projectId: automation.projectId } : {}),
      actorId: null,
      recipientIds: [automation.createdById],
      data: {
        title: `Automation "${automation.name}" was switched off`,
        body: `It failed ${MAX_CONSECUTIVE_FAILURES} times in a row. Last error: ${message}`,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// TASK_DUE_SOON: checked every hour, once per rule, task and due date
// ---------------------------------------------------------------------------

export async function runDueSoonAutomations(now = new Date()) {
  const rules = await prisma.automation.findMany({
    where: {
      isEnabled: true,
      deletedAt: null,
      trigger: { path: ["type"], equals: "TASK_DUE_SOON" },
    },
  });
  let runs = 0;
  for (const automation of rules) {
    const rule = parseRule(automation);
    if (!rule || rule.trigger.type !== "TASK_DUE_SOON") continue;
    const until = new Date(now.getTime() + rule.trigger.hours * 3_600_000);
    const tasks = await prisma.task.findMany({
      where: {
        organizationId: automation.organizationId,
        deletedAt: null,
        project: { workspaceId: automation.workspaceId, deletedAt: null },
        ...(automation.projectId ? { projectId: automation.projectId } : {}),
        dueDate: { gte: new Date(`${toDateOnly(now) ?? ""}T00:00:00.000Z`), lte: until },
        status: { category: { not: "DONE" } },
      },
      select: { id: true, projectId: true, dueDate: true },
      take: 500,
    });
    for (const task of tasks) {
      const dueDate = toDateOnly(task.dueDate) ?? "";
      const already = await prisma.automationExecution.findFirst({
        where: {
          automationId: automation.id,
          AND: [
            { triggerEvent: { path: ["taskId"], equals: task.id } },
            { triggerEvent: { path: ["dueDate"], equals: dueDate } },
          ],
        },
        select: { id: true },
      });
      if (already) continue;
      runs += await evaluateAutomations({
        event: "automation:due-soon",
        orgId: automation.organizationId,
        projectId: task.projectId,
        taskIds: [task.id],
        fields: [],
        origin: [],
        dueDate,
        automationId: automation.id,
      });
    }
  }
  return runs;
}
