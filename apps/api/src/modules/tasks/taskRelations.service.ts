import {
  canDeleteTask,
  freshPositions,
  MAX_LABELS_PER_TASK,
  taskKey,
  wouldCreateCycle,
  type bulkTaskSchema,
  type dependencySchema,
  type FieldChange,
} from "@nexusflow/shared";
import type { Request } from "express";
import type { z } from "zod";
import { Prisma, type User } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { emitEvent } from "../../lib/events.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import type { Loaded, TaskRow } from "./taskAccess.ts";
import { positionAtEnd } from "./taskPositions.ts";
import {
  assertCanWrite,
  checkReferences,
  dateValue,
  notifyAboutTask,
  recordTask,
  reloadRow,
  softDelete,
  statusInProject,
  TX,
} from "./taskRules.ts";
import { taskDetail } from "./tasks.service.ts";

// Links between tasks (PRD §11.6.5) and bulk changes (PRD §11.6.9).

type DependencyInput = z.output<typeof dependencySchema>;
type BulkInput = z.output<typeof bulkTaskSchema>;

// ---------------------------------------------------------------------------
// Dependencies: "A blocks B"
// ---------------------------------------------------------------------------

export async function addDependency(
  tenant: Tenant,
  user: User,
  task: TaskRow,
  loaded: Loaded,
  input: DependencyInput,
  req: Request,
) {
  assertCanWrite(loaded);
  const other = await prisma.task.findFirst({
    where: { id: input.otherTaskId, projectId: task.projectId, deletedAt: null },
    select: { id: true, number: true },
  });
  if (!other) {
    throw new AppError(400, "VALIDATION_ERROR", "Choose a task from the same project", [
      { path: "body.otherTaskId", message: "Links work inside one project" },
    ]);
  }
  const [blocking, blocked] = input.direction === "BLOCKED_BY" ? [other, task] : [task, other];
  const edges = await prisma.taskDependency.findMany({
    where: { blockingTask: { projectId: task.projectId } },
    select: { blockingTaskId: true, blockedTaskId: true },
  });
  if (edges.some((e) => e.blockingTaskId === blocking.id && e.blockedTaskId === blocked.id)) {
    throw new AppError(409, "DEPENDENCY_EXISTS", "These tasks are already linked");
  }
  if (wouldCreateCycle(edges, blocking.id, blocked.id)) {
    throw new AppError(
      409,
      "DEPENDENCY_CYCLE",
      "This link would make a loop: the tasks would wait for each other forever",
    );
  }
  await prisma.taskDependency.create({
    data: {
      organizationId: tenant.organization.id,
      blockingTaskId: blocking.id,
      blockedTaskId: blocked.id,
      createdById: user.id,
    },
  });
  const key = (n: number) => taskKey(loaded.project.key, n);
  await recordTask(tenant, user, loaded, task, "task.dependency_added", {
    metadata: { blocking: key(blocking.number), blocked: key(blocked.number) },
    req,
  });
  return taskDetail(user, await reloadRow(task.id), loaded);
}

export async function removeDependency(
  tenant: Tenant,
  user: User,
  task: TaskRow,
  loaded: Loaded,
  dependencyId: string,
  req: Request,
) {
  assertCanWrite(loaded);
  const dependency = await prisma.taskDependency.findFirst({
    where: { id: dependencyId, OR: [{ blockingTaskId: task.id }, { blockedTaskId: task.id }] },
    include: {
      blockingTask: { select: { number: true } },
      blockedTask: { select: { number: true } },
    },
  });
  if (!dependency) throw new AppError(404, "NOT_FOUND", "Link not found");
  await prisma.taskDependency.delete({ where: { id: dependency.id } });
  const key = (n: number) => taskKey(loaded.project.key, n);
  await recordTask(tenant, user, loaded, task, "task.dependency_removed", {
    metadata: {
      blocking: key(dependency.blockingTask.number),
      blocked: key(dependency.blockedTask.number),
    },
    req,
  });
  return taskDetail(user, await reloadRow(task.id), loaded);
}

// ---------------------------------------------------------------------------
// Bulk changes: up to 100 tasks, all or nothing
// ---------------------------------------------------------------------------

export async function bulkChangeTasks(
  tenant: Tenant,
  user: User,
  loaded: Loaded,
  input: BulkInput,
  req: Request,
) {
  assertCanWrite(loaded);
  const { project } = loaded;
  const taskIds = [...new Set(input.taskIds)];
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds }, projectId: project.id, deletedAt: null },
    select: {
      id: true,
      number: true,
      statusId: true,
      createdById: true,
      startDate: true,
      completedAt: true,
      status: { select: { name: true, category: true } },
    },
    orderBy: { number: "asc" },
  });
  if (tasks.length !== taskIds.length) {
    throw new AppError(404, "NOT_FOUND", "Some of these tasks are not in this project");
  }
  const keys = (list: { number: number }[]) =>
    list.map((task) => taskKey(project.key, task.number)).join(", ");

  if (input.action === "delete") {
    const refused = tasks.filter(
      (task) => !canDeleteTask(loaded.access, task.createdById, user.id),
    );
    if (refused.length > 0) {
      throw new AppError(
        403,
        "FORBIDDEN",
        `You can delete only tasks you created (${keys(refused)})`,
      );
    }
    await softDelete(taskIds);
    await logBulk(tenant, user, loaded, tasks, "task.deleted", [], req);
    return { updated: tasks.length };
  }

  const set = input.set ?? {};
  const addAssignees = [...new Set(set.addAssigneeIds ?? [])];
  const addLabels = [...new Set(set.addLabelIds ?? [])];
  const [status, refs] = await Promise.all([
    set.statusId ? statusInProject(project.id, set.statusId) : null,
    checkReferences(tenant, loaded, {
      assigneeIds: addAssignees,
      labelIds: addLabels,
      milestoneId: set.milestoneId ?? null,
    }),
  ]);
  if (set.dueDate) {
    const due = set.dueDate;
    const tooEarly = tasks.filter((task) => task.startDate && task.startDate > new Date(due));
    if (tooEarly.length > 0) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `The due date would be before the start date of ${keys(tooEarly)}`,
      );
    }
  }
  const moving = status ? tasks.filter((task) => task.statusId !== status.id) : [];
  // Moved cards go to the bottom of the new column, in task-number order.
  const positions =
    status && moving.length > 0
      ? freshPositions(
          moving.length,
          await positionAtEnd(prisma, { projectId: project.id, statusId: status.id }),
        )
      : [];

  const changes: FieldChange[] = [
    ...(set.priority ? [{ field: "priority", from: null, to: set.priority }] : []),
    ...(set.dueDate !== undefined ? [{ field: "dueDate", from: null, to: set.dueDate }] : []),
    ...(set.milestoneId !== undefined
      ? [{ field: "milestone", from: null, to: refs.milestone?.name ?? null }]
      : []),
    ...(status ? [{ field: "status", from: null, to: status.name }] : []),
    ...(addAssignees.length
      ? [
          {
            field: "assignees",
            from: null,
            to: addAssignees.map((id) => refs.people.get(id)?.name),
          },
        ]
      : []),
    ...(set.removeAssigneeIds?.length
      ? [{ field: "assignees", from: set.removeAssigneeIds, to: null }]
      : []),
    ...(addLabels.length
      ? [{ field: "labels", from: null, to: refs.labels.map((l) => l.name) }]
      : []),
    ...(set.removeLabelIds?.length
      ? [{ field: "labels", from: set.removeLabelIds, to: null }]
      : []),
  ];

  // Who is already on which task, to tell only people actually added or taken off.
  const removeAssignees = [...new Set(set.removeAssigneeIds ?? [])];
  const assignedBefore = new Set(
    addAssignees.length || removeAssignees.length
      ? (
          await prisma.taskAssignee.findMany({
            where: {
              taskId: { in: taskIds },
              userId: { in: [...addAssignees, ...removeAssignees] },
            },
            select: { taskId: true, userId: true },
          })
        ).map((row) => `${row.taskId}|${row.userId}`)
      : [],
  );

  await prisma.$transaction(async (tx) => {
    await tx.task.updateMany({
      where: { id: { in: taskIds } },
      data: {
        version: { increment: 1 },
        ...(set.priority ? { priority: set.priority } : {}),
        ...(set.dueDate !== undefined ? { dueDate: dateValue(set.dueDate) } : {}),
        ...(set.milestoneId !== undefined ? { milestoneId: set.milestoneId } : {}),
      },
    });
    if (status && moving.length > 0) {
      const values = moving.map(
        (task, index) => Prisma.sql`(${task.id}::uuid, ${positions[index] as string})`,
      );
      await tx.$executeRaw`
        UPDATE "Task" AS t SET "statusId" = ${status.id}::uuid, "position" = v.position
        FROM (VALUES ${Prisma.join(values)}) AS v(id, position)
        WHERE t."id" = v.id`;
      const movingIds = moving.map((task) => task.id);
      if (status.category === "DONE") {
        await tx.task.updateMany({
          where: { id: { in: movingIds }, completedAt: null },
          data: { completedAt: new Date() },
        });
      } else {
        await tx.task.updateMany({ where: { id: { in: movingIds } }, data: { completedAt: null } });
      }
    }
    if (addAssignees.length > 0) {
      await tx.taskAssignee.createMany({
        data: taskIds.flatMap((taskId) =>
          addAssignees.map((userId) => ({
            organizationId: tenant.organization.id,
            taskId,
            userId,
            assignedById: user.id,
          })),
        ),
        skipDuplicates: true,
      });
    }
    if (set.removeAssigneeIds?.length) {
      await tx.taskAssignee.deleteMany({
        where: { taskId: { in: taskIds }, userId: { in: set.removeAssigneeIds } },
      });
    }
    if (addLabels.length > 0) {
      await tx.taskLabel.createMany({
        data: taskIds.flatMap((taskId) => addLabels.map((labelId) => ({ taskId, labelId }))),
        skipDuplicates: true,
      });
      const crowded = await tx.taskLabel.groupBy({
        by: ["taskId"],
        where: { taskId: { in: taskIds } },
        _count: { _all: true },
        having: { taskId: { _count: { gt: MAX_LABELS_PER_TASK } } },
      });
      if (crowded.length > 0) {
        throw new AppError(400, "VALIDATION_ERROR", "A task can have at most 20 labels");
      }
    }
    if (set.removeLabelIds?.length) {
      await tx.taskLabel.deleteMany({
        where: { taskId: { in: taskIds }, labelId: { in: set.removeLabelIds } },
      });
    }
    // One history entry per task, written in the same transaction (PRD §11.6.9).
    await tx.activityLog.createMany({
      data: tasks.map((task) =>
        activityRow(tenant, user, loaded, task, "task.updated", changes, req),
      ),
    });
  }, TX);

  emitEvent({
    name: "task:bulk-updated",
    orgId: tenant.organization.id,
    workspaceId: project.workspaceId,
    projectId: project.id,
    actorId: user.id,
    data: { taskIds, fields: changes.map((change) => change.field) },
  });
  for (const taskId of taskIds) {
    const was = (userId: string) => assignedBefore.has(`${taskId}|${userId}`);
    notifyAboutTask(
      tenant,
      user,
      loaded,
      taskId,
      "TASK_ASSIGNED",
      addAssignees.filter((id) => !was(id)),
    );
    notifyAboutTask(tenant, user, loaded, taskId, "TASK_UNASSIGNED", removeAssignees.filter(was));
  }
  return { updated: tasks.length };
}

function activityRow(
  tenant: Tenant,
  user: User,
  loaded: Loaded,
  task: { id: string; number: number },
  action: string,
  changes: FieldChange[],
  req: Request,
): Prisma.ActivityLogCreateManyInput {
  return {
    organizationId: tenant.organization.id,
    workspaceId: loaded.project.workspaceId,
    actorId: user.id,
    category: "DOMAIN",
    action,
    entityType: "task",
    entityId: task.id,
    ip: req.ip ?? null,
    metadata: { key: taskKey(loaded.project.key, task.number), bulk: true },
    ...(changes.length ? { changes: changes as unknown as Prisma.InputJsonValue } : {}),
  };
}

async function logBulk(
  tenant: Tenant,
  user: User,
  loaded: Loaded,
  tasks: { id: string; number: number }[],
  action: string,
  changes: FieldChange[],
  req: Request,
) {
  await prisma.activityLog.createMany({
    data: tasks.map((task) => activityRow(tenant, user, loaded, task, action, changes, req)),
  });
  emitEvent({
    name: "task:bulk-updated",
    orgId: tenant.organization.id,
    workspaceId: loaded.project.workspaceId,
    projectId: loaded.project.id,
    actorId: user.id,
    data: { taskIds: tasks.map((task) => task.id), action },
  });
}
