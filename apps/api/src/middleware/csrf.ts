import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.ts";
import { AppError } from "../utils/errors.ts";

// Cross-site request forgery protection (PRD §19.3). A malicious website could
// try to make your browser send a request to NexusFlow with your cookie. Two
// rules stop that for every request that changes something:
//   1. It must carry the header "X-Requested-With: NexusFlow". Browsers do not
//      let other websites add custom headers without our permission (CORS).
//   2. If the browser says where the request came from (Origin), it must be
//      NexusFlow itself or one of the allowed web addresses.

export const CSRF_HEADER = "x-requested-with";
export const CSRF_HEADER_VALUE = "NexusFlow";

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const allowedOrigins = new Set([...env.WEB_ORIGINS, new URL(env.APP_URL).origin]);

export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (READ_ONLY_METHODS.has(req.method)) return next();

  if (req.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
    throw new AppError(403, "CSRF_HEADER_MISSING", "This request was blocked for your security");
  }

  const origin = req.get("origin");
  const ownOrigin = `${req.protocol}://${req.get("host")}`;
  if (origin && origin !== ownOrigin && !allowedOrigins.has(origin)) {
    throw new AppError(403, "CSRF_ORIGIN_MISMATCH", "This request was blocked for your security");
  }
  next();
}
