import { MAX_STATUSES_PER_PROJECT, type StatusCategory } from "@nexusflow/shared";
import type { Prisma, User } from "../../generated/prisma/client.ts";
import { logActivity } from "../../lib/activity.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { assertNotArchived, assertProjectRight, toDateOnly, type loadProject } from "./access.ts";

// A project's board columns (task statuses) and milestones (PRD §11.5.4,
// §11.6.2). Changing them needs project-manager or workspace-admin rights.

type Loaded = Awaited<ReturnType<typeof loadProject>>;

function assertCanChangeStructure({ project, access }: Loaded) {
  assertProjectRight(access, "canAdminister");
  assertNotArchived(project);
}

const nameTaken = () =>
  new AppError(409, "STATUS_NAME_TAKEN", "Another column already has this name", [
    { path: "body.name", message: "Another column already has this name" },
  ]);

const isUniqueViolation = (error: unknown) => (error as { code?: string }).code === "P2002";

async function log(
  tenant: Tenant,
  actor: User,
  loaded: Loaded,
  action: string,
  metadata: Prisma.InputJsonValue,
) {
  await logActivity({
    organizationId: tenant.organization.id,
    workspaceId: loaded.project.workspaceId,
    actorId: actor.id,
    action,
    entityType: "project",
    entityId: loaded.project.id,
    metadata,
  });
}

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

export async function listStatuses(projectId: string) {
  const [statuses, counts] = await Promise.all([
    prisma.taskStatus.findMany({ where: { projectId }, orderBy: { position: "asc" } }),
    prisma.task.groupBy({
      by: ["statusId"],
      where: { projectId, deletedAt: null },
      _count: { _all: true },
    }),
  ]);
  const taskCounts = new Map(counts.map((row) => [row.statusId, row._count._all]));
  return statuses.map((status) => ({
    id: status.id,
    name: status.name,
    color: status.color,
    category: status.category,
    position: status.position,
    isDefault: status.isDefault,
    taskCount: taskCounts.get(status.id) ?? 0,
  }));
}

async function findStatus(projectId: string, statusId: string) {
  const status = await prisma.taskStatus.findFirst({ where: { id: statusId, projectId } });
  if (!status) throw new AppError(404, "NOT_FOUND", "Column not found");
  return status;
}

export async function createStatus(
  tenant: Tenant,
  actor: User,
  loaded: Loaded,
  input: { name: string; color: string; category: StatusCategory },
) {
  assertCanChangeStructure(loaded);
  const projectId = loaded.project.id;
  const existing = await prisma.taskStatus.aggregate({
    where: { projectId },
    _count: { _all: true },
    _max: { position: true },
  });
  if (existing._count._all >= MAX_STATUSES_PER_PROJECT) {
    throw new AppError(
      409,
      "TOO_MANY_STATUSES",
      `A project can have at most ${MAX_STATUSES_PER_PROJECT} columns`,
    );
  }
  try {
    const status = await prisma.taskStatus.create({
      data: {
        organizationId: tenant.organization.id,
        projectId,
        ...input,
        position: (existing._max.position ?? -1) + 1,
      },
    });
    await log(tenant, actor, loaded, "project.status_added", { name: status.name });
    return status;
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
}

export async function updateStatus(
  tenant: Tenant,
  actor: User,
  loaded: Loaded,
  statusId: string,
  input: { name?: string; color?: string; category?: StatusCategory; isDefault?: true },
) {
  assertCanChangeStructure(loaded);
  const projectId = loaded.project.id;
  const status = await findStatus(projectId, statusId);
  try {
    await prisma.$transaction(async (tx) => {
      // Only one column is the default; clear the old one first.
      if (input.isDefault && !status.isDefault) {
        await tx.taskStatus.updateMany({
          where: { projectId, isDefault: true },
          data: { isDefault: false },
        });
      }
      await tx.taskStatus.update({
        where: { id: status.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.isDefault ? { isDefault: true } : {}),
        },
      });
      // Tasks moved into or out of a "done" column by a category change.
      if (input.category && input.category !== status.category) {
        const nowDone = input.category === "DONE";
        if (nowDone || status.category === "DONE") {
          await tx.task.updateMany({
            where: { statusId: status.id, deletedAt: null },
            data: { completedAt: nowDone ? new Date() : null },
          });
        }
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
  await log(tenant, actor, loaded, "project.status_changed", { statusId, ...input });
}

export async function reorderStatuses(
  tenant: Tenant,
  actor: User,
  loaded: Loaded,
  statusIds: string[],
) {
  assertCanChangeStructure(loaded);
  const projectId = loaded.project.id;
  const current = await prisma.taskStatus.findMany({ where: { projectId }, select: { id: true } });
  const same =
    current.length === statusIds.length &&
    new Set(statusIds).size === statusIds.length &&
    current.every((status) => statusIds.includes(status.id));
  if (!same) {
    throw new AppError(400, "VALIDATION_ERROR", "List every column of this project exactly once");
  }
  await prisma.$transaction(
    statusIds.map((id, position) =>
      prisma.taskStatus.update({ where: { id }, data: { position } }),
    ),
  );
  await log(tenant, actor, loaded, "project.statuses_reordered", { statusIds });
}

/** Deletes a column after moving its tasks to another one (PRD §11.6.2). */
export async function deleteStatus(
  tenant: Tenant,
  actor: User,
  loaded: Loaded,
  statusId: string,
  targetStatusId: string,
) {
  assertCanChangeStructure(loaded);
  const projectId = loaded.project.id;
  if (statusId === targetStatusId) {
    throw new AppError(400, "VALIDATION_ERROR", "Choose a different column for its tasks");
  }
  const [status, target] = await Promise.all([
    findStatus(projectId, statusId),
    findStatus(projectId, targetStatusId),
  ]);
  const moved = await prisma.$transaction(async (tx) => {
    const { count } = await tx.task.updateMany({
      where: { statusId: status.id },
      data: {
        statusId: target.id,
        // Moving between done and not-done columns changes the completion date.
        ...(target.category === "DONE" && status.category !== "DONE"
          ? { completedAt: new Date() }
          : {}),
        ...(target.category !== "DONE" && status.category === "DONE" ? { completedAt: null } : {}),
      },
    });
    await tx.taskStatus.delete({ where: { id: status.id } });
    if (status.isDefault) {
      await tx.taskStatus.update({ where: { id: target.id }, data: { isDefault: true } });
    }
    return count;
  });
  await log(tenant, actor, loaded, "project.status_deleted", {
    name: status.name,
    movedTasksTo: target.name,
    movedTasks: moved,
  });
  return { movedTasks: moved };
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export async function listMilestones(projectId: string) {
  const [milestones, totals, done] = await Promise.all([
    prisma.milestone.findMany({ where: { projectId }, orderBy: [{ position: "asc" }] }),
    prisma.task.groupBy({
      by: ["milestoneId"],
      where: { projectId, deletedAt: null, milestoneId: { not: null } },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["milestoneId"],
      where: {
        projectId,
        deletedAt: null,
        milestoneId: { not: null },
        status: { category: "DONE" },
      },
      _count: { _all: true },
    }),
  ]);
  const totalBy = new Map(totals.map((row) => [row.milestoneId, row._count._all]));
  const doneBy = new Map(done.map((row) => [row.milestoneId, row._count._all]));
  const today = new Date().toISOString().slice(0, 10);
  return milestones.map((milestone) => {
    const dueDate = toDateOnly(milestone.dueDate);
    return {
      id: milestone.id,
      name: milestone.name,
      description: milestone.description,
      dueDate,
      status: milestone.status,
      position: milestone.position,
      taskCount: totalBy.get(milestone.id) ?? 0,
      doneTaskCount: doneBy.get(milestone.id) ?? 0,
      overdue: milestone.status === "OPEN" && !!dueDate && dueDate < today,
    };
  });
}

async function findMilestone(projectId: string, milestoneId: string) {
  const milestone = await prisma.milestone.findFirst({ where: { id: milestoneId, projectId } });
  if (!milestone) throw new AppError(404, "NOT_FOUND", "Milestone not found");
  return milestone;
}

const dateValue = (value: string | null | undefined) =>
  value === undefined ? undefined : value ? new Date(value) : null;

export async function createMilestone(
  tenant: Tenant,
  actor: User,
  loaded: Loaded,
  input: { name: string; description?: string; dueDate?: string | null },
) {
  assertCanChangeStructure(loaded);
  const projectId = loaded.project.id;
  const last = await prisma.milestone.aggregate({ where: { projectId }, _max: { position: true } });
  const milestone = await prisma.milestone.create({
    data: {
      organizationId: tenant.organization.id,
      projectId,
      name: input.name,
      description: input.description || null,
      dueDate: dateValue(input.dueDate) ?? null,
      position: (last._max.position ?? -1) + 1,
    },
  });
  await log(tenant, actor, loaded, "project.milestone_added", { name: milestone.name });
  return milestone;
}

export async function updateMilestone(
  tenant: Tenant,
  actor: User,
  loaded: Loaded,
  milestoneId: string,
  input: {
    name?: string;
    description?: string;
    dueDate?: string | null;
    status?: "OPEN" | "COMPLETED";
  },
) {
  assertCanChangeStructure(loaded);
  const milestone = await findMilestone(loaded.project.id, milestoneId);
  await prisma.milestone.update({
    where: { id: milestone.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.dueDate !== undefined ? { dueDate: dateValue(input.dueDate) } : {}),
      ...(input.status !== undefined
        ? {
            status: input.status,
            completedAt:
              input.status === "COMPLETED" ? (milestone.completedAt ?? new Date()) : null,
          }
        : {}),
    },
  });
  await log(tenant, actor, loaded, "project.milestone_changed", { name: milestone.name, ...input });
}

/** Tasks linked to it stay; they just lose the milestone (onDelete: SetNull). */
export async function deleteMilestone(
  tenant: Tenant,
  actor: User,
  loaded: Loaded,
  milestoneId: string,
) {
  assertCanChangeStructure(loaded);
  const milestone = await findMilestone(loaded.project.id, milestoneId);
  await prisma.milestone.delete({ where: { id: milestone.id } });
  await log(tenant, actor, loaded, "project.milestone_deleted", { name: milestone.name });
}
