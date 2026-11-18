import { canInOrg, type OrgPermission } from "@nexusflow/shared";
import type { NextFunction, Request, Response } from "express";
import type { Organization, OrganizationMember, Subscription } from "../generated/prisma/client.ts";
import { prisma } from "../lib/prisma.ts";
import { AppError } from "../utils/errors.ts";

// Tenant isolation, layer 1 (PRD §20.2): every /orgs/:orgSlug/... route first
// checks that the signed-in person is an active member of that organization.
// Anyone else gets "not found", so the API never reveals that it exists.

const notFound = () => new AppError(404, "NOT_FOUND", "Not found");

export async function loadTenant(req: Request, _res: Response, next: NextFunction) {
  const user = req.auth?.user;
  if (!user) throw new AppError(401, "UNAUTHENTICATED", "Please log in to continue");
  if (!user.emailVerifiedAt) {
    throw new AppError(403, "EMAIL_NOT_VERIFIED", "Please verify your email address first");
  }

  const slug = req.params["orgSlug"];
  const organization = await prisma.organization.findFirst({
    where: { slug: typeof slug === "string" ? slug : "", deletedAt: null },
    include: {
      members: { where: { userId: user.id, status: "ACTIVE" } },
      subscription: true,
    },
  });
  const membership = organization?.members[0];
  if (!organization || !membership || !organization.subscription) throw notFound();

  const { members: _members, subscription, ...org } = organization;
  req.tenant = { organization: org, membership, subscription };
  next();
}

export interface Tenant {
  organization: Organization;
  membership: OrganizationMember;
  subscription: Subscription;
}

/** The organization and membership inside a route that used loadTenant. */
export function currentTenant(req: Request): Tenant {
  if (!req.tenant) throw notFound();
  return req.tenant;
}

/** Blocks the route unless the member's role has `permission` (403 FORBIDDEN). */
export function requireOrgPermission(permission: OrgPermission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!canInOrg(currentTenant(req).membership.role, permission)) {
      throw new AppError(403, "FORBIDDEN", "You do not have permission to do this");
    }
    next();
  };
}
