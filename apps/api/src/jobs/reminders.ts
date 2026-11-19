import { addDays, hourIn, todayIn } from "@nexusflow/shared";
import { prisma } from "../lib/prisma.ts";
import { notify } from "../modules/notifications/notifications.service.ts";
import { toDateOnly } from "../modules/projects/access.ts";

// Deadline reminders (PRD §11.10.3, FR-NOTIF-04). They run every hour; each
// task carries a "reminded at" marker that is set in the same statement that
// claims it, so even 24 runs (or two servers at once) send each reminder once.

const date = (value: string) => new Date(`${value}T00:00:00Z`);

/** Open tasks of live projects with assignees, due within the given days (UTC). */
function candidates(from: string, to: string, marker: "dueSoonNotifiedAt" | "overdueNotifiedAt") {
  return prisma.task.findMany({
    where: {
      deletedAt: null,
      [marker]: null,
      dueDate: { gte: date(from), lte: date(to) },
      status: { category: { not: "DONE" } },
      project: { deletedAt: null, status: { not: "ARCHIVED" } },
      assignees: { some: {} },
    },
    select: {
      id: true,
      organizationId: true,
      projectId: true,
      dueDate: true,
      project: { select: { workspaceId: true } },
      assignees: { select: { user: { select: { id: true, timezone: true } } } },
    },
    take: 1000,
  });
}

/**
 * TASK_DUE_SOON: the task is due tomorrow for an assignee and it is 9:00 or
 * later where they live.
 */
export async function sendDueSoonReminders(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const tasks = await candidates(addDays(today, -1), addDays(today, 2), "dueSoonNotifiedAt");
  let sent = 0;
  for (const task of tasks) {
    const due = toDateOnly(task.dueDate);
    const ready = task.assignees.some(
      ({ user }) =>
        addDays(todayIn(user.timezone, now), 1) === due && hourIn(user.timezone, now) >= 9,
    );
    if (!ready) continue;
    const claimed = await prisma.task.updateMany({
      where: { id: task.id, dueSoonNotifiedAt: null },
      data: { dueSoonNotifiedAt: now },
    });
    if (claimed.count === 0) continue;
    notify({
      type: "TASK_DUE_SOON",
      orgId: task.organizationId,
      workspaceId: task.project.workspaceId,
      projectId: task.projectId,
      actorId: null,
      recipientIds: task.assignees.map(({ user }) => user.id),
      data: { taskId: task.id },
    });
    sent++;
  }
  return sent;
}

/** TASK_OVERDUE: the due date has passed where an assignee lives and the task is not done. */
export async function sendOverdueReminders(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const tasks = await candidates("2000-01-01", today, "overdueNotifiedAt");
  let sent = 0;
  for (const task of tasks) {
    const due = toDateOnly(task.dueDate);
    if (!due || !task.assignees.some(({ user }) => due < todayIn(user.timezone, now))) continue;
    const claimed = await prisma.task.updateMany({
      where: { id: task.id, overdueNotifiedAt: null },
      data: { overdueNotifiedAt: now },
    });
    if (claimed.count === 0) continue;
    notify({
      type: "TASK_OVERDUE",
      orgId: task.organizationId,
      workspaceId: task.project.workspaceId,
      projectId: task.projectId,
      actorId: null,
      recipientIds: task.assignees.map(({ user }) => user.id),
      data: { taskId: task.id },
    });
    sent++;
  }
  return sent;
}

/**
 * MILESTONE_DUE_SOON to the project's managers 3 days before an open
 * milestone is due. Milestones have no marker column, so an earlier
 * notification for the same milestone means "already sent".
 */
export async function sendMilestoneReminders(now = new Date()) {
  const due = date(addDays(now.toISOString().slice(0, 10), 3));
  const milestones = await prisma.milestone.findMany({
    where: {
      status: "OPEN",
      dueDate: due,
      project: { deletedAt: null, status: { not: "ARCHIVED" } },
    },
    select: {
      id: true,
      name: true,
      organizationId: true,
      projectId: true,
      project: {
        select: {
          workspaceId: true,
          members: { where: { role: "PROJECT_MANAGER" }, select: { userId: true } },
        },
      },
    },
    take: 500,
  });
  let sent = 0;
  for (const milestone of milestones) {
    const already = await prisma.notification.count({
      where: { type: "MILESTONE_DUE_SOON", data: { path: ["milestoneId"], equals: milestone.id } },
    });
    if (already > 0) continue;
    notify({
      type: "MILESTONE_DUE_SOON",
      orgId: milestone.organizationId,
      workspaceId: milestone.project.workspaceId,
      projectId: milestone.projectId,
      actorId: null,
      recipientIds: milestone.project.members.map((member) => member.userId),
      data: { milestoneId: milestone.id, milestoneName: milestone.name },
    });
    sent++;
  }
  return sent;
}
