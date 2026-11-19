import { projectAccess, type ProjectAccess, type ProjectSummary } from "@nexusflow/shared";
import type { OrgRole, Prisma } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";

// Who can see and change a project (PRD §12.4, §12.5). Every project route
// loads the project through loadProject, so people without access get
// "not found" and the rest get their exact rights.

/** The projects someone can open, as a Prisma filter (PRD §12.5). */
export function accessibleProjectsWhere(
  organizationId: string,
  userId: string,
  orgRole: OrgRole,
): Prisma.ProjectWhereInput {
  const base = { organizationId, deletedAt: null };
  if (orgRole === "OWNER" || orgRole === "ADMIN") return base;
  const explicit = { members: { some: { userId } } };
  if (orgRole === "GUEST") return { ...base, ...explicit };
  return {
    ...base,
    OR: [
      explicit,
      { team: { deletedAt: null, members: { some: { userId } } } },
      { visibility: "WORKSPACE", workspace: { members: { some: { userId } } } },
      { workspace: { members: { some: { userId, role: "WORKSPACE_ADMIN" } } } },
    ],
  };
}

/** Everything needed to show a project and work out your access to it. */
export const projectInclude = (userId: string) =>
  ({
    team: {
      select: {
        id: true,
        name: true,
        slug: true,
        deletedAt: true,
        members: { where: { userId }, select: { role: true } },
      },
    },
    owner: { select: { id: true, name: true, avatarUrl: true } },
    members: { where: { userId }, select: { role: true } },
    workspace: { select: { members: { where: { userId }, select: { role: true } } } },
    _count: { select: { members: true, tasks: { where: { deletedAt: null } } } },
  }) satisfies Prisma.ProjectInclude;

export type LoadedProject = Prisma.ProjectGetPayload<{
  include: ReturnType<typeof projectInclude>;
}>;

export function accessFor(project: LoadedProject, orgRole: OrgRole): ProjectAccess | null {
  const team = project.team && !project.team.deletedAt ? project.team : null;
  return projectAccess({
    orgRole,
    workspaceRole: project.workspace.members[0]?.role ?? null,
    explicitRole: project.members[0]?.role ?? null,
    teamRole: team?.members[0]?.role ?? null,
    visibility: project.visibility,
  });
}

const notFound = () => new AppError(404, "NOT_FOUND", "Project not found");

/** Loads a project you can open, with your access, or answers "not found". */
export async function loadProject(tenant: Tenant, projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: tenant.organization.id, deletedAt: null },
    include: projectInclude(userId),
  });
  const access = project && accessFor(project, tenant.membership.role);
  if (!project || !access) throw notFound();
  return { project, access };
}

/** Loads a project by its key inside a workspace, e.g. "NEX". */
export async function loadProjectByKey(
  tenant: Tenant,
  workspaceId: string,
  key: string,
  userId: string,
) {
  const project = await prisma.project.findFirst({
    where: {
      workspaceId,
      key: key.toUpperCase(),
      organizationId: tenant.organization.id,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!project) throw notFound();
  return loadProject(tenant, project.id, userId);
}

export type ProjectRight = "canManage" | "canAdminister" | "canContribute";

const RIGHT_MESSAGES: Record<ProjectRight, string> = {
  canManage: "Only project managers can do this",
  canAdminister: "Only project managers and workspace admins can do this",
  canContribute: "Viewers cannot change this project",
};

export function assertProjectRight(access: ProjectAccess, right: ProjectRight) {
  if (!access[right]) throw new AppError(403, "FORBIDDEN", RIGHT_MESSAGES[right]);
}

/** Archived projects are read-only except for restore and delete (PRD §11.5.2). */
export function assertNotArchived(project: { status: string }) {
  if (project.status === "ARCHIVED") {
    throw new AppError(409, "PROJECT_ARCHIVED", "This project is archived. Restore it first.");
  }
}

/** "2026-11-18" for a calendar date column. */
export const toDateOnly = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

/** How many tasks are done, per project, counting subtasks too (PRD AC-PROJ-06). */
export async function doneTaskCounts(projectIds: string[]) {
  if (projectIds.length === 0) return new Map<string, number>();
  const rows = await prisma.task.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds }, deletedAt: null, status: { category: "DONE" } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.projectId, row._count._all]));
}

export function toProjectDto(
  project: LoadedProject,
  access: ProjectAccess,
  doneTaskCount: number,
): ProjectSummary {
  const taskCount = project._count.tasks;
  const team = project.team && !project.team.deletedAt ? project.team : null;
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    description: project.descriptionText,
    status: project.status,
    priority: project.priority,
    visibility: project.visibility,
    workspaceId: project.workspaceId,
    team: team ? { id: team.id, name: team.name, slug: team.slug } : null,
    owner: project.owner,
    startDate: toDateOnly(project.startDate),
    endDate: toDateOnly(project.endDate),
    memberCount: project._count.members,
    taskCount,
    doneTaskCount,
    progress: taskCount === 0 ? 0 : Math.round((doneTaskCount / taskCount) * 100),
    keyLocked: project.taskSequence > 0 || taskCount > 0,
    createdAt: project.createdAt.toISOString(),
    access,
  };
}
