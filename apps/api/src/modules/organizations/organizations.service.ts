import {
  MAX_OWNED_ORGANIZATIONS,
  orgPermissionsFor,
  type CreateOrganizationInput,
  type OrgRole,
} from "@nexusflow/shared";
import type { Request } from "express";
import type { User, WorkspaceRole } from "../../generated/prisma/client.ts";
import { logActivity } from "../../lib/activity.ts";
import { randomToken } from "../../lib/crypto.ts";
import { limitsFor } from "../../lib/planGuard.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { forgetCachedSessions } from "../auth/session.service.ts";

// ---------------------------------------------------------------------------
// Who can see which workspaces (PRD §12.4)
// ---------------------------------------------------------------------------

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  archived: boolean;
  /** Your role here: explicit, or WORKSPACE_ADMIN for organization owners and admins. */
  role: WorkspaceRole;
}

/** Owners and admins see every workspace; members only theirs; guests none (project access comes in Phase 4). */
export async function accessibleWorkspaces(
  organizationId: string,
  userId: string,
  orgRole: OrgRole,
  includeArchived = false,
): Promise<WorkspaceSummary[]> {
  if (orgRole === "GUEST") return [];
  const workspaces = await prisma.workspace.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(includeArchived ? {} : { archivedAt: null }),
      ...(orgRole === "MEMBER" ? { members: { some: { userId } } } : {}),
    },
    include: { members: { where: { userId } } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return workspaces.map((ws) => ({
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    description: ws.description,
    isDefault: ws.isDefault,
    archived: ws.archivedAt !== null,
    role: orgRole === "MEMBER" ? (ws.members[0]?.role ?? "WORKSPACE_MEMBER") : "WORKSPACE_ADMIN",
  }));
}

// ---------------------------------------------------------------------------
// Usage against plan limits (PRD §23.2)
// ---------------------------------------------------------------------------

export async function countUsage(organizationId: string) {
  const now = new Date();
  const [workspaces, members, guests, pendingMembers, pendingGuests, organization] =
    await Promise.all([
      prisma.workspace.count({ where: { organizationId, deletedAt: null, archivedAt: null } }),
      prisma.organizationMember.count({ where: { organizationId, role: { not: "GUEST" } } }),
      prisma.organizationMember.count({ where: { organizationId, role: "GUEST" } }),
      prisma.invitation.count({
        where: {
          organizationId,
          status: "PENDING",
          expiresAt: { gt: now },
          role: { not: "GUEST" },
        },
      }),
      prisma.invitation.count({
        where: { organizationId, status: "PENDING", expiresAt: { gt: now }, role: "GUEST" },
      }),
      prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { storageUsedBytes: true },
      }),
    ]);
  return {
    workspaces,
    members,
    guests,
    pendingMembers,
    pendingGuests,
    storageBytes: Number(organization.storageUsedBytes),
  };
}

// ---------------------------------------------------------------------------
// Creating and listing organizations (PRD §11.2.1, §11.2.3)
// ---------------------------------------------------------------------------

export async function createOrganization(user: User, input: CreateOrganizationInput, req: Request) {
  const owned = await prisma.organization.count({ where: { ownerId: user.id, deletedAt: null } });
  if (owned >= MAX_OWNED_ORGANIZATIONS) {
    throw new AppError(
      402,
      "PLAN_LIMIT_REACHED",
      `You can own at most ${MAX_OWNED_ORGANIZATIONS} organizations.`,
      {
        limit: "maxOwnedOrganizations",
        current: owned,
        max: MAX_OWNED_ORGANIZATIONS,
      },
    );
  }

  try {
    // Everything an organization needs, created together or not at all.
    const { organization, workspace } = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: input.name, slug: input.slug, ownerId: user.id },
      });
      await tx.organizationMember.create({
        data: { organizationId: organization.id, userId: user.id, role: "OWNER" },
      });
      const workspace = await tx.workspace.create({
        data: {
          organizationId: organization.id,
          name: "General",
          slug: "general",
          isDefault: true,
          createdById: user.id,
        },
      });
      await tx.workspaceMember.create({
        data: {
          organizationId: organization.id,
          workspaceId: workspace.id,
          userId: user.id,
          role: "WORKSPACE_ADMIN",
        },
      });
      await tx.subscription.create({ data: { organizationId: organization.id } });
      await tx.user.update({
        where: { id: user.id },
        data: { lastActiveWorkspaceId: workspace.id },
      });
      return { organization, workspace };
    });
    forgetCachedSessions({ userId: user.id });
    await logActivity({
      organizationId: organization.id,
      actorId: user.id,
      action: "org.created",
      entityType: "organization",
      entityId: organization.id,
      req,
    });
    return { organization, workspace };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw new AppError(409, "SLUG_TAKEN", "This address is already taken. Try another one.", [
        { path: "body.slug", message: "This address is already taken" },
      ]);
    }
    throw error;
  }
}

/** Every organization you belong to, with the workspaces you can open (for the switcher). */
export async function listMyOrganizations(user: User) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: user.id, status: "ACTIVE", organization: { deletedAt: null } },
    include: { organization: { include: { subscription: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return Promise.all(
    memberships.map(async (membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      logoUrl: membership.organization.logoUrl,
      role: membership.role,
      planTier: membership.organization.subscription?.planTier ?? "FREE",
      workspaces: await accessibleWorkspaces(membership.organizationId, user.id, membership.role),
    })),
  );
}

/** Everything the web app's shell needs for one organization (PRD §20.5). */
export async function getOrganizationContext(tenant: Tenant, user: User) {
  const { organization, membership, subscription } = tenant;
  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logoUrl: organization.logoUrl,
    },
    role: membership.role,
    permissions: orgPermissionsFor(membership.role),
    plan: { tier: subscription.planTier, limits: limitsFor(subscription) },
    usage: await countUsage(organization.id),
    workspaces: await accessibleWorkspaces(
      organization.id,
      user.id,
      membership.role,
      membership.role === "OWNER" || membership.role === "ADMIN",
    ),
  };
}

// ---------------------------------------------------------------------------
// Settings, deletion and ownership (PRD §11.2.2)
// ---------------------------------------------------------------------------

export async function updateOrganization(
  tenant: Tenant,
  actor: User,
  input: { name?: string; slug?: string },
  req: Request,
) {
  const { organization } = tenant;
  const slugChanged = input.slug !== undefined && input.slug !== organization.slug;
  try {
    const updated = await prisma.organization.update({
      where: { id: organization.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(slugChanged
          ? {
              slug: input.slug,
              // Remember the old address (PRD §11.2.2: old links keep working for a while).
              slugHistory: [...new Set([...organization.slugHistory, organization.slug])],
            }
          : {}),
      },
    });
    await logActivity({
      organizationId: organization.id,
      actorId: actor.id,
      category: "SECURITY",
      action: "org.settings_changed",
      entityType: "organization",
      entityId: organization.id,
      changes: Object.entries(input).map(([field, to]) => ({
        field,
        from: (organization as Record<string, unknown>)[field] as string,
        to: to as string,
      })),
      req,
    });
    return updated;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw new AppError(409, "SLUG_TAKEN", "This address is already taken. Try another one.", [
        { path: "body.slug", message: "This address is already taken" },
      ]);
    }
    throw error;
  }
}

/** Soft delete: hidden from everyone at once, permanently removed later (PRD §17.4). */
export async function deleteOrganization(
  tenant: Tenant,
  actor: User,
  confirmSlug: string,
  req: Request,
) {
  const { organization } = tenant;
  if (confirmSlug !== organization.slug) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Type the organization's address exactly to confirm",
      [{ path: "body.confirmSlug", message: `Type ${organization.slug} to confirm` }],
    );
  }
  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      deletedAt: new Date(),
      purgeAfter: new Date(Date.now() + 7 * 86_400_000),
      // Free the address for someone else; keep the old one on record.
      slug: `deleted-${randomToken().slice(0, 12).toLowerCase()}`,
      slugHistory: [...new Set([...organization.slugHistory, organization.slug])],
    },
  });
  const workspaceIds = (
    await prisma.workspace.findMany({
      where: { organizationId: organization.id },
      select: { id: true },
    })
  ).map((ws) => ws.id);
  await prisma.user.updateMany({
    where: { lastActiveWorkspaceId: { in: workspaceIds } },
    data: { lastActiveWorkspaceId: null },
  });
  await logActivity({
    organizationId: organization.id,
    actorId: actor.id,
    category: "SECURITY",
    action: "org.deleted",
    entityType: "organization",
    entityId: organization.id,
    req,
  });
}

/** Makes an admin the new owner; the old owner becomes an admin (PRD §11.2.2). */
export async function transferOwnership(
  tenant: Tenant,
  actor: User,
  newOwnerId: string,
  req: Request,
) {
  const { organization } = tenant;
  const target = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: organization.id, userId: newOwnerId } },
  });
  if (!target || target.role !== "ADMIN") {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Choose an admin of this organization as the new owner",
    );
  }
  // Demote first: the database allows only one OWNER at any moment.
  await prisma.$transaction([
    prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId: organization.id, userId: actor.id } },
      data: { role: "ADMIN" },
    }),
    prisma.organizationMember.update({ where: { id: target.id }, data: { role: "OWNER" } }),
    prisma.organization.update({ where: { id: organization.id }, data: { ownerId: newOwnerId } }),
  ]);
  await logActivity({
    organizationId: organization.id,
    actorId: actor.id,
    category: "SECURITY",
    action: "org.ownership_transferred",
    entityType: "organization",
    entityId: organization.id,
    metadata: { from: actor.id, to: newOwnerId },
    req,
  });
}

// ---------------------------------------------------------------------------
// Leaving and removal (PRD §11.3)
// ---------------------------------------------------------------------------

/**
 * Takes someone out of an organization: every workspace, team and project
 * membership and task assignment there ends too. Their work stays.
 */
export async function removeFromOrganization(organizationId: string, userId: string) {
  const where = { organizationId, userId };
  const workspaceIds = (
    await prisma.workspace.findMany({ where: { organizationId }, select: { id: true } })
  ).map((ws) => ws.id);
  await prisma.$transaction([
    prisma.taskAssignee.deleteMany({ where }),
    prisma.projectMember.deleteMany({ where }),
    prisma.teamMember.deleteMany({ where }),
    prisma.workspaceMember.deleteMany({ where }),
    prisma.organizationMember.deleteMany({ where }),
    prisma.user.updateMany({
      where: { id: userId, lastActiveWorkspaceId: { in: workspaceIds } },
      data: { lastActiveWorkspaceId: null },
    }),
  ]);
  forgetCachedSessions({ userId });
}

export async function leaveOrganization(tenant: Tenant, user: User, req: Request) {
  if (tenant.membership.role === "OWNER") {
    throw new AppError(409, "OWNER_CANNOT_LEAVE", "Transfer ownership to an admin before leaving");
  }
  await removeFromOrganization(tenant.organization.id, user.id);
  await logActivity({
    organizationId: tenant.organization.id,
    actorId: user.id,
    category: "SECURITY",
    action: "member.left",
    entityType: "user",
    entityId: user.id,
    req,
  });
}
