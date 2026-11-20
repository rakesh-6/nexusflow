import {
  addDays,
  taskKey,
  textToDoc,
  todayIn,
  type Action,
  type RecipientRole,
} from "@nexusflow/shared";
import type { Automation, Prisma } from "../../generated/prisma/client.ts";
import { logActivity } from "../../lib/activity.ts";
import { emitEvent } from "../../lib/events.ts";
import { enqueue } from "../../lib/jobs.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { notify } from "../notifications/notifications.service.ts";
import { projectInclude, toDateOnly } from "../projects/access.ts";
import { assignablePeople } from "../tasks/taskAccess.ts";
import { positionAtEnd } from "../tasks/taskPositions.ts";
import { completion } from "../tasks/taskRules.ts";

// What each automation action does (PRD §11.15.1). Actions run as the
// automation: history rows have no person (actorId null) and say which rule
// did it, and every change carries the chain of rules that led to it, so the
// engine can stop loops (PRD §11.15.2).

export const automationTaskSelect = {
  id: true,
  number: true,
  title: true,
  projectId: true,
  statusId: true,
  priority: true,
  dueDate: true,
  estimatedHours: true,
  reporterId: true,
  completedAt: true,
  status: { select: { category: true, name: true } },
  assignees: { select: { userId: true } },
  labels: { select: { labelId: true } },
  project: {
    select: { id: true, key: true, name: true, workspaceId: true, ownerId: true, status: true },
  },
} satisfies Prisma.TaskSelect;
export type AutomationTask = Prisma.TaskGetPayload<{ select: typeof automationTaskSelect }>;

export interface RunContext {
  automation: Automation;
  organization: { id: string; slug: string; timezone?: string | null };
  task: AutomationTask;
  /** Rules that led here, this one last. Sent on with every change it makes. */
  origin: string[];
}

/** Says a task changed, so the board updates and other rules can react. */
function announce(ctx: RunContext, name: string, data: Record<string, unknown>) {
  emitEvent({
    name,
    orgId: ctx.organization.id,
    workspaceId: ctx.task.project.workspaceId,
    projectId: ctx.task.project.id,
    actorId: "system",
    data: { taskId: ctx.task.id, origin: ctx.origin, ...data },
  });
}

async function history(ctx: RunContext, field: string, from: unknown, to: unknown) {
  await logActivity({
    organizationId: ctx.organization.id,
    workspaceId: ctx.task.project.workspaceId,
    actorId: null,
    action: "task.updated",
    entityType: "task",
    entityId: ctx.task.id,
    changes: [{ field, from, to }] as unknown as Prisma.InputJsonValue,
    metadata: {
      key: taskKey(ctx.task.project.key, ctx.task.number),
      automationId: ctx.automation.id,
      automationName: ctx.automation.name,
    },
  });
}

/** Changes the task only if nobody else changed it meanwhile (version check). */
async function updateTask(ctx: RunContext, data: Prisma.TaskUncheckedUpdateManyInput) {
  const { count } = await prisma.task.updateMany({
    where: { id: ctx.task.id, deletedAt: null },
    data: { ...data, version: { increment: 1 } },
  });
  if (count === 0) throw new Error("The task no longer exists");
}

async function recipientsFor(
  ctx: RunContext,
  recipients: { roles: RecipientRole[]; userIds: string[] },
) {
  const ids = new Set<string>();
  const { task } = ctx;
  for (const role of recipients.roles) {
    if (role === "ASSIGNEES") task.assignees.forEach((a) => ids.add(a.userId));
    if (role === "REPORTER") ids.add(task.reporterId);
    if (role === "PROJECT_MANAGER") {
      const managers = await prisma.projectMember.findMany({
        where: { projectId: task.project.id, role: "PROJECT_MANAGER" },
        select: { userId: true },
      });
      managers.forEach((m) => ids.add(m.userId));
      ids.add(task.project.ownerId);
    }
    if (role === "ORG_ADMINS") {
      const admins = await prisma.organizationMember.findMany({
        where: { organizationId: ctx.organization.id, role: { in: ["OWNER", "ADMIN"] } },
        select: { userId: true },
      });
      admins.forEach((m) => ids.add(m.userId));
    }
  }
  recipients.userIds.forEach((id) => ids.add(id));
  // Only active members of this organization hear anything.
  const members = await prisma.organizationMember.findMany({
    where: { organizationId: ctx.organization.id, userId: { in: [...ids] }, status: "ACTIVE" },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

const taskPath = async (ctx: RunContext) => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: ctx.task.project.workspaceId },
    select: { slug: true },
  });
  return `/${ctx.organization.slug}/${workspace?.slug ?? ""}/tasks/${taskKey(ctx.task.project.key, ctx.task.number)}`;
};

/** People who may be assigned tasks in the project (contributors and up). */
async function assignableIds(ctx: RunContext) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: ctx.task.project.id },
    include: projectInclude(ctx.automation.createdById),
  });
  const tenant = { organization: { id: ctx.organization.id } } as Tenant;
  return new Set((await assignablePeople(tenant, project)).map((person) => person.id));
}

/**
 * Runs one action and says what it did in plain words. `dryRun` only
 * describes it. Throws when the action cannot be done.
 */
export async function runAction(ctx: RunContext, action: Action, dryRun = false): Promise<string> {
  const { task } = ctx;
  switch (action.type) {
    case "NOTIFY": {
      const people = await recipientsFor(ctx, action.recipients);
      if (!dryRun) {
        notify({
          type: "AUTOMATION_ALERT",
          orgId: ctx.organization.id,
          workspaceId: task.project.workspaceId,
          projectId: task.project.id,
          actorId: null,
          recipientIds: people,
          data: {
            taskId: task.id,
            title: action.message,
            body: `Automation: ${ctx.automation.name}`,
          },
        });
      }
      return `Notified ${people.length} ${people.length === 1 ? "person" : "people"}`;
    }
    case "SEND_EMAIL": {
      const people = await recipientsFor(ctx, action.recipients);
      if (!dryRun) {
        const path = await taskPath(ctx);
        for (const userId of people) {
          await enqueue("email.notification", {
            userId,
            title: action.subject,
            body: `${action.message}\n\n${taskKey(task.project.key, task.number)}: ${task.title}`,
            path,
            orgSlug: ctx.organization.slug,
          });
        }
      }
      return `Emailed ${people.length} ${people.length === 1 ? "person" : "people"}`;
    }
    case "SET_STATUS": {
      const status = await prisma.taskStatus.findFirst({
        where: {
          projectId: task.project.id,
          ...(action.statusId ? { id: action.statusId } : { category: action.category }),
        },
        orderBy: { position: "asc" },
        select: { id: true, name: true, category: true },
      });
      if (!status) throw new Error("That column is not in this project");
      if (status.id === task.statusId) return `Already in ${status.name}`;
      if (!dryRun) {
        await updateTask(ctx, {
          statusId: status.id,
          position: await positionAtEnd(
            prisma,
            { projectId: task.project.id, statusId: status.id },
            task.id,
          ),
          completedAt: completion(task.status.category, status.category, task.completedAt),
        });
        await history(ctx, "status", task.status.name, status.name);
        announce(ctx, "task:updated", { fields: ["status"] });
      }
      return `Moved to ${status.name}`;
    }
    case "SET_PRIORITY": {
      if (task.priority === action.priority) return `Priority already ${action.priority}`;
      if (!dryRun) {
        await updateTask(ctx, { priority: action.priority });
        await history(ctx, "priority", task.priority, action.priority);
        announce(ctx, "task:updated", { fields: ["priority"] });
      }
      return `Priority set to ${action.priority}`;
    }
    case "SET_ASSIGNEES": {
      const allowed = await assignableIds(ctx);
      const chosen = action.userIds.filter((id) => allowed.has(id));
      if (chosen.length === 0) throw new Error("None of the chosen people can be assigned here");
      if (!dryRun) {
        await prisma.$transaction(async (tx) => {
          if (action.mode === "replace") {
            await tx.taskAssignee.deleteMany({
              where: { taskId: task.id, userId: { notIn: chosen } },
            });
          }
          await tx.taskAssignee.createMany({
            data: chosen.map((userId) => ({
              organizationId: ctx.organization.id,
              taskId: task.id,
              userId,
              assignedById: null,
            })),
            skipDuplicates: true,
          });
          await tx.task.update({ where: { id: task.id }, data: { version: { increment: 1 } } });
        });
        await history(ctx, "assignees", null, chosen);
        announce(ctx, "task:updated", { fields: ["assignees"] });
      }
      return `Assigned ${chosen.length} ${chosen.length === 1 ? "person" : "people"}`;
    }
    case "ADD_LABEL": {
      const label = await prisma.label.findFirst({
        where: { id: action.labelId, workspaceId: task.project.workspaceId },
        select: { id: true, name: true },
      });
      if (!label) throw new Error("That label is not in this workspace");
      if (task.labels.some((l) => l.labelId === label.id)) return `Already labelled ${label.name}`;
      if (!dryRun) {
        await prisma.taskLabel.createMany({
          data: [{ taskId: task.id, labelId: label.id }],
          skipDuplicates: true,
        });
        await updateTask(ctx, {});
        await history(ctx, "labels", null, [label.name]);
        announce(ctx, "task:updated", { fields: ["labels"] });
      }
      return `Added label ${label.name}`;
    }
    case "SET_DUE_DATE": {
      const date =
        action.date ??
        addDays(todayIn(ctx.organization.timezone ?? "UTC"), action.relativeDays ?? 0);
      if (!dryRun) {
        await updateTask(ctx, { dueDate: new Date(`${date}T00:00:00.000Z`) });
        await history(ctx, "dueDate", toDateOnly(task.dueDate), date);
        announce(ctx, "task:updated", { fields: ["dueDate"] });
      }
      return `Due date set to ${date}`;
    }
    case "ADD_COMMENT": {
      if (!dryRun) {
        // Comments need an author: the rule's creator, with a note that the rule wrote it.
        const text = `${action.body}\n\n(Automation: ${ctx.automation.name})`;
        const comment = await prisma.comment.create({
          data: {
            organizationId: ctx.organization.id,
            taskId: task.id,
            authorId: ctx.automation.createdById,
            body: textToDoc(text) as unknown as Prisma.InputJsonValue,
            bodyText: text,
          },
          select: { id: true },
        });
        announce(ctx, "comment:created", { commentId: comment.id });
      }
      return "Added a comment";
    }
    case "UPDATE_PROJECT_STATUS": {
      if (task.project.status === action.status) return `Project already ${action.status}`;
      if (task.project.status === "ARCHIVED") throw new Error("The project is archived");
      if (!dryRun) {
        await prisma.project.update({
          where: { id: task.project.id },
          data: { status: action.status },
        });
        await logActivity({
          organizationId: ctx.organization.id,
          workspaceId: task.project.workspaceId,
          actorId: null,
          action: "project.updated",
          entityType: "project",
          entityId: task.project.id,
          changes: [
            { field: "status", from: task.project.status, to: action.status },
          ] as unknown as Prisma.InputJsonValue,
          metadata: { automationId: ctx.automation.id, automationName: ctx.automation.name },
        });
        emitEvent({
          name: "project:updated",
          orgId: ctx.organization.id,
          workspaceId: task.project.workspaceId,
          projectId: task.project.id,
          actorId: "system",
          data: { fields: ["status"], origin: ctx.origin },
        });
      }
      return `Project set to ${action.status}`;
    }
  }
}
