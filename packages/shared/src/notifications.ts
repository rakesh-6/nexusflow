import { z } from "zod";

// Notifications (PRD §11.10, FR-NOTIF-01…07), shared by the API and the web app.

export const NOTIFICATION_TYPES = [
  "TASK_ASSIGNED",
  "TASK_UNASSIGNED",
  "TASK_STATUS_CHANGED",
  "TASK_DUE_SOON",
  "TASK_OVERDUE",
  "TASK_COMMENTED",
  "MENTIONED",
  "PROJECT_ADDED",
  "PROJECT_STATUS_CHANGED",
  "MILESTONE_DUE_SOON",
  "ORG_INVITATION",
  "MEMBER_JOINED",
  "AUTOMATION_ALERT",
  "BILLING_EVENT",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  TASK_ASSIGNED: "A task is assigned to me",
  TASK_UNASSIGNED: "I am taken off a task",
  TASK_STATUS_CHANGED: "A task I follow changes column",
  TASK_DUE_SOON: "A task of mine is due tomorrow",
  TASK_OVERDUE: "A task of mine is overdue",
  TASK_COMMENTED: "Someone comments on a task I follow",
  MENTIONED: "Someone mentions me",
  PROJECT_ADDED: "I am added to a project",
  PROJECT_STATUS_CHANGED: "A project I am in changes status",
  MILESTONE_DUE_SOON: "A milestone I manage is due in 3 days",
  ORG_INVITATION: "I am invited to an organization",
  MEMBER_JOINED: "Someone joins my organization",
  AUTOMATION_ALERT: "An automation needs attention",
  BILLING_EVENT: "Billing news",
};

/** How the settings page groups the types (PRD §11.10.4). */
export const NOTIFICATION_GROUPS: { title: string; types: NotificationType[] }[] = [
  {
    title: "Tasks",
    types: [
      "TASK_ASSIGNED",
      "TASK_UNASSIGNED",
      "TASK_STATUS_CHANGED",
      "TASK_DUE_SOON",
      "TASK_OVERDUE",
    ],
  },
  { title: "Comments", types: ["TASK_COMMENTED", "MENTIONED"] },
  { title: "Projects", types: ["PROJECT_ADDED", "PROJECT_STATUS_CHANGED", "MILESTONE_DUE_SOON"] },
  { title: "Membership", types: ["ORG_INVITATION", "MEMBER_JOINED"] },
  { title: "Billing and automation", types: ["BILLING_EVENT", "AUTOMATION_ALERT"] },
];

/**
 * Everything shows in the app; email only for the important few (FR-NOTIF-05),
 * which also keeps Brevo's free 300 emails a day enough (PRD §26).
 */
const EMAIL_BY_DEFAULT = new Set<NotificationType>([
  "TASK_ASSIGNED",
  "MENTIONED",
  "ORG_INVITATION",
  "TASK_DUE_SOON",
  "TASK_OVERDUE",
]);

export const defaultPreference = (type: NotificationType) => ({
  inApp: true,
  email: EMAIL_BY_DEFAULT.has(type),
});

/** Notifications are kept for 90 days (PRD §26: Neon's 0.5 GB). */
export const NOTIFICATION_RETENTION_DAYS = 90;

export const notificationPreferencesSchema = z.object({
  preferences: z
    .array(z.object({ type: z.enum(NOTIFICATION_TYPES), inApp: z.boolean(), email: z.boolean() }))
    .min(1)
    .max(NOTIFICATION_TYPES.length),
});

export const notificationListSchema = z.object({
  unread: z.stringbool().optional(),
  /** Only MENTIONED notifications. */
  mentions: z.stringbool().optional(),
  orgId: z.uuid().optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const readAllSchema = z.object({ orgId: z.uuid().optional() });

// ---------------------------------------------------------------------------
// What the API answers
// ---------------------------------------------------------------------------

/** Where a notification leads when clicked. */
export interface NotificationLink {
  orgSlug?: string;
  workspaceSlug?: string;
  projectKey?: string;
  taskKey?: string;
  taskId?: string;
  commentId?: string;
  milestoneId?: string;
}

export interface NotificationSummary {
  id: string;
  organizationId: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  data: NotificationLink;
  readAt: string | null;
  createdAt: string;
}

export interface UnreadCount {
  total: number;
  /** Unread notifications per organization id. */
  byOrg: Record<string, number>;
}

export interface NotificationPreferenceSummary {
  type: NotificationType;
  inApp: boolean;
  email: boolean;
}

/** The web address a notification opens, e.g. "/acme/general/tasks/NEX-42". */
export function notificationPath(link: NotificationLink): string | null {
  if (!link.orgSlug || !link.workspaceSlug) return link.orgSlug ? `/${link.orgSlug}` : null;
  const base = `/${link.orgSlug}/${link.workspaceSlug}`;
  if (link.taskKey) return `${base}/tasks/${link.taskKey}`;
  if (link.projectKey) return `${base}/projects/${link.projectKey}/board`;
  return `${base}/home`;
}
