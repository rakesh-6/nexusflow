import {
  DEFAULT_TASK_STATUSES,
  type CreateProjectInput,
  type ProjectRole,
  type ProjectStatus,
  type UpdateProjectInput,
} from "@nexusflow/shared";
import type { Request } from "express";
import { Prisma, type User, type Workspace } from "../../generated/prisma/client.ts";
import { logActivity } from "../../lib/activity.ts";
import { assertWithinPlan } from "../../lib/planGuard.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { assertWorkspacePerson } from "../organizations/people.ts";
import {
  accessFor,
  accessibleProjectsWhere,
  assertNotArchived,
  assertProjectRight,
  doneTaskCounts,
  loadProject,
  projectInclude,
  toProjectDto,
  type LoadedProject,
} from "./access.ts";

// Projects (PRD §11.5).

const TRASH_DAYS = 30;
const DAY_MS = 86_400_000;

const keyTaken = () =>
  new AppError(409, "KEY_TAKEN", "Another project in this workspace uses this key", [
    { path: "body.key", message: "Another project here uses this key (maybe one in the trash)" },
  ]);

const isUniqueViolation = (error: unknown) => (error as { code?: string }).code === "P2002";

/** The editor's JSON format for plain text, so Phase 5's rich-text editor can open it. */
const textToDoc = (text: string) => ({
  type: "doc",
  content: text
    .split(/\n{2,}/)
    .map((paragraph) => ({ type: "paragraph", content: [{ type: "text", text: paragraph }] })),
});

const descriptionData = (text: string | undefined) =>
  text === undefined
    ? {}
    : text
      ? { descriptionText: text, description: textToDoc(text) }
      : { descriptionText: null, description: Prisma.DbNull };

const dateData = (value: string | null | undefined) =>
  value === undefined ? undefined : value ? new Date(value) : null;

async function countActiveProjects(workspaceId: string) {
  return prisma.project.count({
    where: { workspaceId, deletedAt: null, status: { not: "ARCHIVED" } },
  });
}

/** FREE workspaces may have 3 active projects (PRD §11.5.1, AC-PROJ-02). */
async function assertProjectSlot(tenant: Tenant, workspaceId: string) {
  assertWithinPlan(
    tenant.subscription,
    "maxActiveProjectsPerWorkspace",
    await countActiveProjects(workspaceId),
  );
}

/** A team chosen for a project must be in the same workspace. */
async function findTeam(workspaceId: string, teamId: string) {
  const team = await prisma.team.findFirst({ where: { id: teamId, workspaceId, deletedAt: null } });
  if (!team) {
    throw new AppError(400, "VALIDATION_ERROR", "Unknown team", [
      { path: "body.teamId", message: "Choose a team from this workspace" },
    ]);
  }
  return team;
}

// ---------------------------------------------------------------------------
// Listing and reading
// ---------------------------------------------------------------------------

export async function listProjects(
  tenant: Tenant,
  workspace: Workspace,
  user: User,
  filters: { status?: ProjectStatus; teamId?: string; q?: string; includeArchived: boolean },
) {
  const orgRole = tenant.membership.role;
  const projects = await prisma.project.findMany({
    where: {
      AND: [
        accessibleProjectsWhere(tenant.organization.id, user.id, orgRole),
        { workspaceId: workspace.id },
        filters.status
          ? { status: filters.status }
          : filters.includeArchived
            ? {}
            : { status: { not: "ARCHIVED" } },
        filters.teamId ? { teamId: filters.teamId } : {},
        filters.q ? { name: { contains: filters.q, mode: "insensitive" } } : {},
      ],
    },
    include: projectInclude(user.id),
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
  const done = await doneTaskCounts(projects.map((p) => p.id));
  return projects.flatMap((project) => {
    const access = accessFor(project, orgRole);
    return access ? [toProjectDto(project, access, done.get(project.id) ?? 0)] : [];
  });
}

export async function projectDto(tenant: Tenant, project: LoadedProject) {
  const access = accessFor(project, tenant.membership.role);
  if (!access) throw new AppError(404, "NOT_FOUND", "Project not found");
  const done = await doneTaskCounts([project.id]);
  return toProjectDto(project, access, done.get(project.id) ?? 0);
}

/** Reloads a project after a change and returns it as the API shows it. */
async function reload(tenant: Tenant, projectId: string, user: User) {
  const { project } = await loadProject(tenant, projectId, user.id);
  return projectDto(tenant, project);
}

// ---------------------------------------------------------------------------
// Creating and editing (PRD §11.5.1, §11.5.2)
// ---------------------------------------------------------------------------

export async function createProject(
  tenant: Tenant,
  actor: User,
  workspace: Workspace,
  canManageWorkspace: boolean,
  input: CreateProjectInput,
  req: Request,
) {
  const organizationId = tenant.organization.id;
  if (tenant.membership.role === "GUEST") {
    throw new AppError(403, "FORBIDDEN", "Guests cannot create projects");
  }
  if (input.teamId) {
    await findTeam(workspace.id, input.teamId);
    if (!canManageWorkspace) {
      const lead = await prisma.teamMember.count({
        where: { teamId: input.teamId, userId: actor.id, role: "LEAD" },
      });
      if (lead === 0) {
        throw new AppError(403, "FORBIDDEN", "Only the team lead or a workspace admin can do this");
      }
    }
  }
  const ownerId = input.ownerId ?? actor.id;
  if (ownerId !== actor.id) await assertWorkspacePerson(tenant, workspace.id, ownerId);
  await assertProjectSlot(tenant, workspace.id);

  try {
    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          organizationId,
          workspaceId: workspace.id,
          teamId: input.teamId ?? null,
          key: input.key,
          name: input.name,
          ...descriptionData(input.description),
          status: input.status,
          priority: input.priority,
          visibility: input.visibility,
          ownerId,
          startDate: dateData(input.startDate) ?? null,
          endDate: dateData(input.endDate) ?? null,
          createdById: actor.id,
        },
      });
      // The six default columns (PRD AC-PROJ-01).
      await tx.taskStatus.createMany({
        data: DEFAULT_TASK_STATUSES.map((status, position) => ({
          organizationId,
          projectId: created.id,
          ...status,
          position,
        })),
      });
      // The creator and the owner manage the project.
      await tx.projectMember.createMany({
        data: [...new Set([actor.id, ownerId])].map((userId) => ({
          organizationId,
          projectId: created.id,
          userId,
          role: "PROJECT_MANAGER" as const,
          addedById: actor.id,
        })),
      });
      return created;
    });
    await logActivity({
      organizationId,
      workspaceId: workspace.id,
      actorId: actor.id,
      action: "project.created",
      entityType: "project",
      entityId: project.id,
      metadata: { name: project.name, key: project.key },
      req,
    });
    return reload(tenant, project.id, actor);
  } catch (error) {
    if (isUniqueViolation(error)) throw keyTaken();
    throw error;
  }
}

export async function updateProject(
  tenant: Tenant,
  actor: User,
  loaded: Awaited<ReturnType<typeof loadProject>>,
  input: UpdateProjectInput,
  req: Request,
) {
  const { project, access } = loaded;
  assertProjectRight(access, "canManage");
  assertNotArchived(project);
  const keyLocked = project.taskSequence > 0 || project._count.tasks > 0;
  if (input.key !== undefined && input.key !== project.key && keyLocked) {
    throw new AppError(409, "KEY_LOCKED", "The key cannot change after the first task exists");
  }
  if (input.teamId) await findTeam(project.workspaceId, input.teamId);
  if (input.ownerId && input.ownerId !== project.ownerId) {
    await assertWorkspacePerson(tenant, project.workspaceId, input.ownerId);
  }

  const data: Prisma.ProjectUncheckedUpdateInput = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.key !== undefined ? { key: input.key } : {}),
    ...descriptionData(input.description),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
    ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
    ...(input.startDate !== undefined ? { startDate: dateData(input.startDate) } : {}),
    ...(input.endDate !== undefined ? { endDate: dateData(input.endDate) } : {}),
    ...(input.status !== undefined
      ? {
          status: input.status,
          completedAt: input.status === "COMPLETED" ? (project.completedAt ?? new Date()) : null,
        }
      : {}),
  };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id: project.id }, data });
      // The owner is always a project manager (PRD §11.5.3).
      if (input.ownerId && input.ownerId !== project.ownerId) {
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: project.id, userId: input.ownerId } },
          create: {
            organizationId: tenant.organization.id,
            projectId: project.id,
            userId: input.ownerId,
            role: "PROJECT_MANAGER",
            addedById: actor.id,
          },
          update: { role: "PROJECT_MANAGER" },
        });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw keyTaken();
    throw error;
  }

  await logActivity({
    organizationId: tenant.organization.id,
    workspaceId: project.workspaceId,
    actorId: actor.id,
    action: "project.updated",
    entityType: "project",
    entityId: project.id,
    changes: Object.entries(input).map(([field, to]) => ({
      field,
      from: (project as Record<string, unknown>)[field] ?? null,
      to: to ?? null,
    })) as Prisma.InputJsonValue,
    req,
  });
  return reload(tenant, project.id, actor);
}

/** Archive keeps the current status, so restore can return to it (AC-PROJ-05). */
export async function setProjectArchived(
  tenant: Tenant,
  actor: User,
  loaded: Awaited<ReturnType<typeof loadProject>>,
  archived: boolean,
  req: Request,
) {
  const { project, access } = loaded;
  assertProjectRight(access, "canManage");
  const isArchived = project.status === "ARCHIVED";
  if (archived === isArchived) return reload(tenant, project.id, actor);
  if (!archived) await assertProjectSlot(tenant, project.workspaceId);

  await prisma.project.update({
    where: { id: project.id },
    data: archived
      ? { status: "ARCHIVED", previousStatus: project.status, archivedAt: new Date() }
      : { status: project.previousStatus ?? "ACTIVE", previousStatus: null, archivedAt: null },
  });
  await logActivity({
    organizationId: tenant.organization.id,
    workspaceId: project.workspaceId,
    actorId: actor.id,
    action: archived ? "project.archived" : "project.restored",
    entityType: "project",
    entityId: project.id,
    metadata: {
      from: project.status,
      to: archived ? "ARCHIVED" : (project.previousStatus ?? "ACTIVE"),
    },
    req,
  });
  return reload(tenant, project.id, actor);
}

// ---------------------------------------------------------------------------
// Delete, trash and restore (PRD §11.5.6)
// ---------------------------------------------------------------------------

export async function deleteProject(
  tenant: Tenant,
  actor: User,
  loaded: Awaited<ReturnType<typeof loadProject>>,
  req: Request,
) {
  const { project, access } = loaded;
  assertProjectRight(access, "canAdminister");
  await prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } });
  await logActivity({
    organizationId: tenant.organization.id,
    workspaceId: project.workspaceId,
    actorId: actor.id,
    action: "project.deleted",
    entityType: "project",
    entityId: project.id,
    metadata: { name: project.name, key: project.key },
    req,
  });
}

const trashWhere = (organizationId: string): Prisma.ProjectWhereInput => ({
  organizationId,
  deletedAt: { not: null, gte: new Date(Date.now() - TRASH_DAYS * DAY_MS) },
  workspace: { deletedAt: null },
});

/** Projects deleted in the last 30 days (organization owners and admins). */
export async function listTrash(tenant: Tenant) {
  const projects = await prisma.project.findMany({
    where: trashWhere(tenant.organization.id),
    include: { workspace: { select: { id: true, name: true, slug: true } } },
    orderBy: { deletedAt: "desc" },
  });
  return projects.map((project) => {
    const deletedAt = project.deletedAt ?? new Date();
    return {
      id: project.id,
      key: project.key,
      name: project.name,
      workspace: project.workspace,
      deletedAt: deletedAt.toISOString(),
      purgeAfter: new Date(deletedAt.getTime() + TRASH_DAYS * DAY_MS).toISOString(),
    };
  });
}

export async function undeleteProject(
  tenant: Tenant,
  actor: User,
  projectId: string,
  req: Request,
) {
  const project = await prisma.project.findFirst({
    where: { ...trashWhere(tenant.organization.id), id: projectId },
  });
  if (!project) throw new AppError(404, "NOT_FOUND", "This project is not in the trash");
  if (project.status !== "ARCHIVED") await assertProjectSlot(tenant, project.workspaceId);
  await prisma.project.update({ where: { id: project.id }, data: { deletedAt: null } });
  await logActivity({
    organizationId: tenant.organization.id,
    workspaceId: project.workspaceId,
    actorId: actor.id,
    action: "project.undeleted",
    entityType: "project",
    entityId: project.id,
    req,
  });
  return reload(tenant, project.id, actor);
}

// ---------------------------------------------------------------------------
// Members (PRD §11.5.3)
// ---------------------------------------------------------------------------

export async function listProjectMembers(project: { id: string; ownerId: string }) {
  const members = await prisma.projectMember.findMany({
    where: { projectId: project.id },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { createdAt: "asc" },
  });
  return members.map((member) => ({
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
    avatarUrl: member.user.avatarUrl,
    role: member.role,
    isOwner: member.userId === project.ownerId,
  }));
}

/** A project always keeps at least one project manager. */
async function assertAnotherManager(projectId: string, userId: string) {
  const others = await prisma.projectMember.count({
    where: { projectId, role: "PROJECT_MANAGER", userId: { not: userId } },
  });
  if (others === 0) {
    throw new AppError(409, "LAST_MANAGER", "A project needs at least one project manager");
  }
}

async function logMemberChange(
  tenant: Tenant,
  actor: User,
  project: LoadedProject,
  action: string,
  metadata: Prisma.InputJsonValue,
) {
  await logActivity({
    organizationId: tenant.organization.id,
    workspaceId: project.workspaceId,
    actorId: actor.id,
    action,
    entityType: "project",
    entityId: project.id,
    metadata,
  });
}

export async function setProjectMember(
  tenant: Tenant,
  actor: User,
  loaded: Awaited<ReturnType<typeof loadProject>>,
  userId: string,
  role: ProjectRole,
  { mustExist }: { mustExist: boolean },
) {
  const { project, access } = loaded;
  assertProjectRight(access, "canManage");
  assertNotArchived(project);
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId } },
  });
  if (mustExist && !existing) throw new AppError(404, "NOT_FOUND", "Not a member of this project");
  if (!existing)
    await assertWorkspacePerson(tenant, project.workspaceId, userId, { allowGuests: true });
  if (userId === project.ownerId && role !== "PROJECT_MANAGER") {
    throw new AppError(409, "OWNER_IS_MANAGER", "The owner is always a project manager");
  }
  if (existing?.role === "PROJECT_MANAGER" && role !== "PROJECT_MANAGER") {
    await assertAnotherManager(project.id, userId);
  }
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId } },
    create: {
      organizationId: tenant.organization.id,
      projectId: project.id,
      userId,
      role,
      addedById: actor.id,
    },
    update: { role },
  });
  await logMemberChange(
    tenant,
    actor,
    project,
    existing ? "project.member_role_changed" : "project.member_added",
    {
      userId,
      role,
    },
  );
}

export async function removeProjectMember(
  tenant: Tenant,
  actor: User,
  loaded: Awaited<ReturnType<typeof loadProject>>,
  userId: string,
) {
  const { project, access } = loaded;
  assertProjectRight(access, "canManage");
  assertNotArchived(project);
  if (userId === project.ownerId) {
    throw new AppError(409, "OWNER_IS_MANAGER", "Choose another owner before removing this person");
  }
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId } },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Not a member of this project");
  if (existing.role === "PROJECT_MANAGER") await assertAnotherManager(project.id, userId);
  await prisma.projectMember.delete({ where: { id: existing.id } });
  await logMemberChange(tenant, actor, project, "project.member_removed", { userId });
}

// ---------------------------------------------------------------------------
// Activity (PRD §11.5)
// ---------------------------------------------------------------------------

export async function listProjectActivity(
  organizationId: string,
  projectId: string,
  cursor: string | undefined,
  limit: number,
) {
  const rows = await prisma.activityLog.findMany({
    where: { organizationId, entityType: "project", entityId: projectId, category: "DOMAIN" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, limit);
  const actorIds = [...new Set(page.map((row) => row.actorId).filter((id): id is string => !!id))];
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  });
  const names = new Map(actors.map((actor) => [actor.id, actor.name]));
  return {
    items: page.map((row) => ({
      id: row.id,
      action: row.action,
      actorName: row.actorId ? (names.get(row.actorId) ?? "Unknown") : "System",
      changes: row.changes,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
  };
}
