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

/** One page of the history of a project, task, …, newest first, with the actors' names. */
export async function listActivity(
  organizationId: string,
  entityType: string,
  entityId: string,
  cursor: string | undefined,
  limit: number,
) {
  const rows = await prisma.activityLog.findMany({
    where: { organizationId, entityType, entityId, category: "DOMAIN" },
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
