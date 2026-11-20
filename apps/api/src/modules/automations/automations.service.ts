import {
  conditionPasses,
  describeAutomation,
  type AutomationExecutionSummary,
  type AutomationSummary,
  type createAutomationSchema,
  type DryRunResult,
  type ExecutionStatus,
  type updateAutomationSchema,
} from "@nexusflow/shared";
import type { Request } from "express";
import type { z } from "zod";
import type { Automation, Prisma, User } from "../../generated/prisma/client.ts";
import { logActivity } from "../../lib/activity.ts";
import { assertWithinPlan } from "../../lib/planGuard.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { loadWorkspace } from "../organizations/workspaces.service.ts";
import { accessibleProjectsWhere, assertProjectRight, loadProject } from "../projects/access.ts";
import { automationTaskSelect, runAction } from "./automations.actions.ts";
import { parseRule, snapshotOf } from "./automations.engine.ts";

// Creating, changing and checking automation rules (PRD §11.15, §18.7).
// Project rules belong to the project's managers; rules for a whole workspace
// belong to its admins. FREE organizations cannot use automations (AC-AUTO-04).

type CreateInput = z.output<typeof createAutomationSchema>;
type UpdateInput = z.output<typeof updateAutomationSchema>;

interface WorkspaceScope {
  tenant: Tenant;
  user: User;
  workspace: { id: string; slug: string };
  /** Workspace admin (org owners and admins count). */
  canManage: boolean;
}

const notFound = () => new AppError(404, "NOT_FOUND", "Automation not found");

function assertPlanAllows(tenant: Tenant) {
  if (tenant.subscription.planTier === "FREE") {
    throw new AppError(
      402,
      "PLAN_FEATURE_REQUIRED",
      "Automations are part of the Pro plan. Upgrade to create rules.",
      { feature: "automations", planTier: "FREE" },
    );
  }
}

/** May this person create or change rules for this project (or the whole workspace)? */
async function assertCanManageScope(scope: WorkspaceScope, projectId: string | null) {
  if (projectId === null) {
    if (!scope.canManage) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only workspace admins manage rules for the whole workspace",
      );
    }
    return;
  }
  const { project, access } = await loadProject(scope.tenant, projectId, scope.user.id);
  if (project.workspaceId !== scope.workspace.id) throw notFound();
  assertProjectRight(access, "canManage");
}

async function canManageRule(scope: WorkspaceScope, automation: Automation) {
  try {
    await assertCanManageScope(scope, automation.projectId);
    return true;
  } catch {
    return false;
  }
}

function toSummary(
  automation: Automation,
  canManage: boolean,
  creators: Map<string, { id: string; name: string }>,
): AutomationSummary {
  const rule = parseRule(automation);
  return {
    id: automation.id,
    name: automation.name,
    description: automation.description,
    workspaceId: automation.workspaceId,
    projectId: automation.projectId,
    isEnabled: automation.isEnabled,
    trigger: rule?.trigger ?? { type: "TASK_CREATED" },
    conditions: rule?.conditions ?? [],
    actions: rule?.actions ?? [],
    summary: rule ? describeAutomation(rule) : "This rule could not be read.",
    runCount: automation.runCount,
    lastRunAt: automation.lastRunAt?.toISOString() ?? null,
    consecutiveFailures: automation.consecutiveFailures,
    createdBy: creators.get(automation.createdById) ?? null,
    createdAt: automation.createdAt.toISOString(),
    canManage,
  };
}

/** The names of the people who made these rules (deleted accounts are left out). */
async function creatorsOf(rows: Automation[]) {
  const people = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.createdById))] }, deletedAt: null },
    select: { id: true, name: true },
  });
  return new Map(people.map((person) => [person.id, person]));
}

const summaryOf = async (automation: Automation, canManage: boolean) =>
  toSummary(automation, canManage, await creatorsOf([automation]));

async function audit(scope: WorkspaceScope, automation: Automation, action: string, req: Request) {
  await logActivity({
    organizationId: scope.tenant.organization.id,
    workspaceId: automation.workspaceId,
    actorId: scope.user.id,
    action,
    entityType: "automation",
    entityId: automation.id,
    metadata: { name: automation.name, projectId: automation.projectId },
    req,
  });
}

// ---------------------------------------------------------------------------
// Listing and reading
// ---------------------------------------------------------------------------

/** The workspace's rules: workspace-wide ones, and those of projects you can open. */
export async function listAutomations(scope: WorkspaceScope, projectId?: string) {
  const organizationId = scope.tenant.organization.id;
  const projects = await prisma.project.findMany({
    where: {
      AND: [
        accessibleProjectsWhere(
          scope.tenant.organization.id,
          scope.user.id,
          scope.tenant.membership.role,
        ),
        { workspaceId: scope.workspace.id },
        projectId ? { id: projectId } : {},
      ],
    },
    select: { id: true },
  });
  const rows = await prisma.automation.findMany({
    where: {
      organizationId,
      workspaceId: scope.workspace.id,
      deletedAt: null,
      OR: [
        { projectId: { in: projects.map((p) => p.id) } },
        ...(projectId ? [] : [{ projectId: null }]),
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  const creators = await creatorsOf(rows);
  return Promise.all(
    rows.map(async (row) => toSummary(row, await canManageRule(scope, row), creators)),
  );
}

/** A rule you may see (404 otherwise), for the routes under /automations/:id. */
export async function loadAutomation(tenant: Tenant, user: User, id: string) {
  const automation = await prisma.automation.findFirst({
    where: { id, organizationId: tenant.organization.id, deletedAt: null },
    include: { workspace: { select: { id: true, slug: true } } },
  });
  if (!automation) throw notFound();
  if (automation.projectId) {
    await loadProject(tenant, automation.projectId, user.id).catch(() => {
      throw notFound();
    });
  }
  return automation;
}

/** The rule's workspace, with whether this person administers it. */
export async function scopeFor(
  tenant: Tenant,
  user: User,
  workspace: { id: string; slug: string },
) {
  const loaded = await loadWorkspace(tenant, workspace.slug, user.id).catch(() => {
    throw notFound();
  });
  return { tenant, user, workspace: loaded.workspace, canManage: loaded.canManage };
}

// ---------------------------------------------------------------------------
// Changing
// ---------------------------------------------------------------------------

export async function createAutomation(scope: WorkspaceScope, input: CreateInput, req: Request) {
  assertPlanAllows(scope.tenant);
  await assertCanManageScope(scope, input.projectId);
  const current = await prisma.automation.count({
    where: { workspaceId: scope.workspace.id, deletedAt: null },
  });
  assertWithinPlan(scope.tenant.subscription, "maxAutomationsPerWorkspace", current);
  await checkReferences(scope, input);
  const automation = await prisma.automation.create({
    data: {
      organizationId: scope.tenant.organization.id,
      workspaceId: scope.workspace.id,
      projectId: input.projectId,
      name: input.name,
      description: input.description ?? null,
      isEnabled: input.isEnabled,
      trigger: input.trigger as Prisma.InputJsonValue,
      conditions: input.conditions as Prisma.InputJsonValue,
      actions: input.actions as Prisma.InputJsonValue,
      createdById: scope.user.id,
    },
  });
  await audit(scope, automation, "automation.created", req);
  return summaryOf(automation, true);
}

export async function updateAutomation(
  scope: WorkspaceScope,
  automation: Automation,
  input: UpdateInput,
  req: Request,
) {
  await assertCanManageScope(scope, automation.projectId);
  if (input.isEnabled) assertPlanAllows(scope.tenant);
  const rule = parseRule(automation);
  await checkReferences(scope, {
    projectId: automation.projectId,
    trigger: input.trigger ?? rule?.trigger,
    conditions: input.conditions ?? rule?.conditions ?? [],
    actions: input.actions ?? rule?.actions ?? [],
  });
  const updated = await prisma.automation.update({
    where: { id: automation.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
      ...(input.trigger ? { trigger: input.trigger as Prisma.InputJsonValue } : {}),
      ...(input.conditions ? { conditions: input.conditions as Prisma.InputJsonValue } : {}),
      ...(input.actions ? { actions: input.actions as Prisma.InputJsonValue } : {}),
      // A changed rule gets a fresh start after failures.
      consecutiveFailures: 0,
    },
  });
  await audit(scope, updated, "automation.updated", req);
  return summaryOf(updated, true);
}

export async function toggleAutomation(
  scope: WorkspaceScope,
  automation: Automation,
  req: Request,
) {
  return updateAutomation(scope, automation, { isEnabled: !automation.isEnabled }, req);
}

export async function deleteAutomation(
  scope: WorkspaceScope,
  automation: Automation,
  req: Request,
) {
  await assertCanManageScope(scope, automation.projectId);
  await prisma.automation.update({
    where: { id: automation.id },
    data: { deletedAt: new Date(), isEnabled: false },
  });
  await audit(scope, automation, "automation.deleted", req);
  return { deleted: true as const };
}

/** Columns, labels and people a rule names must exist in its project or workspace. */
async function checkReferences(
  scope: WorkspaceScope,
  rule: Pick<CreateInput, "projectId" | "actions" | "conditions"> & {
    trigger?: CreateInput["trigger"] | undefined;
  },
) {
  const bad = (message: string) => new AppError(400, "VALIDATION_ERROR", message);
  const statusIds = [
    ...rule.actions.flatMap((a) => (a.type === "SET_STATUS" && a.statusId ? [a.statusId] : [])),
    ...(rule.trigger?.type === "TASK_STATUS_CHANGED" && rule.trigger.toStatusId
      ? [rule.trigger.toStatusId]
      : []),
  ];
  if (statusIds.length) {
    if (!rule.projectId) throw bad("Pick a project to choose a specific column");
    const found = await prisma.taskStatus.count({
      where: { id: { in: statusIds }, projectId: rule.projectId },
    });
    if (found !== new Set(statusIds).size) throw bad("A chosen column is not in this project");
  }
  const labelIds = rule.actions.flatMap((a) => (a.type === "ADD_LABEL" ? [a.labelId] : []));
  if (labelIds.length) {
    const found = await prisma.label.count({
      where: { id: { in: labelIds }, workspaceId: scope.workspace.id },
    });
    if (found !== new Set(labelIds).size) throw bad("A chosen label is not in this workspace");
  }
  const userIds = rule.actions.flatMap((a) =>
    a.type === "NOTIFY" || a.type === "SEND_EMAIL"
      ? a.recipients.userIds
      : a.type === "SET_ASSIGNEES"
        ? a.userIds
        : [],
  );
  if (userIds.length) {
    const found = await prisma.organizationMember.count({
      where: { organizationId: scope.tenant.organization.id, userId: { in: userIds } },
    });
    if (found !== new Set(userIds).size) throw bad("A chosen person is not in this organization");
  }
}

// ---------------------------------------------------------------------------
// Dry run and execution log
// ---------------------------------------------------------------------------

/** Would the rule fire for this task, and what would it do? Changes nothing. */
export async function dryRun(
  scope: WorkspaceScope,
  automation: Automation,
  taskId: string,
): Promise<DryRunResult> {
  const { tenant, user } = scope;
  await assertCanManageScope(scope, automation.projectId);
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      organizationId: tenant.organization.id,
      deletedAt: null,
      project: { workspaceId: automation.workspaceId },
      ...(automation.projectId ? { projectId: automation.projectId } : {}),
    },
    select: automationTaskSelect,
  });
  if (!task) throw new AppError(404, "NOT_FOUND", "No such task for this rule");
  await loadProject(tenant, task.projectId, user.id);
  const rule = parseRule(automation);
  if (!rule) throw new AppError(409, "INVALID_RULE", "This rule could not be read; save it again");
  const snapshot = snapshotOf(task);
  const conditions = rule.conditions.map((condition) => ({
    text: describeAutomation({ trigger: rule.trigger, conditions: [condition], actions: [] })
      .replace(/^.*?, if /, "")
      .replace(/, then \.$/, ""),
    passes: conditionPasses(snapshot, condition),
  }));
  const matches = conditions.every((c) => c.passes);
  const ctx = {
    automation,
    organization: { id: tenant.organization.id, slug: tenant.organization.slug },
    task,
    origin: [automation.id],
  };
  const actions: string[] = [];
  for (const action of rule.actions) {
    actions.push(
      await runAction(ctx, action, true).catch(
        (error: unknown) => `Would fail: ${(error as Error).message}`,
      ),
    );
  }
  return {
    matches,
    conditions,
    actions: actions.map((line) => (line.startsWith("Would") ? line : `Would: ${line}`)),
  };
}

/** The execution log and dry runs are for the rule's managers (PRD §18.7). */
export async function listExecutions(
  scope: WorkspaceScope,
  automation: Automation,
  query: { cursor?: string | undefined; limit: number; status?: ExecutionStatus | undefined },
) {
  await assertCanManageScope(scope, automation.projectId);
  const rows = await prisma.automationExecution.findMany({
    where: { automationId: automation.id, ...(query.status ? { status: query.status } : {}) },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, query.limit);
  const items: AutomationExecutionSummary[] = page.map((row) => {
    const event = (row.triggerEvent ?? {}) as { event?: string; taskKey?: string };
    return {
      id: row.id,
      status: row.status,
      trigger: { event: event.event ?? "unknown", taskKey: event.taskKey ?? null },
      result: Array.isArray(row.result) ? row.result.map(String) : [],
      error: row.error,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
    };
  });
  return { items, nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null };
}
