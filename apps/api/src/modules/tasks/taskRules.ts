import {
  docToText,
  taskKey,
  type FieldChange,
  type RichTextDoc,
  type StatusCategory,
  type TaskDetail,
} from "@nexusflow/shared";
import type { Request } from "express";
import { Prisma, type User } from "../../generated/prisma/client.ts";
import { logActivity } from "../../lib/activity.ts";
import { emitEvent } from "../../lib/events.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { notify } from "../notifications/notifications.service.ts";
import { assertNotArchived, assertProjectRight } from "../projects/access.ts";
import {
  assignablePeople,
  taskInclude,
  toTaskSummaries,
  type Loaded,
  type TaskRow,
} from "./taskAccess.ts";

// Checks and small steps shared by the task services.

/** Long enough for Neon's round trips; the default 5 s is too short for bulk changes. */
export const TX = { maxWait: 10_000, timeout: 30_000 };

export function assertCanWrite(loaded: Loaded) {
  assertProjectRight(loaded.access, "canContribute");
  assertNotArchived(loaded.project);
}

export const dateValue = (value: string | null | undefined) =>
  value === undefined ? undefined : value === null ? null : new Date(`${value}T00:00:00Z`);

/** The editor document plus its plain text (for search); an empty document is stored as nothing. */
export function descriptionData(doc: RichTextDoc | null | undefined) {
  if (doc === undefined) return {};
  const text = doc ? docToText(doc) : "";
  return text && doc
    ? { description: doc as unknown as Prisma.InputJsonValue, descriptionText: text }
    : { description: Prisma.DbNull, descriptionText: null };
}

/** Done columns set the completion time; leaving them clears it (FR-TASK-02, AC-TASK-05). */
export const completion = (from: StatusCategory, to: StatusCategory, current: Date | null) =>
  to === "DONE" ? (from === "DONE" ? current : new Date()) : null;

export async function statusInProject(projectId: string, statusId: string) {
  const status = await prisma.taskStatus.findFirst({ where: { id: statusId, projectId } });
  if (!status) {
    throw new AppError(400, "STATUS_NOT_IN_PROJECT", "This column is not part of the project", [
      { path: "body.statusId", message: "Choose a column from this project" },
    ]);
  }
  return status;
}

export async function defaultStatus(projectId: string) {
  const status = await prisma.taskStatus.findFirst({
    where: { projectId },
    orderBy: [{ isDefault: "desc" }, { position: "asc" }],
  });
  if (!status) throw new AppError(409, "NO_COLUMNS", "Add a column to this project first");
  return status;
}

const invalid = (path: string, message: string, summary = "Some fields are invalid") =>
  new AppError(400, "VALIDATION_ERROR", summary, [{ path, message }]);

/** Checks that assignees, labels and the milestone fit the project; returns them for activity names. */
export async function checkReferences(
  tenant: Tenant,
  loaded: Loaded,
  refs: { assigneeIds?: string[]; labelIds?: string[]; milestoneId?: string | null },
) {
  const { project } = loaded;
  const [people, labels, milestone] = await Promise.all([
    refs.assigneeIds?.length ? assignablePeople(tenant, project) : Promise.resolve([]),
    refs.labelIds?.length
      ? prisma.label.findMany({
          where: { id: { in: refs.labelIds }, workspaceId: project.workspaceId },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    refs.milestoneId
      ? prisma.milestone.findFirst({
          where: { id: refs.milestoneId, projectId: project.id },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
  ]);
  const byId = new Map(people.map((person) => [person.id, person]));
  if ((refs.assigneeIds ?? []).some((id) => !byId.has(id))) {
    throw invalid(
      "body.assigneeIds",
      "Choose people who can work on this project (viewers cannot be assigned)",
      "Only project contributors and managers can be assigned",
    );
  }
  if (labels.length !== (refs.labelIds?.length ?? 0)) {
    throw invalid("body.labelIds", "Choose labels from this workspace", "Unknown label");
  }
  if (refs.milestoneId && !milestone) {
    throw invalid("body.milestoneId", "Choose a milestone from this project", "Unknown milestone");
  }
  return { people: byId, labels, milestone };
}

/** A parent must be a top-level task of the same project; subtasks go one level deep (PRD §11.6.4). */
export async function checkParent(
  projectId: string,
  parentTaskId: string,
  task?: { id: string; subtaskCount: number },
) {
  if (task?.id === parentTaskId) {
    throw invalid("body.parentTaskId", "A task cannot be its own subtask");
  }
  const parent = await prisma.task.findFirst({
    where: { id: parentTaskId, projectId, deletedAt: null },
    select: { id: true, parentTaskId: true },
  });
  if (!parent) throw invalid("body.parentTaskId", "Choose a parent task from this project");
  if (parent.parentTaskId) {
    throw new AppError(400, "MAX_DEPTH", "Subtasks cannot have subtasks of their own");
  }
  if (task && task.subtaskCount > 0) {
    throw new AppError(400, "MAX_DEPTH", "This task has subtasks, so it cannot become a subtask");
  }
  return parent;
}

/**
 * Hands out the next task numbers of a project ("NEX-42"). One UPDATE … RETURNING
 * statement, so the row is locked only for an instant and parallel requests get
 * consecutive numbers with no duplicates (PRD §11.6.1, AC-TASK-01).
 */
export async function reserveNumbers(projectId: string, count = 1) {
  const [row] = await prisma.$queryRaw<{ taskSequence: number }[]>`
    UPDATE "Project" SET "taskSequence" = "taskSequence" + ${count}
    WHERE "id" = ${projectId}::uuid
    RETURNING "taskSequence"`;
  if (!row) throw new AppError(404, "NOT_FOUND", "Project not found");
  return row.taskSequence - count + 1;
}

export async function summaryOf(taskId: string) {
  const row = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
  const [summary] = await toTaskSummaries([row]);
  return summary as NonNullable<typeof summary>;
}

export const reloadRow = (taskId: string) =>
  prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });

/** Someone saved the task after you loaded it: answer 409 with the latest version (AC-TASK-04). */
export async function throwConflict(
  taskId: string,
  detail: (row: TaskRow) => Promise<TaskDetail>,
): Promise<never> {
  const row = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null },
    include: taskInclude,
  });
  throw new AppError(
    409,
    "VERSION_CONFLICT",
    "Someone else changed this task. Here is the latest version.",
    row ? { current: await detail(row) } : undefined,
  );
}

/** Marker thrown inside a transaction when the version check fails. */
export class StaleVersion extends Error {}

/** Deletes tasks and their subtasks (to the trash) and removes their links. Returns the count. */
export async function softDelete(taskIds: string[]) {
  const subtasks = await prisma.task.findMany({
    where: { parentTaskId: { in: taskIds }, deletedAt: null },
    select: { id: true },
  });
  const ids = [...new Set([...taskIds, ...subtasks.map((task) => task.id)])];
  await prisma.$transaction([
    prisma.task.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } }),
    prisma.taskDependency.deleteMany({
      where: { OR: [{ blockingTaskId: { in: ids } }, { blockedTaskId: { in: ids } }] },
    }),
  ]);
  return ids.length;
}

/** Tells people about something that happened to a task (PRD §11.10). */
export function notifyAboutTask(
  tenant: Tenant,
  actor: User,
  loaded: Loaded,
  taskId: string,
  type: "TASK_ASSIGNED" | "TASK_UNASSIGNED" | "TASK_STATUS_CHANGED",
  recipientIds: string[],
  data: Record<string, unknown> = {},
) {
  notify({
    type,
    orgId: tenant.organization.id,
    workspaceId: loaded.project.workspaceId,
    projectId: loaded.project.id,
    actorId: actor.id,
    recipientIds,
    data: { taskId, ...data },
  });
}

/** Writes the task's history entry and announces the change (Phase 6 sends it live). */
export async function recordTask(
  tenant: Tenant,
  actor: User,
  loaded: Loaded,
  task: { id: string; number: number },
  action: string,
  extra: { changes?: FieldChange[]; metadata?: Record<string, unknown>; req?: Request } = {},
) {
  const { project } = loaded;
  await logActivity({
    organizationId: tenant.organization.id,
    workspaceId: project.workspaceId,
    actorId: actor.id,
    action,
    entityType: "task",
    entityId: task.id,
    metadata: {
      key: taskKey(project.key, task.number),
      ...extra.metadata,
    } as Prisma.InputJsonValue,
    ...(extra.changes ? { changes: extra.changes as unknown as Prisma.InputJsonValue } : {}),
    ...(extra.req ? { req: extra.req } : {}),
  });
  emitEvent({
    name: action.replace(".", ":"),
    orgId: tenant.organization.id,
    workspaceId: project.workspaceId,
    projectId: project.id,
    actorId: actor.id,
    data: { taskId: task.id, fields: extra.changes?.map((change) => change.field) ?? [] },
  });
}
