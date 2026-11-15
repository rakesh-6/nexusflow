import { Router } from "express";
import { APP_NAME } from "@nexusflow/shared";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../utils/errors.ts";
import { sendSuccess } from "../../utils/response.ts";
import { withTimeout } from "../../utils/timeout.ts";

// Long enough for a sleeping Neon database to wake up.
const DATABASE_CHECK_TIMEOUT_MS = 10_000;

export const healthRouter = Router();

// Liveness check: answers as long as the server process is running.
healthRouter.get("/", (_req, res) => {
  sendSuccess(res, {
    status: "ok",
    app: APP_NAME,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Readiness check: also confirms the database answers a trivial query.
healthRouter.get("/ready", async (req, res) => {
  const startedAt = Date.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, DATABASE_CHECK_TIMEOUT_MS);
  } catch (error) {
    req.log.warn({ err: error }, "Database readiness check failed");
    throw new AppError(503, "DATABASE_UNAVAILABLE", "The database is not reachable right now");
  }
  sendSuccess(res, { status: "ready", database: "ok", latencyMs: Date.now() - startedAt });
});
