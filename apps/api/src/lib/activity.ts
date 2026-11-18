import type { Request } from "express";
import type { ActivityCategory, Prisma } from "../generated/prisma/client.ts";
import { prisma } from "./prisma.ts";

// One line in an organization's history (PRD §11.17, §17.3). DOMAIN rows feed
// the activity feeds; SECURITY and BILLING rows form the audit log.
export async function logActivity(input: {
  organizationId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  category?: ActivityCategory;
  workspaceId?: string;
  changes?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  req?: Request;
}) {
  await prisma.activityLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      category: input.category ?? "DOMAIN",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      workspaceId: input.workspaceId ?? null,
      ip: input.req?.ip ?? null,
      ...(input.changes !== undefined ? { changes: input.changes } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  });
}
