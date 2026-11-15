import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { env } from "../config/env.ts";
import { AppError } from "../utils/errors.ts";

const ONE_MINUTE_MS = 60_000;

interface LimiterOptions {
  /** Short name shown in the RateLimit-Policy response header. */
  name: string;
  /** Requests allowed per minute. */
  perMinute: number;
  /** Return true for requests that should not be counted. */
  skip?: (req: Request) => boolean;
}

// Builds a limiter that counts requests per visitor in a one-minute window and
// answers with our standard 429 error once the limit is passed (PRD SEC-09).
// Counts are kept in memory, which is fine for a single server (PRD §26.1).
export function createLimiter({ name, perMinute, skip }: LimiterOptions) {
  return rateLimit({
    windowMs: ONE_MINUTE_MS,
    limit: perMinute,
    identifier: name,
    // Send the standard RateLimit and RateLimit-Policy headers so clients can
    // see how many requests they have left.
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // Count by IP address. ipKeyGenerator groups IPv6 addresses by network, so
    // one visitor cannot dodge the limit by rotating through IPv6 addresses.
    // Phase 2 switches signed-in users to counting by user id instead.
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
    skip: skip ?? (() => false),
    handler: (req, _res, next) => {
      req.log.warn({ limiter: name }, "Rate limit reached");
      next(
        new AppError(429, "RATE_LIMITED", "Too many requests. Please wait a minute and try again."),
      );
    },
  });
}

// Applied to every /api/v1 request. Health checks are skipped so Render's
// uptime checks can never be blocked.
export const generalLimiter = createLimiter({
  name: "general",
  perMinute: env.RATE_LIMIT_GENERAL_PER_MINUTE,
  skip: (req) => req.path.startsWith("/health"),
});

// For login, sign-up and password reset routes (Phase 2).
export const authLimiter = createLimiter({
  name: "auth",
  perMinute: env.RATE_LIMIT_AUTH_PER_MINUTE,
});
