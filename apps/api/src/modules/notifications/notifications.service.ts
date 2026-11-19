import {
  defaultPreference,
  NOTIFICATION_LABELS,
  NOTIFICATION_TYPES,
  notificationPath,
  taskKey,
  type NotificationLink,
  type NotificationPreferenceSummary,
  type NotificationSummary,
  type NotificationType,
  type UnreadCount,
} from "@nexusflow/shared";
import type { Notification, Prisma } from "../../generated/prisma/client.ts";
import { emitEvent } from "../../lib/events.ts";
import { enqueue } from "../../lib/jobs.ts";
import { logger } from "../../lib/logger.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../utils/errors.ts";

// Notifications (PRD §11.10). Services call notify(); it never slows down or
// breaks the request: delivery runs in the background, people who switched a
// type off are skipped, and nobody hears about their own actions (FR-NOTIF-07).

export interface NotificationRequest {
  type: NotificationType;
  orgId: string;
  workspaceId?: string;
  projectId?: string;
  /** Who did it; null for reminders sent by the system. */
  actorId: string | null;
  recipientIds: string[];
  /** taskId, commentId, excerpt, status, milestoneName, … */
  data: Record<string, unknown>;
}

const pending = new Set<Promise<void>>();

export function notify(request: NotificationRequest) {
  const recipientIds = [...new Set(request.recipientIds)].filter((id) => id !== request.actorId);
  if (recipientIds.length === 0) return;
  // Announced at once, so tests and the job bridge can see the request.
  emitEvent({
    name: "notification:requested",
    orgId: request.orgId,
    ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
    ...(request.projectId ? { projectId: request.projectId } : {}),
    actorId: request.actorId ?? "system",
    data: { type: request.type, recipientIds, ...request.data },
  });
  const delivery: Promise<void> = deliver(request, recipientIds)
    .catch((error: unknown) =>
      logger.error({ err: error, type: request.type }, "Notification failed"),
    )
    .finally(() => pending.delete(delivery));
  pending.add(delivery);
}

/** Waits until every notification sent so far is delivered (used by tests and jobs). */
export async function settleNotifications() {
  while (pending.size > 0) await Promise.all([...pending]);
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);

/** Title, short text and link, written once for everyone who gets it. */
async function compose(request: NotificationRequest) {
  const taskId = text(request.data["taskId"]);
  const projectId = request.projectId ?? text(request.data["projectId"]);
  const placeSelect = { key: true, name: true, workspace: { select: { slug: true } } } as const;
  const [organization, actor, task, project] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: request.orgId },
      select: { slug: true, name: true },
    }),
    request.actorId
      ? prisma.user.findUnique({ where: { id: request.actorId }, select: { name: true } })
      : Promise.resolve(null),
    taskId
      ? prisma.task.findUnique({
          where: { id: taskId },
          select: { number: true, title: true, project: { select: placeSelect } },
        })
      : Promise.resolve(null),
    !taskId && projectId
      ? prisma.project.findUnique({ where: { id: projectId }, select: placeSelect })
      : Promise.resolve(null),
  ]);
  const place = task?.project ?? project;
  const key = task && place ? taskKey(place.key, task.number) : "a task";
  const who = actor?.name ?? "Someone";
  const excerpt = text(request.data["excerpt"]) ?? null;
  const titles: Record<NotificationType, string> = {
    TASK_ASSIGNED: `${who} assigned you ${key}`,
    TASK_UNASSIGNED: `${who} took you off ${key}`,
    TASK_STATUS_CHANGED: `${who} moved ${key} to ${text(request.data["status"]) ?? "another column"}`,
    TASK_DUE_SOON: `${key} is due tomorrow`,
    TASK_OVERDUE: `${key} is overdue`,
    TASK_COMMENTED: `${who} commented on ${key}`,
    MENTIONED: `${who} mentioned you on ${key}`,
    PROJECT_ADDED: `${who} added you to ${place?.name ?? "a project"}`,
    PROJECT_STATUS_CHANGED: `${place?.name ?? "A project"} is now ${text(request.data["status"]) ?? "changed"}`,
    MILESTONE_DUE_SOON: `Milestone "${text(request.data["milestoneName"]) ?? ""}" is due in 3 days`,
    ORG_INVITATION: `${who} invited you to ${organization?.name ?? "an organization"}`,
    MEMBER_JOINED: `${text(request.data["name"]) ?? "Someone"} joined ${organization?.name ?? "your organization"}`,
    AUTOMATION_ALERT: text(request.data["title"]) ?? NOTIFICATION_LABELS.AUTOMATION_ALERT,
    BILLING_EVENT: text(request.data["title"]) ?? NOTIFICATION_LABELS.BILLING_EVENT,
  };
  const link: NotificationLink = {
    ...(organization ? { orgSlug: organization.slug } : {}),
    ...(place ? { workspaceSlug: place.workspace.slug, projectKey: place.key } : {}),
    ...(task && place ? { taskKey: key } : {}),
    ...(taskId ? { taskId } : {}),
    ...(text(request.data["commentId"]) ? { commentId: text(request.data["commentId"]) } : {}),
    ...(text(request.data["milestoneId"])
      ? { milestoneId: text(request.data["milestoneId"]) }
      : {}),
  };
  const body =
    excerpt ??
    task?.title ??
    (request.type === "MILESTONE_DUE_SOON"
      ? (place?.name ?? null)
      : (text(request.data["body"]) ?? null));
  return { title: titles[request.type].slice(0, 200), body, link };
}

export function toNotificationSummary(row: Notification): NotificationSummary {
  return {
    id: row.id,
    organizationId: row.organizationId,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data as NotificationLink,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function deliver(request: NotificationRequest, recipientIds: string[]) {
  // Only people still in the organization (someone may have left meanwhile).
  const members = await prisma.organizationMember.findMany({
    where: { organizationId: request.orgId, userId: { in: recipientIds }, status: "ACTIVE" },
    select: { userId: true },
  });
  const userIds = members.map((member) => member.userId);
  if (userIds.length === 0) return;

  const [saved, content] = await Promise.all([
    prisma.notificationPreference.findMany({
      where: { userId: { in: userIds }, type: request.type },
    }),
    compose(request),
  ]);
  const preference = (userId: string) =>
    saved.find((row) => row.userId === userId) ?? defaultPreference(request.type);

  const inApp = userIds.filter((userId) => preference(userId).inApp);
  const rows =
    inApp.length === 0
      ? []
      : await prisma.notification.createManyAndReturn({
          data: inApp.map((userId) => ({
            organizationId: request.orgId,
            userId,
            type: request.type,
            title: content.title,
            body: content.body,
            data: content.link as Prisma.InputJsonValue,
          })),
        });
  for (const row of rows) {
    emitEvent({
      name: "notification:new",
      orgId: request.orgId,
      actorId: request.actorId ?? "system",
      userId: row.userId,
      data: toNotificationSummary(row) as unknown as Record<string, unknown>,
    });
  }
  for (const userId of userIds.filter((id) => preference(id).email)) {
    await enqueue("email.notification", {
      userId,
      title: content.title,
      body: content.body,
      path: notificationPath(content.link),
      orgSlug: content.link.orgSlug ?? null,
    });
  }
}

// ---------------------------------------------------------------------------
// The inbox (PRD §11.10.2)
// ---------------------------------------------------------------------------

/** Notifications of organizations you still belong to (or of none). */
const visible = (userId: string): Prisma.NotificationWhereInput => ({
  userId,
  OR: [
    { organizationId: null },
    {
      organization: {
        deletedAt: null,
        members: { some: { userId, status: "ACTIVE" } },
      },
    },
  ],
});

export async function listNotifications(
  userId: string,
  query: {
    unread?: boolean | undefined;
    mentions?: boolean | undefined;
    orgId?: string | undefined;
    cursor?: string | undefined;
    limit: number;
  },
) {
  const rows = await prisma.notification.findMany({
    where: {
      AND: [
        visible(userId),
        query.unread ? { readAt: null } : {},
        query.mentions ? { type: "MENTIONED" } : {},
        query.orgId ? { organizationId: query.orgId } : {},
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, query.limit);
  return {
    items: page.map(toNotificationSummary),
    nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

export async function unreadCount(userId: string): Promise<UnreadCount> {
  const groups = await prisma.notification.groupBy({
    by: ["organizationId"],
    where: { AND: [visible(userId), { readAt: null }] },
    _count: { _all: true },
  });
  const byOrg: Record<string, number> = {};
  let total = 0;
  for (const group of groups) {
    total += group._count._all;
    if (group.organizationId) byOrg[group.organizationId] = group._count._all;
  }
  return { total, byOrg };
}

export async function markNotification(userId: string, id: string, read: boolean) {
  const { count } = await prisma.notification.updateMany({
    where: { id, userId },
    data: { readAt: read ? new Date() : null },
  });
  if (count === 0) throw new AppError(404, "NOT_FOUND", "Notification not found");
}

/** Marks every unread notification of this person as read, in one organization or all (AC-NOTIF-03). */
export async function markAllRead(userId: string, orgId?: string) {
  const { count } = await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(orgId ? { organizationId: orgId } : {}) },
    data: { readAt: new Date() },
  });
  return { updated: count };
}

// ---------------------------------------------------------------------------
// Preferences (PRD §11.10.4)
// ---------------------------------------------------------------------------

export async function notificationPreferences(
  userId: string,
): Promise<NotificationPreferenceSummary[]> {
  const saved = await prisma.notificationPreference.findMany({ where: { userId } });
  return NOTIFICATION_TYPES.map((type) => {
    const row = saved.find((preference) => preference.type === type);
    return { type, ...(row ? { inApp: row.inApp, email: row.email } : defaultPreference(type)) };
  });
}

export async function saveNotificationPreferences(
  userId: string,
  preferences: NotificationPreferenceSummary[],
) {
  await prisma.$transaction(
    preferences.map((preference) =>
      prisma.notificationPreference.upsert({
        where: { userId_type: { userId, type: preference.type } },
        create: { userId, ...preference },
        update: { inApp: preference.inApp, email: preference.email },
      }),
    ),
  );
  return notificationPreferences(userId);
}
