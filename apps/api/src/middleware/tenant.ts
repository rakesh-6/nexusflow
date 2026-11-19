import { canInOrg, type OrgPermission } from "@nexusflow/shared";
import type { NextFunction, Request, Response } from "express";
import type { Organization, OrganizationMember, Subscription } from "../generated/prisma/client.ts";
import { announceAccessChange } from "../lib/events.ts";
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
  const tenant = await findTenant({ slug: typeof slug === "string" ? slug : "" }, user.id);
  if (!tenant) throw notFound();
  req.tenant = tenant;
  next();
}

/**
 * The organization (by slug or id) with this person's active membership, or
 * null when they are not a member. Also used by the real-time gateway.
 */
export async function findTenant(
  where: { slug: string } | { id: string },
  userId: string,
): Promise<Tenant | null> {
  const organization = await prisma.organization.findFirst({
    where: { ...where, deletedAt: null },
    include: {
      members: { where: { userId, status: "ACTIVE" } },
      subscription: true,
    },
  });
  const membership = organization?.members[0];
  if (!organization || !membership || !organization.subscription) return null;
  const { members: _members, subscription, ...org } = organization;
  return { organization: org, membership, subscription };
}

/**
 * After a request that may change who can see what (members, roles, teams,
 * visibility) succeeds, live connections of the organization re-check their
 * rooms, so removed people stop receiving updates (PRD §11.8.2, AC-RT-04).
 */
export function recheckAccessAfter(req: Request, res: Response, next: NextFunction) {
  res.on("finish", () => {
    if (req.method !== "GET" && res.statusCode < 400 && req.tenant) {
      announceAccessChange(req.tenant.organization.id);
    }
  });
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
