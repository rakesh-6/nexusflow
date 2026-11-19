import { PgBoss } from "pg-boss";
import { env } from "../config/env.ts";
import { logger } from "./logger.ts";

// Background jobs (PRD §16, §21): work that should not slow a request down
// (emails) or that runs on a timetable (reminders, clean-ups). pg-boss keeps
// the queue in the same PostgreSQL database, so no extra service is needed.
//
// - In tests, jobs are only recorded in `sentJobs`; tests run handlers directly.
// - With JOBS_ENABLED=false (to let the free Neon database sleep), jobs sent by
//   the app run straight away in the same process and timetables are off.

export const JOB_NAMES = [
  "email.notification",
  "reminders.due-soon",
  "reminders.overdue",
  "reminders.milestones",
  "notifications.retention",
  "trash.purge",
  "invitations.expire",
] as const;
export type JobName = (typeof JOB_NAMES)[number];
export type JobHandler = (data: Record<string, unknown>) => Promise<void>;

/** When the timetable jobs run (cron, UTC). Markers in the data make reruns harmless. */
const SCHEDULES: Partial<Record<JobName, string>> = {
  "reminders.due-soon": "5 * * * *",
  "reminders.overdue": "10 * * * *",
  "reminders.milestones": "15 * * * *",
  "invitations.expire": "20 * * * *",
  "notifications.retention": "30 3 * * *",
  "trash.purge": "40 3 * * *",
};

/** Jobs sent while testing, newest last. */
export const sentJobs: { name: JobName; data: Record<string, unknown> }[] = [];

let boss: PgBoss | null = null;
let handlers: Partial<Record<JobName, JobHandler>> = {};

/** Tells the queue which function does each job (called once at start-up). */
export function registerJobHandlers(map: Partial<Record<JobName, JobHandler>>) {
  handlers = { ...handlers, ...map };
}

export async function enqueue(name: JobName, data: Record<string, unknown>) {
  if (env.NODE_ENV === "test") {
    sentJobs.push({ name, data });
    return;
  }
  if (boss) {
    await boss.send(name, data, { retryLimit: 3, retryDelay: 30, retryBackoff: true });
    return;
  }
  // No queue running: do the work now, without making the caller wait.
  const handler = handlers[name];
  if (handler)
    handler(data).catch((error: unknown) => logger.error({ err: error, job: name }, "Job failed"));
}

/** Starts the queue, its workers and its timetable. */
export async function startJobs() {
  if (!env.JOBS_ENABLED || env.NODE_ENV === "test") return;
  const queue = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: "pgboss",
    max: 3,
    // Fewer checks keep the free Neon database from staying awake for nothing.
    superviseIntervalSeconds: 300,
    cronMonitorIntervalSeconds: 60,
  });
  queue.on("error", (error: unknown) => logger.error({ err: error }, "Job queue error"));
  await queue.start();
  for (const name of JOB_NAMES) {
    await queue.createQueue(name);
    const handler = handlers[name];
    if (handler) {
      await queue.work<Record<string, unknown>>(
        name,
        { pollingIntervalSeconds: 30 },
        async (jobs) => {
          for (const job of jobs) await handler(job.data ?? {});
        },
      );
    }
    const cron = SCHEDULES[name];
    if (cron) await queue.schedule(name, cron, {}, { tz: "UTC" });
  }
  boss = queue;
  logger.info("Background jobs started");
}

export async function stopJobs() {
  const queue = boss;
  boss = null;
  await queue?.stop({ graceful: true }).catch(() => {});
}
