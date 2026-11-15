import { createApp } from "./app.ts";
import { env } from "./config/env.ts";
import { logger } from "./lib/logger.ts";
import { prisma } from "./lib/prisma.ts";

const server = createApp().listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Stop accepting new requests, finish open ones, close the database
// connections, then exit. Render sends SIGTERM when it redeploys or stops.
function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
