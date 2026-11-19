import { projectAccess, taskKey, type AssignablePerson, type TaskSummary } from "@nexusflow/shared";
import type { Prisma } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { loadProject, toDateOnly, type LoadedProject } from "../projects/access.ts";

// Loading tasks and showing them (PRD §11.6). A task is visible exactly when
// its project is, so every task route goes through loadTask → loadProject.

export type Loaded = Awaited<ReturnType<typeof loadProject>>;

const person = { select: { id: true, name: true, avatarUrl: true } } as const;
export const statusRef = { select: { id: true, name: true, color: true, category: true } } as const;

/** Everything a card or list row shows. */
export const taskInclude = {
  status: statusRef,
  assignees: { select: { user: person }, orderBy: { createdAt: "asc" } },
  labels: { select: { label: { select: { id: true, name: true, color: true } } } },
  milestone: { select: { id: true, name: true } },
  reporter: person,
  project: { select: { key: true } },
  _count: {
    select: {
      subtasks: { where: { deletedAt: null } },
      comments: { where: { deletedAt: null } },
      attachments: { where: { deletedAt: null } },
      // Open blockers: blocking tasks that still exist and are not done.
      blockedBy: {
        where: { blockingTask: { deletedAt: null, status: { category: { not: "DONE" } } } },
      },
    },
  },
} satisfies Prisma.TaskInclude;

export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

const toNumber = (value: Prisma.Decimal | null) => (value === null ? null : Number(value));

export function toTaskSummary(task: TaskRow, doneSubtaskCount: number): TaskSummary {
  return {
    id: task.id,
    key: taskKey(task.project.key, task.number),
    number: task.number,
    projectId: task.projectId,
    title: task.title,
    status: task.status,
    priority: task.priority,
    assignees: task.assignees.map((assignee) => assignee.user),
    labels: task.labels.map((entry) => entry.label).sort((a, b) => a.name.localeCompare(b.name)),
    milestone: task.milestone,
    parentTaskId: task.parentTaskId,
    startDate: toDateOnly(task.startDate),
    dueDate: toDateOnly(task.dueDate),
    estimatedHours: toNumber(task.estimatedHours),
    actualHours: toNumber(task.actualHours),
    position: task.position,
    version: task.version,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    reporter: task.reporter,
    createdById: task.createdById,
    subtaskCount: task._count.subtasks,
    doneSubtaskCount,
    openBlockerCount: task._count.blockedBy,
    commentCount: task._count.comments,
    attachmentCount: task._count.attachments,
  };
}

/** Cards for many tasks, with their "done/total" subtask counts in one extra query. */
export async function toTaskSummaries(tasks: TaskRow[]): Promise<TaskSummary[]> {
  const parents = tasks.filter((task) => task._count.subtasks > 0).map((task) => task.id);
  const done =
    parents.length === 0
      ? []
      : await prisma.task.groupBy({
          by: ["parentTaskId"],
          where: { parentTaskId: { in: parents }, deletedAt: null, status: { category: "DONE" } },
          _count: { _all: true },
        });
  const doneBy = new Map(done.map((row) => [row.parentTaskId, row._count._all]));
  return tasks.map((task) => toTaskSummary(task, doneBy.get(task.id) ?? 0));
}

export const taskNotFound = () => new AppError(404, "NOT_FOUND", "Task not found");

/**
 * Loads a task you can open, with your access to its project, or answers
 * "not found". `deleted: true` loads a task from the trash instead.
 */
export async function loadTask(
  tenant: Tenant,
  taskId: string,
  userId: string,
  { deleted = false } = {},
) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      organizationId: tenant.organization.id,
      deletedAt: deleted ? { not: null } : null,
    },
    include: taskInclude,
  });
  if (!task) throw taskNotFound();
  try {
    const loaded = await loadProject(tenant, task.projectId, userId);
    return { task, loaded };
  } catch {
    throw taskNotFound();
  }
}

/**
 * The people who may be assigned tasks in a project: everyone whose project
 * role is contributor or manager (PRD §11.6.3; viewers cannot be assigned).
 * With `includeViewers`, everyone who can open the project (for @mentions).
 */
export async function assignablePeople(
  tenant: Tenant,
  project: LoadedProject,
  { includeViewers = false } = {},
): Promise<AssignablePerson[]> {
  const organizationId = tenant.organization.id;
  const team = project.team && !project.team.deletedAt ? project.team : null;
  const [admins, workspaceMembers, explicit, teamMembers] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { organizationId, role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId: project.workspaceId },
      select: { userId: true, role: true },
    }),
    prisma.projectMember.findMany({
      where: { projectId: project.id },
      select: { userId: true, role: true },
    }),
    team
      ? prisma.teamMember.findMany({
          where: { teamId: team.id },
          select: { userId: true, role: true },
        })
      : Promise.resolve([]),
  ]);

  const workspaceRole = new Map(workspaceMembers.map((m) => [m.userId, m.role]));
  const explicitRole = new Map(explicit.map((m) => [m.userId, m.role]));
  const teamRole = new Map(teamMembers.map((m) => [m.userId, m.role]));
  const candidates = new Set([
    ...admins.map((m) => m.userId),
    ...explicit.map((m) => m.userId),
    ...teamMembers.map((m) => m.userId),
    ...workspaceMembers
      .filter((m) =>
        includeViewers && project.visibility === "WORKSPACE" ? true : m.role === "WORKSPACE_ADMIN",
      )
      .map((m) => m.userId),
  ]);

  const members = await prisma.organizationMember.findMany({
    where: { organizationId, userId: { in: [...candidates] } },
    select: { role: true, user: person },
  });
  return members
    .flatMap((member) => {
      const access = projectAccess({
        orgRole: member.role,
        workspaceRole: workspaceRole.get(member.user.id) ?? null,
        explicitRole: explicitRole.get(member.user.id) ?? null,
        teamRole: teamRole.get(member.user.id) ?? null,
        visibility: project.visibility,
      });
      return access && (includeViewers || access.canContribute)
        ? [{ ...member.user, role: access.role }]
        : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
