import { canChangeRole, canRemoveMember, type OrgRole } from "@nexusflow/shared";
import type { Request } from "express";
import type { Prisma, User } from "../../generated/prisma/client.ts";
import { logActivity } from "../../lib/activity.ts";
import { assertWithinPlan } from "../../lib/planGuard.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { countUsage, removeFromOrganization } from "./organizations.service.ts";

// Organization members (PRD §11.3, §12.2).

export async function listMembers(
  organizationId: string,
  options: { q?: string; role?: OrgRole; page: number; pageSize: number },
) {
  const where: Prisma.OrganizationMemberWhereInput = {
    organizationId,
    ...(options.role ? { role: options.role } : {}),
    ...(options.q
      ? {
          user: {
            OR: [
              { name: { contains: options.q, mode: "insensitive" } },
              { email: { contains: options.q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };
  const [total, members] = await Promise.all([
    prisma.organizationMember.count({ where }),
    prisma.organizationMember.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: [{ joinedAt: "asc" }],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
  ]);
  return {
    total,
    members: members.map((member) => ({
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      avatarUrl: member.user.avatarUrl,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt.toISOString(),
    })),
  };
}

async function findMember(organizationId: string, userId: string) {
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  if (!member) throw new AppError(404, "NOT_FOUND", "Member not found");
  return member;
}

export async function changeMemberRole(
  tenant: Tenant,
  actor: User,
  targetUserId: string,
  newRole: OrgRole,
  req: Request,
) {
  const { organization, membership, subscription } = tenant;
  const target = await findMember(organization.id, targetUserId);
  if (target.role === newRole) return target;
  if (!canChangeRole(membership.role, target.role, newRole, actor.id === targetUserId)) {
    throw new AppError(403, "FORBIDDEN", "You cannot give this person that role");
  }

  // Moving between guests and members changes which plan limit counts them.
  const usage = await countUsage(organization.id);
  if (target.role === "GUEST" && newRole !== "GUEST") {
    assertWithinPlan(subscription, "maxMembers", usage.members + usage.pendingMembers);
  }
  if (target.role !== "GUEST" && newRole === "GUEST") {
    assertWithinPlan(subscription, "maxGuests", usage.guests + usage.pendingGuests);
  }

  await prisma.$transaction(async (tx) => {
    await tx.organizationMember.update({ where: { id: target.id }, data: { role: newRole } });
    if (newRole === "GUEST") {
      // Guests see only projects shared with them, never whole workspaces or teams (PRD §12.1).
      await tx.workspaceMember.deleteMany({
        where: { organizationId: organization.id, userId: targetUserId },
      });
      await tx.teamMember.deleteMany({
        where: { organizationId: organization.id, userId: targetUserId },
      });
    } else if (target.role === "GUEST") {
      // A former guest joins the default workspace, like a newly invited member.
      const general = await tx.workspace.findFirst({
        where: { organizationId: organization.id, isDefault: true, deletedAt: null },
      });
      if (general) {
        await tx.workspaceMember.upsert({
          where: { workspaceId_userId: { workspaceId: general.id, userId: targetUserId } },
          create: {
            organizationId: organization.id,
            workspaceId: general.id,
            userId: targetUserId,
          },
          update: {},
        });
      }
    }
  });
  await logActivity({
    organizationId: organization.id,
    actorId: actor.id,
    category: "SECURITY",
    action: "member.role_changed",
    entityType: "user",
    entityId: targetUserId,
    changes: [{ field: "role", from: target.role, to: newRole }],
    req,
  });
}

export async function removeMember(
  tenant: Tenant,
  actor: User,
  targetUserId: string,
  req: Request,
) {
  const { organization, membership } = tenant;
  const target = await findMember(organization.id, targetUserId);
  if (!canRemoveMember(membership.role, target.role, actor.id === targetUserId)) {
    throw new AppError(403, "FORBIDDEN", "You cannot remove this person");
  }
  await removeFromOrganization(organization.id, targetUserId);
  await logActivity({
    organizationId: organization.id,
    actorId: actor.id,
    category: "SECURITY",
    action: "member.removed",
    entityType: "user",
    entityId: targetUserId,
    metadata: { role: target.role },
    req,
  });
}
