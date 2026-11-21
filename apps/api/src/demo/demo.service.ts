import { randomBytes } from "node:crypto";
import { DEMO_EMAIL_DOMAIN, isDemoEmail } from "@nexusflow/shared";
import type { Request, Response } from "express";
import { env } from "../config/env.ts";
import type { User } from "../generated/prisma/client.ts";
import { logger } from "../lib/logger.ts";
import { prisma } from "../lib/prisma.ts";
import { toCurrentUser } from "../modules/auth/auth.service.ts";
import { startSession } from "../modules/auth/session.service.ts";
import { AppError } from "../utils/errors.ts";
import { removeSampleData, seedAcme, setSamplePassword } from "./sampleData.ts";

// "Try the demo" (PRD §26.8). Each click creates a fresh visitor who joins the
// sample organization "Acme Studio" as an ADMIN, with no email needed. Visitors
// share the organization (so they see each other's live changes), and it is
// rebuilt from the sample data every DEMO_RESET_HOURS.

export const DEMO_ORG_SLUG = "acme";
/** At most this many visitor accounts at once, so the free database stays small. */
const MAX_VISITORS = 300;

export const isDemoUser = (user: Pick<User, "email">) => isDemoEmail(user.email);

/** Refuses changes that would spoil the shared demo for others. */
export function assertNotDemo(user: Pick<User, "email">, what: string) {
  if (isDemoUser(user)) {
    throw new AppError(403, "DEMO_RESTRICTED", `${what} is switched off in the demo.`);
  }
}

export async function startDemo(req: Request, res: Response) {
  if (!env.DEMO_MODE) throw new AppError(404, "NOT_FOUND", "The demo is not switched on");
  const organization = await prisma.organization.findFirst({
    where: { slug: DEMO_ORG_SLUG, deletedAt: null },
    select: { id: true, workspaces: { where: { deletedAt: null }, select: { id: true }, take: 1 } },
  });
  if (!organization) {
    // First visit after a deploy: build it in the background and ask to retry.
    resetDemoIfDue().catch((error: unknown) => logger.error({ err: error }, "Demo reset failed"));
    throw new AppError(
      503,
      "DEMO_NOT_READY",
      "The demo is being prepared. Please try again in a minute.",
    );
  }
  const visitors = await prisma.user.count({
    where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
  });
  if (visitors >= MAX_VISITORS) {
    throw new AppError(503, "DEMO_FULL", "The demo is busy right now. Please try again later.");
  }
  const number = randomBytes(3).toString("hex");
  const user = await prisma.user.create({
    data: {
      email: `visitor-${randomBytes(8).toString("hex")}@${DEMO_EMAIL_DOMAIN}`,
      name: `Demo visitor ${number}`,
      timezone: "Asia/Kolkata",
      emailVerifiedAt: new Date(),
      lastActiveWorkspaceId: organization.workspaces[0]?.id ?? null,
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: organization.id, userId: user.id, role: "ADMIN" },
  });
  await startSession(req, res, user.id);
  return { user: toCurrentUser(user), orgSlug: DEMO_ORG_SLUG };
}

let resetting: Promise<string> | null = null;

/**
 * Rebuilds Acme Studio when it is missing or older than DEMO_RESET_HOURS, and
 * removes every visitor with it (their tasks and comments go with the
 * organization). Runs at start-up and hourly; a no-op without DEMO_MODE.
 */
export function resetDemoIfDue(now = new Date()): Promise<string> {
  if (!env.DEMO_MODE) return Promise.resolve("off");
  resetting ??= (async () => {
    try {
      const organization = await prisma.organization.findUnique({
        where: { slug: DEMO_ORG_SLUG },
        select: { createdAt: true },
      });
      const ageHours = organization
        ? (now.getTime() - organization.createdAt.getTime()) / 3_600_000
        : Infinity;
      if (ageHours < env.DEMO_RESET_HOURS) return "fresh";
      const started = Date.now();
      await removeSampleData(["acme"]);
      await prisma.user.deleteMany({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } } });
      // Online, nobody may sign in as the sample people with the public password.
      setSamplePassword(env.NODE_ENV === "production" ? "random" : "public");
      await seedAcme();
      logger.info({ ms: Date.now() - started }, "Demo organization rebuilt");
      return "reset";
    } finally {
      resetting = null;
    }
  })();
  return resetting;
}
