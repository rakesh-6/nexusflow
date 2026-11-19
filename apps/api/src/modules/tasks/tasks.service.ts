import {
  canDeleteTask,
  parseTaskKey,
  positionBetween,
  TASK_TRASH_DAYS,
  taskKey,
  type createTaskSchema,
  type FieldChange,
  type MoveTaskInput,
  type RichTextDoc,
  type TaskDetail,
  type updateTaskSchema,
} from "@nexusflow/shared";
import type { Request } from "express";
import type { z } from "zod";
import { Prisma, type User } from "../../generated/prisma/client.ts";
import { emitEvent } from "../../lib/events.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { assertNotArchived, toDateOnly } from "../projects/access.ts";
import {
  loadTask,
  statusRef,
  taskInclude,
  taskNotFound,
  toTaskSummaries,
  type Loaded,
  type TaskRow,
} from "./taskAccess.ts";
import { positionAtEnd, positionForMove } from "./taskPositions.ts";
import {
  assertCanWrite,
  checkParent,
  checkReferences,
  completion,
  dateValue,
  defaultStatus,
  descriptionData,
  notifyAboutTask,
  recordTask,
  reloadRow,
  reserveNumbers,
  softDelete,
  StaleVersion,
  statusInProject,
  summaryOf,
  throwConflict,
  TX,
} from "./taskRules.ts";

// Tasks (PRD §11.6): create, read, change, move, delete, restore, duplicate.

type CreateTask = z.output<typeof createTaskSchema>;
type UpdateTask = z.output<typeof updateTaskSchema>;

const DAY_MS = 86_400_000;
const trashCutoff = () => new Date(Date.now() - TASK_TRASH_DAYS * DAY_MS);
const unique = (ids: string[] | undefined) => (ids ? [...new Set(ids)] : undefined);

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const linkSelect = { id: true, number: true, title: true, status: statusRef } as const;

export async function taskDetail(user: User, task: TaskRow, loaded: Loaded): Promise<TaskDetail> {
  const { project, access } = loaded;
  const [subtaskRows, blockedBy, blocks, parent] = await Promise.all([
    prisma.task.findMany({
      where: { parentTaskId: task.id, deletedAt: null },
      include: taskInclude,
      orderBy: { number: "asc" },
    }),
    prisma.taskDependency.findMany({
      where: { blockedTaskId: task.id, blockingTask: { deletedAt: null } },
      select: { id: true, blockingTask: { select: linkSelect } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.taskDependency.findMany({
      where: { blockingTaskId: task.id, blockedTask: { deletedAt: null } },
      select: { id: true, blockedTask: { select: linkSelect } },
      orderBy: { createdAt: "asc" },
    }),
    task.parentTaskId
      ? prisma.task.findUnique({
          where: { id: task.parentTaskId },
          select: { id: true, number: true, title: true },
        })
      : Promise.resolve(null),
  ]);
  const [summary, ...subtasks] = await toTaskSummaries([task, ...subtaskRows]);
  const link = (dependencyId: string, other: (typeof blocks)[number]["blockedTask"]) => ({
    dependencyId,
    id: other.id,
    key: taskKey(project.key, other.number),
    title: other.title,
    status: other.status,
  });
  const writable = project.status !== "ARCHIVED";
  return {
    ...(summary as NonNullable<typeof summary>),
    description: (task.description as RichTextDoc | null) ?? null,
    project: {
      id: project.id,
      key: project.key,
      name: project.name,
      workspaceId: project.workspaceId,
    },
    parent: parent
      ? { id: parent.id, key: taskKey(project.key, parent.number), title: parent.title }
      : null,
    subtasks,
    blockedBy: blockedBy.map((dependency) => link(dependency.id, dependency.blockingTask)),
    blocks: blocks.map((dependency) => link(dependency.id, dependency.blockedTask)),
    canEdit: writable && loaded.access.canContribute,
    canDelete: writable && canDeleteTask(access, task.createdById, user.id),
  };
}

/** A task by its key in a workspace, e.g. "NEX-42" (PRD §11.6.1). */
export async function loadTaskByKey(tenant: Tenant, user: User, workspaceId: string, key: string) {
  const parsed = parseTaskKey(key);
  if (!parsed) throw taskNotFound();
  const task = await prisma.task.findFirst({
    where: {
      organizationId: tenant.organization.id,
      number: parsed.number,
      deletedAt: null,
      project: { workspaceId, key: parsed.projectKey, deletedAt: null },
    },
    select: { id: true },
  });
  if (!task) throw taskNotFound();
  return loadTask(tenant, task.id, user.id);
}

// ---------------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------------

export async function createTask(
  tenant: Tenant,
  user: User,
  loaded: Loaded,
  input: CreateTask,
  req: Request,
) {
  assertCanWrite(loaded);
  const { project } = loaded;
  const organizationId = tenant.organization.id;
  const assigneeIds = unique(input.assigneeIds) ?? [];
  const labelIds = unique(input.labelIds) ?? [];
  const [status] = await Promise.all([
    input.statusId ? statusInProject(project.id, input.statusId) : defaultStatus(project.id),
    input.parentTaskId ? checkParent(project.id, input.parentTaskId) : null,
    checkReferences(tenant, loaded, { assigneeIds, labelIds, milestoneId: input.milestoneId }),
  ]);
  const position = await positionAtEnd(prisma, { projectId: project.id, statusId: status.id });
  const number = await reserveNumbers(project.id);

  const task = await prisma.task.create({
    data: {
      organizationId,
      projectId: project.id,
      number,
      title: input.title,
      ...descriptionData(input.description),
      statusId: status.id,
      priority: input.priority,
      reporterId: user.id,
      parentTaskId: input.parentTaskId ?? null,
      milestoneId: input.milestoneId ?? null,
      startDate: dateValue(input.startDate) ?? null,
      dueDate: dateValue(input.dueDate) ?? null,
      estimatedHours: input.estimatedHours ?? null,
      actualHours: input.actualHours ?? null,
      position,
      completedAt: status.category === "DONE" ? new Date() : null,
      createdById: user.id,
      assignees: {
        create: assigneeIds.map((userId) => ({ organizationId, userId, assignedById: user.id })),
      },
      labels: { create: labelIds.map((labelId) => ({ labelId })) },
    },
    include: taskInclude,
  });
  await recordTask(tenant, user, loaded, task, "task.created", {
    metadata: { title: task.title },
    req,
  });
  notifyAboutTask(tenant, user, loaded, task.id, "TASK_ASSIGNED", assigneeIds);
  const [summary] = await toTaskSummaries([task]);
  return summary as NonNullable<typeof summary>;
}

// ---------------------------------------------------------------------------
// Changing (PRD §11.6.7)
// ---------------------------------------------------------------------------

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (values: string[]) => [...values].sort();

/** One activity entry per changed field, with readable before/after values. */
function describeChanges(
  task: TaskRow,
  changes: Omit<UpdateTask, "version">,
  context: {
    status: { name: string } | null;
    refs: Awaited<ReturnType<typeof checkReferences>>;
    assigneeIds?: string[];
    labelIds?: string[];
  },
): FieldChange[] {
  const result: FieldChange[] = [];
  const add = (field: string, from: unknown, to: unknown) => {
    if (!same(from, to)) result.push({ field, from, to });
  };
  const number = (value: Prisma.Decimal | null) => (value === null ? null : Number(value));

  if (changes.title !== undefined) add("title", task.title, changes.title);
  if (changes.description !== undefined && !same(task.description ?? null, changes.description)) {
    result.push({ field: "description", from: null, to: null });
  }
  if (context.status) add("status", task.status.name, context.status.name);
  if (changes.priority !== undefined) add("priority", task.priority, changes.priority);
  if (changes.startDate !== undefined) {
    add("startDate", toDateOnly(task.startDate), changes.startDate);
  }
  if (changes.dueDate !== undefined) add("dueDate", toDateOnly(task.dueDate), changes.dueDate);
  if (changes.estimatedHours !== undefined) {
    add("estimatedHours", number(task.estimatedHours), changes.estimatedHours);
  }
  if (changes.actualHours !== undefined) {
    add("actualHours", number(task.actualHours), changes.actualHours);
  }
  if (changes.milestoneId !== undefined) {
    add("milestone", task.milestone?.name ?? null, context.refs.milestone?.name ?? null);
  }
  if (changes.parentTaskId !== undefined) {
    add("parentTaskId", task.parentTaskId, changes.parentTaskId);
  }
  if (context.assigneeIds) {
    const before = task.assignees.map((assignee) => assignee.user);
    if (!same(sorted(before.map((p) => p.id)), sorted(context.assigneeIds))) {
      result.push({
        field: "assignees",
        from: sorted(before.map((p) => p.name)),
        to: sorted(context.assigneeIds.map((id) => context.refs.people.get(id)?.name ?? "")),
      });
    }
  }
  if (context.labelIds) {
    const before = task.labels.map((entry) => entry.label);
    if (!same(sorted(before.map((l) => l.id)), sorted(context.labelIds))) {
      result.push({
        field: "labels",
        from: sorted(before.map((l) => l.name)),
        to: sorted(context.refs.labels.map((l) => l.name)),
      });
    }
  }
  return result;
}

export async function updateTask(
  tenant: Tenant,
  user: User,
  task: TaskRow,
  loaded: Loaded,
  input: UpdateTask,
  req: Request,
) {
  assertCanWrite(loaded);
  const detail = (row: TaskRow) => taskDetail(user, row, loaded);
  const { version, ...changes } = input;
  if (task.version !== version) return throwConflict(task.id, detail);
  const { project } = loaded;
  const assigneeIds = unique(changes.assigneeIds);
  const labelIds = unique(changes.labelIds);
  const statusChanges = changes.statusId !== undefined && changes.statusId !== task.statusId;

  const [status, , refs] = await Promise.all([
    statusChanges ? statusInProject(project.id, changes.statusId as string) : null,
    changes.parentTaskId && changes.parentTaskId !== task.parentTaskId
      ? checkParent(project.id, changes.parentTaskId, {
          id: task.id,
          subtaskCount: task._count.subtasks,
        })
      : null,
    checkReferences(tenant, loaded, {
      ...(assigneeIds ? { assigneeIds } : {}),
      ...(labelIds ? { labelIds } : {}),
      milestoneId: changes.milestoneId ?? null,
    }),
  ]);

  // Check the dates the task will end up with, not just the ones sent.
  const startDate =
    changes.startDate !== undefined ? changes.startDate : toDateOnly(task.startDate);
  const dueDate = changes.dueDate !== undefined ? changes.dueDate : toDateOnly(task.dueDate);
  if (startDate && dueDate && dueDate < startDate) {
    throw new AppError(400, "VALIDATION_ERROR", "The due date must be on or after the start date", [
      { path: "body.dueDate", message: "The due date must be on or after the start date" },
    ]);
  }

  const diff = describeChanges(task, changes, {
    status,
    refs,
    ...(assigneeIds ? { assigneeIds } : {}),
    ...(labelIds ? { labelIds } : {}),
  });
  if (diff.length === 0) return detail(task);

  const data: Prisma.TaskUncheckedUpdateManyInput = {
    version: { increment: 1 },
    ...(changes.title !== undefined ? { title: changes.title } : {}),
    ...descriptionData(changes.description),
    ...(changes.priority !== undefined ? { priority: changes.priority } : {}),
    ...(changes.startDate !== undefined ? { startDate: dateValue(changes.startDate) } : {}),
    ...(changes.dueDate !== undefined ? { dueDate: dateValue(changes.dueDate) } : {}),
    ...(changes.estimatedHours !== undefined ? { estimatedHours: changes.estimatedHours } : {}),
    ...(changes.actualHours !== undefined ? { actualHours: changes.actualHours } : {}),
    ...(changes.milestoneId !== undefined ? { milestoneId: changes.milestoneId } : {}),
    ...(changes.parentTaskId !== undefined ? { parentTaskId: changes.parentTaskId } : {}),
  };
  if (status) {
    data.statusId = status.id;
    data.position = await positionAtEnd(
      prisma,
      { projectId: project.id, statusId: status.id },
      task.id,
    );
    data.completedAt = completion(task.status.category, status.category, task.completedAt);
  }

  const organizationId = tenant.organization.id;
  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.task.updateMany({ where: { id: task.id, version }, data });
      if (count === 0) throw new StaleVersion();
      if (assigneeIds) {
        await tx.taskAssignee.deleteMany({
          where: { taskId: task.id, userId: { notIn: assigneeIds } },
        });
        await tx.taskAssignee.createMany({
          data: assigneeIds.map((userId) => ({
            organizationId,
            taskId: task.id,
            userId,
            assignedById: user.id,
          })),
          skipDuplicates: true,
        });
      }
      if (labelIds) {
        await tx.taskLabel.deleteMany({ where: { taskId: task.id, labelId: { notIn: labelIds } } });
        await tx.taskLabel.createMany({
          data: labelIds.map((labelId) => ({ taskId: task.id, labelId })),
          skipDuplicates: true,
        });
      }
    }, TX);
  } catch (error) {
    if (error instanceof StaleVersion) return throwConflict(task.id, detail);
    throw error;
  }

  await recordTask(tenant, user, loaded, task, "task.updated", { changes: diff, req });

  // Who hears about it: people added or taken off, and the task's people when its column changes.
  const before = task.assignees.map((assignee) => assignee.user.id);
  if (assigneeIds) {
    const added = assigneeIds.filter((id) => !before.includes(id));
    const removed = before.filter((id) => !assigneeIds.includes(id));
    notifyAboutTask(tenant, user, loaded, task.id, "TASK_ASSIGNED", added);
    notifyAboutTask(tenant, user, loaded, task.id, "TASK_UNASSIGNED", removed);
  }
  if (status) {
    notifyAboutTask(
      tenant,
      user,
      loaded,
      task.id,
      "TASK_STATUS_CHANGED",
      [...(assigneeIds ?? before), task.reporterId],
      { status: status.name },
    );
  }
  return detail(await reloadRow(task.id));
}

/** Drag and drop: a new column and/or a new place in it (PRD §11.6.6). */
export async function moveTask(
  tenant: Tenant,
  user: User,
  task: TaskRow,
  loaded: Loaded,
  input: MoveTaskInput,
  req: Request,
) {
  assertCanWrite(loaded);
  const detail = (row: TaskRow) => taskDetail(user, row, loaded);
  if (task.version !== input.version) return throwConflict(task.id, detail);
  const { project } = loaded;
  const status = await statusInProject(project.id, input.statusId);

  const neighbourIds = [input.afterTaskId, input.beforeTaskId].filter(
    (id): id is string => !!id && id !== task.id,
  );
  const neighbours =
    neighbourIds.length === 0
      ? []
      : await prisma.task.findMany({
          where: {
            id: { in: neighbourIds },
            projectId: project.id,
            statusId: status.id,
            deletedAt: null,
          },
          select: { id: true, position: true },
        });
  if (neighbours.length !== new Set(neighbourIds).size) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "The cards next to the new place are not in that column",
    );
  }
  const { position, renumbered } = await positionForMove(
    prisma,
    { projectId: project.id, statusId: status.id },
    task.id,
    neighbours.find((n) => n.id === input.afterTaskId) ?? null,
    neighbours.find((n) => n.id === input.beforeTaskId) ?? null,
  );

  const { count } = await prisma.task.updateMany({
    where: { id: task.id, version: input.version },
    data: {
      statusId: status.id,
      position,
      version: { increment: 1 },
      completedAt: completion(task.status.category, status.category, task.completedAt),
    },
  });
  if (count === 0) return throwConflict(task.id, detail);

  if (status.id !== task.statusId) {
    await recordTask(tenant, user, loaded, task, "task.updated", {
      changes: [{ field: "status", from: task.status.name, to: status.name }],
      req,
    });
    notifyAboutTask(
      tenant,
      user,
      loaded,
      task.id,
      "TASK_STATUS_CHANGED",
      [...task.assignees.map((assignee) => assignee.user.id), task.reporterId],
      { status: status.name },
    );
  }
  // Every move, even inside one column, reaches other people's boards (PRD §11.7.1).
  emitEvent({
    name: "task:moved",
    orgId: tenant.organization.id,
    workspaceId: project.workspaceId,
    projectId: project.id,
    actorId: user.id,
    data: { taskId: task.id, statusId: status.id, position, renumbered },
  });
  return { task: await summaryOf(task.id), renumbered };
}

// ---------------------------------------------------------------------------
// Delete, trash, restore, duplicate (PRD §11.6.9, §11.6.10)
// ---------------------------------------------------------------------------

function assertCanDelete(user: User, task: TaskRow, loaded: Loaded) {
  assertNotArchived(loaded.project);
  if (!canDeleteTask(loaded.access, task.createdById, user.id)) {
    throw new AppError(403, "FORBIDDEN", "You can delete only tasks you created");
  }
}

export async function deleteTask(
  tenant: Tenant,
  user: User,
  task: TaskRow,
  loaded: Loaded,
  req: Request,
) {
  assertCanDelete(user, task, loaded);
  const count = await softDelete([task.id]);
  await recordTask(tenant, user, loaded, task, "task.deleted", {
    metadata: { title: task.title, withSubtasks: count - 1 },
    req,
  });
}

export async function restoreTask(
  tenant: Tenant,
  user: User,
  task: TaskRow,
  loaded: Loaded,
  req: Request,
) {
  assertCanDelete(user, task, loaded);
  if (!task.deletedAt || task.deletedAt < trashCutoff()) {
    throw new AppError(404, "NOT_FOUND", "This task is no longer in the trash");
  }
  if (task.parentTaskId) {
    const parent = await prisma.task.findUnique({
      where: { id: task.parentTaskId },
      select: { deletedAt: true },
    });
    if (parent?.deletedAt) {
      throw new AppError(409, "PARENT_DELETED", "Restore its parent task first");
    }
  }
  // Subtasks deleted together with it come back too.
  await prisma.task.updateMany({
    where: { OR: [{ id: task.id }, { parentTaskId: task.id, deletedAt: task.deletedAt }] },
    data: { deletedAt: null, version: { increment: 1 } },
  });
  await recordTask(tenant, user, loaded, task, "task.restored", { req });
  return summaryOf(task.id);
}

/** Tasks deleted in the last 30 days (subtasks deleted with their parent come back with it). */
export async function listTaskTrash(loaded: Loaded) {
  const { project } = loaded;
  const rows = await prisma.task.findMany({
    where: {
      projectId: project.id,
      deletedAt: { gte: trashCutoff() },
      OR: [{ parentTaskId: null }, { parentTask: { deletedAt: null } }],
    },
    select: { id: true, number: true, title: true, deletedAt: true },
    orderBy: { deletedAt: "desc" },
    take: 200,
  });
  return rows.map((row) => {
    const deletedAt = row.deletedAt ?? new Date();
    return {
      id: row.id,
      key: taskKey(project.key, row.number),
      title: row.title,
      deletedAt: deletedAt.toISOString(),
      purgeAfter: new Date(deletedAt.getTime() + TASK_TRASH_DAYS * DAY_MS).toISOString(),
    };
  });
}

const jsonOrNull = (value: Prisma.JsonValue | null) =>
  value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);

/**
 * A copy with "(copy)" in the title, right after the original. Copies the
 * description, priority, labels, estimate, milestone and subtasks; not the
 * assignees, dates, comments, files, actual hours or links (FR-TASK-08).
 */
export async function duplicateTask(
  tenant: Tenant,
  user: User,
  task: TaskRow,
  loaded: Loaded,
  req: Request,
) {
  assertCanWrite(loaded);
  const { project } = loaded;
  const organizationId = tenant.organization.id;
  const column = { projectId: project.id, statusId: task.statusId };
  const [subtasks, next] = await Promise.all([
    task.parentTaskId
      ? Promise.resolve([])
      : prisma.task.findMany({
          where: { parentTaskId: task.id, deletedAt: null },
          include: { labels: { select: { labelId: true } } },
          orderBy: { number: "asc" },
        }),
    prisma.task.findFirst({
      where: { ...column, deletedAt: null, position: { gt: task.position } },
      orderBy: { position: "asc" },
      select: { position: true },
    }),
  ]);
  const position =
    positionBetween(task.position, next?.position ?? null) ?? (await positionAtEnd(prisma, column));
  const first = await reserveNumbers(project.id, 1 + subtasks.length);
  const copyOf = (source: (typeof subtasks)[number] | TaskRow) => ({
    organizationId,
    projectId: project.id,
    description: jsonOrNull(source.description),
    descriptionText: source.descriptionText,
    priority: source.priority,
    reporterId: user.id,
    milestoneId: source.milestoneId,
    estimatedHours: source.estimatedHours,
    statusId: source.statusId,
    completedAt: source.completedAt ? new Date() : null,
    createdById: user.id,
  });

  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        ...copyOf(task),
        number: first,
        title: `${task.title} (copy)`.slice(0, 200),
        parentTaskId: task.parentTaskId,
        position,
        labels: { create: task.labels.map((entry) => ({ labelId: entry.label.id })) },
      },
    });
    if (subtasks.length > 0) {
      const createdSubtasks = await tx.task.createManyAndReturn({
        data: subtasks.map((subtask, index) => ({
          ...copyOf(subtask),
          number: first + 1 + index,
          title: subtask.title,
          parentTaskId: created.id,
          position: subtask.position,
        })),
        select: { id: true, number: true },
      });
      const idByNumber = new Map(createdSubtasks.map((row) => [row.number, row.id]));
      await tx.taskLabel.createMany({
        data: subtasks.flatMap((subtask, index) =>
          subtask.labels.map((entry) => ({
            taskId: idByNumber.get(first + 1 + index) as string,
            labelId: entry.labelId,
          })),
        ),
      });
    }
    return created;
  }, TX);

  await recordTask(tenant, user, loaded, copy, "task.created", {
    metadata: { title: copy.title, duplicatedFrom: taskKey(project.key, task.number) },
    req,
  });
  return summaryOf(copy.id);
}
