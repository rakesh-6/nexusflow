import { env } from "../config/env.ts";
import type { JobHandler, JobName } from "../lib/jobs.ts";
import { sendEmail } from "../lib/mail/index.ts";
import { notificationMessage } from "../lib/mail/templates.ts";
import { prisma } from "../lib/prisma.ts";
import { reconcileSubscriptions } from "../modules/billing/billing.service.ts";
import { settleNotifications } from "../modules/notifications/notifications.service.ts";
import {
  destroyStoredFile,
  emptyTrash,
  expireInvitations,
  removeOldNotifications,
  removeUnfinishedUploads,
} from "./cleanup.ts";
import { sendDueSoonReminders, sendMilestoneReminders, sendOverdueReminders } from "./reminders.ts";

// What each background job does (the queue itself is in lib/jobs.ts).

/** Sends one notification email (PRD §11.10.1). Throwing makes the queue try again later. */
export async function sendNotificationEmail(data: Record<string, unknown>) {
  const userId = typeof data["userId"] === "string" ? data["userId"] : "";
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, emailVerifiedAt: { not: null } },
    select: { email: true, name: true },
  });
  if (!user) return;
  const path = typeof data["path"] === "string" ? data["path"] : "/";
  const orgSlug = typeof data["orgSlug"] === "string" ? data["orgSlug"] : null;
  const sent = await sendEmail({
    to: user.email,
    ...notificationMessage({
      name: user.name,
      title: String(data["title"] ?? "You have a new notification"),
      body: typeof data["body"] === "string" ? data["body"] : null,
      link: new URL(path, env.APP_URL).toString(),
      preferencesLink: new URL(
        orgSlug ? `/${orgSlug}/settings/notifications` : "/",
        env.APP_URL,
      ).toString(),
    }),
  });
  if (!sent) throw new Error("Notification email not sent");
}

/** A reminder run is finished only when its notifications are delivered. */
const remind = (run: () => Promise<number>) => async () => {
  await run();
  await settleNotifications();
};

export const JOB_HANDLERS: Record<JobName, JobHandler> = {
  "email.notification": sendNotificationEmail,
  "reminders.due-soon": remind(() => sendDueSoonReminders()),
  "reminders.overdue": remind(() => sendOverdueReminders()),
  "reminders.milestones": remind(() => sendMilestoneReminders()),
  "notifications.retention": async () => void (await removeOldNotifications()),
  "trash.purge": async () => void (await emptyTrash()),
  "invitations.expire": async () => void (await expireInvitations()),
  "storage.destroy": destroyStoredFile,
  "attachments.cleanup": async () => void (await removeUnfinishedUploads()),
  // Plans cancelled or downgraded at the period end switch over (AC-BILL-05).
  "billing.reconcile": async () => void (await reconcileSubscriptions()),
};
