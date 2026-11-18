import type { NextFunction, Request, Response } from "express";
import type { Session, User } from "../generated/prisma/client.ts";
import { hasRecentAuth } from "../modules/auth/auth.service.ts";
import {
  clearSessionCookie,
  findActiveSession,
  SESSION_COOKIE,
  setSessionCookie,
} from "../modules/auth/session.service.ts";
import { AppError } from "../utils/errors.ts";

/** Reads the session cookie on every API request and sets `req.auth` when it is valid. */
export async function loadSession(req: Request, res: Response, next: NextFunction) {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token.length > 0) {
    const active = await findActiveSession(token);
    if (active) {
      req.auth = { user: active.user, session: active.session };
      if (active.extended) setSessionCookie(res, token);
    } else {
      // The cookie points at an ended or unknown session: remove it.
      clearSessionCookie(res);
    }
  }
  next();
}

/** Blocks the route unless someone is signed in (401 UNAUTHENTICATED). */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw new AppError(401, "UNAUTHENTICATED", "Please log in to continue");
  next();
}

/** Like requireAuth, and the email address must be verified (403 EMAIL_NOT_VERIFIED). */
export function requireVerified(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.auth?.user.emailVerifiedAt) {
      throw new AppError(403, "EMAIL_NOT_VERIFIED", "Please verify your email address first");
    }
    next();
  });
}

/**
 * For sensitive actions (delete account): the person must have re-entered
 * their password on this session in the last 5 minutes (403 REAUTH_REQUIRED).
 */
export function requireRecentAuth(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.auth || !hasRecentAuth(req.auth.session)) {
      throw new AppError(403, "REAUTH_REQUIRED", "Please confirm your password to continue");
    }
    next();
  });
}

/**
 * The signed-in user and session inside a route that used requireAuth.
 * Throws if called without it, which would be a programming mistake.
 */
export function currentAuth(req: Request): { user: User; session: Session } {
  if (!req.auth) throw new AppError(401, "UNAUTHENTICATED", "Please log in to continue");
  return req.auth;
}
