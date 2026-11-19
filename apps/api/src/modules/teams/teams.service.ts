import type { CreateTeamInput, TeamRole, TeamSummary } from "@nexusflow/shared";
import type { Request } from "express";
import type { Prisma, User, Workspace } from "../../generated/prisma/client.ts";
import { logActivity } from "../../lib/activity.ts";
import { randomToken } from "../../lib/crypto.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { assertWorkspacePerson } from "../organizations/people.ts";
import { loadWorkspace } from "../organizations/workspaces.service.ts";

// Teams: groups of people inside a workspace (PRD §11.4). Workspace admins
// create and delete them; team leads edit their own team and its members.

const slugTaken = () =>
  new AppError(409, "SLUG_TAKEN", "Another team in this workspace uses this address", [
    { path: "body.slug", message: "Another team here uses this address" },
  ]);

const isUniqueViolation = (error: unknown) => (error as { code?: string }).code === "P2002";

const teamInclude = (userId: string) =>
  ({
    members: {
      where: { OR: [{ role: "LEAD" }, { userId }] },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    },
    _count: { select: { members: true, projects: { where: { deletedAt: null } } } },
  }) satisfies Prisma.TeamInclude;

type TeamWithCounts = Prisma.TeamGetPayload<{ include: ReturnType<typeof teamInclude> }>;

function toTeamDto(team: TeamWithCounts, userId: string, canManageWorkspace: boolean): TeamSummary {
  const myRole = team.members.find((m) => m.userId === userId)?.role ?? null;
  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    description: team.description,
    workspaceId: team.workspaceId,
    memberCount: team._count.members,
    projectCount: team._count.projects,
    leads: team.members.filter((m) => m.role === "LEAD").map((m) => m.user),
    myRole,
    canManage: canManageWorkspace || myRole === "LEAD",
  };
}

/** A team you can see (its workspace is open to you), with your rights. */
export async function loadTeam(tenant: Tenant, teamId: string, userId: string) {
  const team = await prisma.team.findFirst({
    where: { id: teamId, organizationId: tenant.organization.id, deletedAt: null },
    include: { ...teamInclude(userId), workspace: { select: { slug: true, deletedAt: true } } },
  });
  if (!team || team.workspace.deletedAt) throw new AppError(404, "NOT_FOUND", "Team not found");
  const { canManage: canManageWorkspace } = await loadWorkspace(
    tenant,
    team.workspace.slug,
    userId,
  );
  const dto = toTeamDto(team, userId, canManageWorkspace);
  return { team, dto, canManageWorkspace };
}

function assertCan(allowed: boolean, message: string) {
  if (!allowed) throw new AppError(403, "FORBIDDEN", message);
}

export async function listTeams(workspace: Workspace, userId: string, canManageWorkspace: boolean) {
  const teams = await prisma.team.findMany({
    where: { workspaceId: workspace.id, deletedAt: null },
    include: teamInclude(userId),
    orderBy: { name: "asc" },
  });
  return teams.map((team) => toTeamDto(team, userId, canManageWorkspace));
}

export async function createTeam(
  tenant: Tenant,
  actor: User,
  workspace: Workspace,
  canManageWorkspace: boolean,
  input: CreateTeamInput,
  req: Request,
) {
  assertCan(canManageWorkspace, "Only workspace admins can create teams");
  await assertWorkspacePerson(tenant, workspace.id, input.leadId);
  try {
    const team = await prisma.$transaction(async (tx) => {
      const created = await tx.team.create({
        data: {
          organizationId: tenant.organization.id,
          workspaceId: workspace.id,
          name: input.name,
          slug: input.slug,
          description: input.description || null,
        },
      });
      await tx.teamMember.create({
        data: {
          organizationId: tenant.organization.id,
          teamId: created.id,
          userId: input.leadId,
          role: "LEAD",
        },
      });
      return created;
    });
    await logActivity({
      organizationId: tenant.organization.id,
      workspaceId: workspace.id,
      actorId: actor.id,
      action: "team.created",
      entityType: "team",
      entityId: team.id,
      metadata: { name: team.name },
      req,
    });
    return (await loadTeam(tenant, team.id, actor.id)).dto;
  } catch (error) {
    if (isUniqueViolation(error)) throw slugTaken();
    throw error;
  }
}

export async function updateTeam(
  tenant: Tenant,
  actor: User,
  loaded: Awaited<ReturnType<typeof loadTeam>>,
  input: { name?: string; slug?: string; description?: string },
) {
  assertCan(loaded.dto.canManage, "Only the team lead or a workspace admin can edit this team");
  try {
    await prisma.team.update({
      where: { id: loaded.team.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw slugTaken();
    throw error;
  }
  return (await loadTeam(tenant, loaded.team.id, actor.id)).dto;
}

/**
 * Deletes a team (PRD AC-TEAM-03). Its projects either stay in the workspace
 * ("move") or are archived; either way they no longer belong to the team.
 */
export async function deleteTeam(
  tenant: Tenant,
  actor: User,
  loaded: Awaited<ReturnType<typeof loadTeam>>,
  projectsAction: "move" | "archive",
  req: Request,
) {
  assertCan(loaded.canManageWorkspace, "Only workspace admins can delete teams");
  const { team } = loaded;
  await prisma.$transaction(async (tx) => {
    if (projectsAction === "archive") {
      const projects = await tx.project.findMany({
        where: { teamId: team.id, deletedAt: null, status: { not: "ARCHIVED" } },
        select: { id: true, status: true },
      });
      for (const project of projects) {
        await tx.project.update({
          where: { id: project.id },
          data: { status: "ARCHIVED", previousStatus: project.status, archivedAt: new Date() },
        });
      }
    }
    await tx.project.updateMany({ where: { teamId: team.id }, data: { teamId: null } });
    await tx.teamMember.deleteMany({ where: { teamId: team.id } });
    await tx.team.update({
      where: { id: team.id },
      // Free the address for a new team.
      data: { deletedAt: new Date(), slug: `deleted-${randomToken().slice(0, 12).toLowerCase()}` },
    });
  });
  await logActivity({
    organizationId: tenant.organization.id,
    workspaceId: team.workspaceId,
    actorId: actor.id,
    action: "team.deleted",
    entityType: "team",
    entityId: team.id,
    metadata: { name: team.name, projectsAction },
    req,
  });
}

// ---------------------------------------------------------------------------
// Members (PRD §11.4: at least one LEAD per team)
// ---------------------------------------------------------------------------

export async function listTeamMembers(teamId: string) {
  const members = await prisma.teamMember.findMany({
    where: { teamId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  return members.map((member) => ({
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
    avatarUrl: member.user.avatarUrl,
    role: member.role,
  }));
}

async function assertAnotherLead(teamId: string, userId: string) {
  const others = await prisma.teamMember.count({
    where: { teamId, role: "LEAD", userId: { not: userId } },
  });
  if (others === 0) throw new AppError(409, "LAST_LEAD", "A team needs at least one lead");
}

export async function setTeamMember(
  tenant: Tenant,
  loaded: Awaited<ReturnType<typeof loadTeam>>,
  userId: string,
  role: TeamRole,
  { mustExist }: { mustExist: boolean },
) {
  assertCan(loaded.dto.canManage, "Only the team lead or a workspace admin can manage members");
  const { team } = loaded;
  const existing = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: team.id, userId } },
  });
  if (mustExist && !existing) throw new AppError(404, "NOT_FOUND", "Not a member of this team");
  if (!existing) await assertWorkspacePerson(tenant, team.workspaceId, userId);
  if (existing?.role === "LEAD" && role !== "LEAD") await assertAnotherLead(team.id, userId);
  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId } },
    create: { organizationId: tenant.organization.id, teamId: team.id, userId, role },
    update: { role },
  });
}

export async function removeTeamMember(
  loaded: Awaited<ReturnType<typeof loadTeam>>,
  userId: string,
) {
  assertCan(loaded.dto.canManage, "Only the team lead or a workspace admin can manage members");
  const existing = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: loaded.team.id, userId } },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Not a member of this team");
  if (existing.role === "LEAD") await assertAnotherLead(loaded.team.id, userId);
  await prisma.teamMember.delete({ where: { id: existing.id } });
}
