import { createApp } from "./app.ts";
import { env } from "./config/env.ts";
import { JOB_HANDLERS } from "./jobs/index.ts";
import { registerJobHandlers, startJobs, stopJobs } from "./lib/jobs.ts";
import { logger } from "./lib/logger.ts";
import { resetDemoIfDue } from "./demo/demo.service.ts";
import { prisma } from "./lib/prisma.ts";
import { startAutomationBridge } from "./modules/automations/automations.engine.ts";
import { attachRealtime } from "./realtime/gateway.ts";

const server = createApp().listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Live updates share the same address and port (PRD §11.8.1).
const realtime = attachRealtime(server);

// Background jobs: reminders, notification emails, clean-ups (PRD §21).
registerJobHandlers(JOB_HANDLERS);
startJobs().catch((error: unknown) =>
  logger.error({ err: error }, "Background jobs could not start; the app keeps running"),
);
// The demo organization exists from the first visit, even after a long sleep (PRD §26.8).
resetDemoIfDue().catch((error: unknown) => logger.error({ err: error }, "Demo reset failed"));

// Task and comment changes become automation jobs (PRD §11.15.2).
const stopAutomations = startAutomationBridge();

// Stop accepting new requests, finish open ones, close the database
// connections, then exit. Render sends SIGTERM when it redeploys or stops.
function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  // Open live connections would keep the server from closing.
  realtime.close();
  stopAutomations();
  server.close(async () => {
    await stopJobs();
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
