import { canManageWorkspace, type CreateWorkspaceInput } from "@nexusflow/shared";
import type { Request } from "express";
import type { User, Workspace, WorkspaceRole } from "../../generated/prisma/client.ts";
import { logActivity } from "../../lib/activity.ts";
import { randomToken } from "../../lib/crypto.ts";
import { assertWithinPlan } from "../../lib/planGuard.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { countUsage } from "./organizations.service.ts";

// Workspaces (PRD §11.2.4): containers for teams and projects inside an organization.

const slugTaken = () =>
  new AppError(409, "SLUG_TAKEN", "Another workspace already uses this address", [
    { path: "body.slug", message: "Another workspace already uses this address" },
  ]);

/**
 * Finds a workspace you can open, by its address. Workspaces of other
 * organizations, deleted ones, and ones you cannot see all look "not found".
 */
export async function loadWorkspace(tenant: Tenant, slug: string, userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { organizationId: tenant.organization.id, slug, deletedAt: null },
    include: { members: { where: { userId } } },
  });
  const orgRole = tenant.membership.role;
  const explicitRole = workspace?.members[0]?.role ?? null;
  const visible =
    workspace &&
    (orgRole === "OWNER" || orgRole === "ADMIN" || (orgRole === "MEMBER" && explicitRole !== null));
  if (!workspace || !visible) throw new AppError(404, "NOT_FOUND", "Workspace not found");

  const { members: _members, ...plain } = workspace;
  const role: WorkspaceRole =
    orgRole === "MEMBER" ? (explicitRole ?? "WORKSPACE_MEMBER") : "WORKSPACE_ADMIN";
  return { workspace: plain, role, canManage: canManageWorkspace(orgRole, explicitRole) };
}

export function assertCanManage(canManage: boolean) {
  if (!canManage) throw new AppError(403, "FORBIDDEN", "Only workspace admins can do this");
}

export function toWorkspaceDto(workspace: Workspace, role: WorkspaceRole) {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description,
    isDefault: workspace.isDefault,
    archived: workspace.archivedAt !== null,
    role,
  };
}

export async function createWorkspace(
  tenant: Tenant,
  actor: User,
  input: CreateWorkspaceInput,
  req: Request,
) {
  const { organization, subscription } = tenant;
  const usage = await countUsage(organization.id);
  assertWithinPlan(subscription, "maxWorkspaces", usage.workspaces);
  try {
    const workspace = await prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: {
          organizationId: organization.id,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          createdById: actor.id,
        },
      });
      await tx.workspaceMember.create({
        data: {
          organizationId: organization.id,
          workspaceId: created.id,
          userId: actor.id,
          role: "WORKSPACE_ADMIN",
        },
      });
      return created;
    });
    await logActivity({
      organizationId: organization.id,
      workspaceId: workspace.id,
      actorId: actor.id,
      action: "workspace.created",
      entityType: "workspace",
      entityId: workspace.id,
      req,
    });
    return workspace;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw slugTaken();
    throw error;
  }
}

export async function updateWorkspace(
  tenant: Tenant,
  actor: User,
  workspace: Workspace,
  input: Partial<CreateWorkspaceInput>,
  req: Request,
) {
  try {
    const updated = await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
    await logActivity({
      organizationId: tenant.organization.id,
      workspaceId: workspace.id,
      actorId: actor.id,
      action: "workspace.updated",
      entityType: "workspace",
      entityId: workspace.id,
      changes: Object.keys(input).map((field) => ({
        field,
        from: (workspace as Record<string, unknown>)[field] as string,
        to: (input as Record<string, unknown>)[field] as string,
      })),
      req,
    });
    return updated;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw slugTaken();
    throw error;
  }
}

async function assertNotLastWorkspace(organizationId: string, workspaceId: string) {
  const others = await prisma.workspace.count({
    where: { organizationId, deletedAt: null, archivedAt: null, id: { not: workspaceId } },
  });
  if (others === 0) {
    throw new AppError(
      409,
      "LAST_WORKSPACE",
      "An organization needs at least one active workspace",
    );
  }
}

export async function setArchived(
  tenant: Tenant,
  actor: User,
  workspace: Workspace,
  archived: boolean,
  req: Request,
) {
  if (archived) {
    await assertNotLastWorkspace(tenant.organization.id, workspace.id);
  } else {
    // Restoring brings it back under the plan's workspace limit.
    assertWithinPlan(
      tenant.subscription,
      "maxWorkspaces",
      (await countUsage(tenant.organization.id)).workspaces,
    );
  }
  const updated = await prisma.workspace.update({
    where: { id: workspace.id },
    data: { archivedAt: archived ? new Date() : null },
  });
  await logActivity({
    organizationId: tenant.organization.id,
    workspaceId: workspace.id,
    actorId: actor.id,
    action: archived ? "workspace.archived" : "workspace.restored",
    entityType: "workspace",
    entityId: workspace.id,
    req,
  });
  return updated;
}

/** Soft delete. Refused while projects remain, unless deleting them too was confirmed. */
export async function deleteWorkspace(
  tenant: Tenant,
  actor: User,
  workspace: Workspace,
  deleteContents: boolean,
  req: Request,
) {
  await assertNotLastWorkspace(tenant.organization.id, workspace.id);
  const projects = await prisma.project.count({
    where: { workspaceId: workspace.id, deletedAt: null },
  });
  if (projects > 0 && !deleteContents) {
    throw new AppError(
      409,
      "WORKSPACE_NOT_EMPTY",
      `This workspace still has ${projects} projects. Confirm to delete them too.`,
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.workspace.update({
      where: { id: workspace.id },
      data: {
        deletedAt: new Date(),
        isDefault: false,
        // Free the address for a new workspace.
        slug: `deleted-${randomToken().slice(0, 12).toLowerCase()}`,
      },
    });
    if (projects > 0) {
      await tx.project.updateMany({
        where: { workspaceId: workspace.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    }
    if (workspace.isDefault) {
      // Another workspace becomes the default one.
      const next = await tx.workspace.findFirst({
        where: { organizationId: tenant.organization.id, deletedAt: null, archivedAt: null },
        orderBy: { createdAt: "asc" },
      });
      if (next) await tx.workspace.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    await tx.user.updateMany({
      where: { lastActiveWorkspaceId: workspace.id },
      data: { lastActiveWorkspaceId: null },
    });
  });
  await logActivity({
    organizationId: tenant.organization.id,
    workspaceId: workspace.id,
    actorId: actor.id,
    action: "workspace.deleted",
    entityType: "workspace",
    entityId: workspace.id,
    metadata: { name: workspace.name, projectsDeleted: projects },
    req,
  });
}

// ---------------------------------------------------------------------------
// Workspace members
// ---------------------------------------------------------------------------

export async function listWorkspaceMembers(workspaceId: string) {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { createdAt: "asc" },
  });
  return members.map((member) => ({
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
    avatarUrl: member.user.avatarUrl,
    role: member.role,
  }));
}

export async function addWorkspaceMember(
  tenant: Tenant,
  workspace: Workspace,
  userId: string,
  role: WorkspaceRole,
) {
  const orgMember = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: tenant.organization.id, userId } },
  });
  if (!orgMember) throw new AppError(404, "NOT_FOUND", "This person is not in the organization");
  if (orgMember.role === "GUEST") {
    throw new AppError(400, "VALIDATION_ERROR", "Guests join projects, not whole workspaces");
  }
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
    create: { organizationId: tenant.organization.id, workspaceId: workspace.id, userId, role },
    update: { role },
  });
}

export async function removeWorkspaceMember(workspace: Workspace, userId: string) {
  const { count } = await prisma.workspaceMember.deleteMany({
    where: { workspaceId: workspace.id, userId },
  });
  if (count === 0) throw new AppError(404, "NOT_FOUND", "This person is not in the workspace");
}

/** The workspace's history, newest first, one page at a time (PRD §11.2.4). */
export async function listWorkspaceActivity(
  workspaceId: string,
  cursor: string | undefined,
  limit: number,
) {
  const rows = await prisma.activityLog.findMany({
    where: { workspaceId, category: "DOMAIN" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, limit);
  return {
    items: page.map((row) => ({
      id: row.id,
      action: row.action,
      actorId: row.actorId,
      entityType: row.entityType,
      entityId: row.entityId,
      changes: row.changes,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
  };
}
