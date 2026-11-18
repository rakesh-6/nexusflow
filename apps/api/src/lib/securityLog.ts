import type { Request } from "express";
import type { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "./prisma.ts";

// Security events go into ActivityLog with category SECURITY; together they
// form the audit log (PRD §19.7). Events before someone belongs to an
// organization (sign-up, login) have no organizationId (PRD A-23).
export type SecurityAction =
  | "auth.register"
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.logout_all"
  | "auth.email_verified"
  | "auth.password_reset_requested"
  | "auth.password_reset"
  | "auth.password_changed"
  | "auth.reauthenticated"
  | "auth.session_revoked"
  | "auth.oauth_linked"
  | "user.profile_updated"
  | "user.deleted";

export async function logSecurityEvent(
  action: SecurityAction,
  input: { userId: string; req?: Request; metadata?: Prisma.InputJsonValue },
) {
  await prisma.activityLog.create({
    data: {
      category: "SECURITY",
      action,
      actorId: input.userId,
      entityType: "user",
      entityId: input.userId,
      ip: input.req?.ip ?? null,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  });
}
