import { isDemoUser } from "../../demo/demo.service.ts";
import type { InvitationInput } from "@nexusflow/shared";
import type { Request } from "express";
import { env } from "../../config/env.ts";
import type { Invitation, User } from "../../generated/prisma/client.ts";
import { logActivity } from "../../lib/activity.ts";
import { randomToken, sha256 } from "../../lib/crypto.ts";
import { sendEmail } from "../../lib/mail/index.ts";
import { invitationMessage } from "../../lib/mail/templates.ts";
import { assertWithinPlan } from "../../lib/planGuard.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { forgetCachedSessions } from "../auth/session.service.ts";
import { countUsage } from "./organizations.service.ts";

// Email invitations (PRD §11.3). The link holds a random token; only its
// fingerprint is stored. Invitations work for 7 days.

const LIFETIME_MS = 7 * 86_400_000;
const inviteLink = (token: string) =>
  new URL(`/invite/${encodeURIComponent(token)}`, env.APP_URL).toString();

function toSummary(invitation: Invitation & { invitedBy: { name: string } }) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    workspaceId: invitation.workspaceId,
    invitedBy: invitation.invitedBy.name,
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    expired: invitation.expiresAt.getTime() <= Date.now(),
  };
}

async function sendInvitationEmail(
  invitation: Pick<Invitation, "email" | "role">,
  token: string,
  organizationName: string,
  inviterName: string,
) {
  await sendEmail({
    to: invitation.email,
    ...invitationMessage({
      organizationName,
      inviterName,
      role: invitation.role,
      link: inviteLink(token),
    }),
  });
}

/** Invites up to 20 people at once. People who already belong are skipped. */
export async function createInvitations(
  tenant: Tenant,
  inviter: User,
  input: InvitationInput,
  req: Request,
) {
  const { organization, subscription } = tenant;

  // A workspace, if chosen, must belong to this organization.
  const workspaceIds = [
    ...new Set(input.invites.map((i) => i.workspaceId).filter((id): id is string => !!id)),
  ];
  if (workspaceIds.length > 0) {
    const found = await prisma.workspace.count({
      where: { id: { in: workspaceIds }, organizationId: organization.id, deletedAt: null },
    });
    if (found !== workspaceIds.length)
      throw new AppError(400, "VALIDATION_ERROR", "Unknown workspace");
  }

  const emails = [...new Set(input.invites.map((i) => i.email))];
  const existingMembers = await prisma.organizationMember.findMany({
    where: { organizationId: organization.id, user: { email: { in: emails } } },
    select: { user: { select: { email: true } } },
  });
  const memberEmails = new Set(existingMembers.map((m) => m.user.email.toLowerCase()));
  const pending = await prisma.invitation.findMany({
    where: { organizationId: organization.id, status: "PENDING", email: { in: emails } },
  });
  const pendingByEmail = new Map(pending.map((inv) => [inv.email.toLowerCase(), inv]));

  const toSend = input.invites.filter(
    (invite, index, all) =>
      !memberEmails.has(invite.email) && all.findIndex((i) => i.email === invite.email) === index,
  );

  // Pending invitations count against the plan, so a FREE team cannot exceed 5 by inviting fast.
  const usage = await countUsage(organization.id);
  const newMembers = toSend.filter(
    (i) => i.role !== "GUEST" && !pendingByEmail.has(i.email),
  ).length;
  const newGuests = toSend.filter((i) => i.role === "GUEST" && !pendingByEmail.has(i.email)).length;
  if (newMembers > 0)
    assertWithinPlan(subscription, "maxMembers", usage.members + usage.pendingMembers, newMembers);
  if (newGuests > 0)
    assertWithinPlan(subscription, "maxGuests", usage.guests + usage.pendingGuests, newGuests);

  for (const invite of toSend) {
    const token = randomToken();
    const data = {
      role: invite.role,
      workspaceId: invite.workspaceId ?? null,
      tokenHash: sha256(token),
      invitedById: inviter.id,
      expiresAt: new Date(Date.now() + LIFETIME_MS),
    };
    // Inviting the same email again refreshes the existing invitation.
    const existing = pendingByEmail.get(invite.email);
    const invitation = existing
      ? await prisma.invitation.update({ where: { id: existing.id }, data })
      : await prisma.invitation.create({
          data: { ...data, organizationId: organization.id, email: invite.email },
        });
    // Demo visitors' invitations are created but never emailed (PRD §26.8).
    if (!isDemoUser(inviter)) {
      await sendInvitationEmail(invitation, token, organization.name, inviter.name);
    }
    await logActivity({
      organizationId: organization.id,
      actorId: inviter.id,
      category: "SECURITY",
      action: "member.invited",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: { email: invite.email, role: invite.role },
      req,
    });
  }

  return {
    invited: toSend.map((i) => i.email),
    skipped: input.invites
      .filter((i) => memberEmails.has(i.email))
      .map((i) => ({ email: i.email, reason: "Already a member" })),
  };
}

export async function listPendingInvitations(organizationId: string) {
  const invitations = await prisma.invitation.findMany({
    where: { organizationId, status: "PENDING" },
    include: { invitedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return invitations.map(toSummary);
}

async function findPending(organizationId: string, invitationId: string) {
  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, organizationId, status: "PENDING" },
  });
  if (!invitation) throw new AppError(404, "NOT_FOUND", "Invitation not found");
  return invitation;
}

/** Sends a fresh link and restarts the 7 days. The old link stops working. */
export async function resendInvitation(tenant: Tenant, actor: User, invitationId: string) {
  const invitation = await findPending(tenant.organization.id, invitationId);
  const token = randomToken();
  const updated = await prisma.invitation.update({
    where: { id: invitation.id },
    data: { tokenHash: sha256(token), expiresAt: new Date(Date.now() + LIFETIME_MS) },
  });
  if (!isDemoUser(actor)) {
    await sendInvitationEmail(updated, token, tenant.organization.name, actor.name);
  }
}

export async function revokeInvitation(
  tenant: Tenant,
  actor: User,
  invitationId: string,
  req: Request,
) {
  const invitation = await findPending(tenant.organization.id, invitationId);
  await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "REVOKED" } });
  await logActivity({
    organizationId: tenant.organization.id,
    actorId: actor.id,
    category: "SECURITY",
    action: "member.invitation_revoked",
    entityType: "invitation",
    entityId: invitation.id,
    metadata: { email: invitation.email },
    req,
  });
}

// ---------------------------------------------------------------------------
// The invitee's side: preview, accept, decline (public links)
// ---------------------------------------------------------------------------

async function findByToken(token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      organization: { include: { subscription: true } },
      invitedBy: { select: { name: true } },
      workspace: true,
    },
  });
  if (!invitation || invitation.status !== "PENDING" || invitation.organization.deletedAt) {
    throw new AppError(
      404,
      "NOT_FOUND",
      "This invitation is not valid. It may have been used or withdrawn.",
    );
  }
  if (invitation.expiresAt.getTime() <= Date.now()) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
    throw new AppError(
      410,
      "INVITATION_EXPIRED",
      "This invitation has expired. Ask for a new one.",
    );
  }
  return invitation;
}

/** What the invitation page shows before anyone signs in. */
export async function previewInvitation(token: string) {
  const invitation = await findByToken(token);
  return {
    organization: { name: invitation.organization.name, logoUrl: invitation.organization.logoUrl },
    invitedBy: invitation.invitedBy.name,
    role: invitation.role,
    email: invitation.email,
  };
}

function assertSameEmail(invitationEmail: string, user: User) {
  if (invitationEmail.toLowerCase() !== user.email.toLowerCase()) {
    throw new AppError(
      403,
      "INVITATION_EMAIL_MISMATCH",
      `This invitation was sent to ${invitationEmail}. Log in with that email to accept it.`,
    );
  }
}

/** Joins the organization (and its workspace) and returns where to go next. */
export async function acceptInvitation(token: string, user: User, req: Request) {
  const invitation = await findByToken(token);
  assertSameEmail(invitation.email, user);
  const { organization } = invitation;

  const alreadyMember = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
  });
  if (!alreadyMember && organization.subscription) {
    // The pending invitation itself is already counted, so check without it.
    const usage = await countUsage(organization.id);
    if (invitation.role === "GUEST") {
      assertWithinPlan(
        organization.subscription,
        "maxGuests",
        usage.guests + usage.pendingGuests - 1,
      );
    } else {
      assertWithinPlan(
        organization.subscription,
        "maxMembers",
        usage.members + usage.pendingMembers - 1,
      );
    }
  }

  const workspace =
    invitation.role === "GUEST"
      ? null
      : ((invitation.workspace && !invitation.workspace.deletedAt ? invitation.workspace : null) ??
        (await prisma.workspace.findFirst({
          where: { organizationId: organization.id, isDefault: true, deletedAt: null },
        })));

  await prisma.$transaction(async (tx) => {
    if (!alreadyMember) {
      await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: invitation.role,
          invitedById: invitation.invitedById,
        },
      });
    }
    if (workspace) {
      await tx.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
        create: { organizationId: organization.id, workspaceId: workspace.id, userId: user.id },
        update: {},
      });
      await tx.user.update({
        where: { id: user.id },
        data: { lastActiveWorkspaceId: workspace.id },
      });
    }
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByUserId: user.id },
    });
    // Tell the inviter (shown in the Inbox from Phase 7).
    await tx.notification.create({
      data: {
        organizationId: organization.id,
        userId: invitation.invitedById,
        type: "MEMBER_JOINED",
        title: `${user.name} joined ${organization.name}`,
        data: { orgSlug: organization.slug },
      },
    });
  });
  forgetCachedSessions({ userId: user.id });
  await logActivity({
    organizationId: organization.id,
    actorId: user.id,
    category: "SECURITY",
    action: "member.joined",
    entityType: "user",
    entityId: user.id,
    metadata: { role: invitation.role },
    req,
  });
  return { orgSlug: organization.slug, workspaceSlug: workspace?.slug ?? null };
}

export async function declineInvitation(token: string, user: User) {
  const invitation = await findByToken(token);
  assertSameEmail(invitation.email, user);
  await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "DECLINED" } });
}
