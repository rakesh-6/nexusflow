import { NOTIFICATION_RETENTION_DAYS, TASK_TRASH_DAYS } from "@nexusflow/shared";
import { prisma } from "../lib/prisma.ts";

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
  const projects = await prisma.project.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  const tasks = await prisma.task.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  return { projects: projects.count, tasks: tasks.count };
}

/** Invitations past their expiry date are marked EXPIRED (PRD §11.3). */
export async function expireInvitations(now = new Date()) {
  const { count } = await prisma.invitation.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  return count;
}
