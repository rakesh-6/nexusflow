import { NOTIFICATION_RETENTION_DAYS, TASK_TRASH_DAYS } from "@nexusflow/shared";
import { enqueue } from "../lib/jobs.ts";
import { prisma } from "../lib/prisma.ts";
import { fileStorage } from "../lib/storage/files.ts";

// Daily clean-ups that keep the free database small (PRD §26).

const DAY_MS = 86_400_000;
const daysAgo = (days: number, now: Date) => new Date(now.getTime() - days * DAY_MS);

/** Notifications older than 90 days are removed. */
export async function removeOldNotifications(now = new Date()) {
  const { count } = await prisma.notification.deleteMany({
    where: { createdAt: { lt: daysAgo(NOTIFICATION_RETENTION_DAYS, now) } },
  });
  return count;
}

/**
 * Projects and tasks in the trash for more than 30 days are deleted for good
 * (PRD §11.5.6, §11.6.10). Deleting a project also removes its tasks.
 */
export async function emptyTrash(now = new Date()) {
  const cutoff = daysAgo(TASK_TRASH_DAYS, now);
  // Their files leave the storage service first, and stop counting against the plan.
  const files = await prisma.attachment.findMany({
    where: {
      status: "READY",
      OR: [{ task: { deletedAt: { lt: cutoff } } }, { project: { deletedAt: { lt: cutoff } } }],
    },
    select: { organizationId: true, publicId: true, resourceType: true, bytes: true },
  });
  const freed = new Map<string, bigint>();
  for (const file of files) {
    freed.set(file.organizationId, (freed.get(file.organizationId) ?? 0n) + file.bytes);
    await enqueue("storage.destroy", { publicId: file.publicId, kind: file.resourceType });
  }
  for (const [organizationId, bytes] of freed) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { storageUsedBytes: { decrement: bytes } },
    });
  }
  const projects = await prisma.project.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  const tasks = await prisma.task.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  return { projects: projects.count, tasks: tasks.count };
}

/** Uploads that were signed but never confirmed within an hour are removed (PRD §11.11.1). */
export async function removeUnfinishedUploads(now = new Date()) {
  const stale = await prisma.attachment.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - 3_600_000) } },
    select: { id: true, publicId: true, resourceType: true },
    take: 500,
  });
  for (const file of stale) {
    await enqueue("storage.destroy", { publicId: file.publicId, kind: file.resourceType });
  }
  await prisma.attachment.deleteMany({ where: { id: { in: stale.map((file) => file.id) } } });
  return stale.length;
}

/** Deletes one file from the storage service (queued after a delete, retried on failure). */
export async function destroyStoredFile(data: Record<string, unknown>) {
  const publicId = typeof data["publicId"] === "string" ? data["publicId"] : "";
  const kind = data["kind"];
  if (!publicId || (kind !== "IMAGE" && kind !== "VIDEO" && kind !== "RAW")) return;
  if (fileStorage.configured) await fileStorage.destroy(publicId, kind);
}

/** Invitations past their expiry date are marked EXPIRED (PRD §11.3). */
export async function expireInvitations(now = new Date()) {
  const { count } = await prisma.invitation.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  return count;
}
