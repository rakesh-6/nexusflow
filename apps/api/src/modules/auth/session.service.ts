import type { CookieOptions, Request, Response } from "express";
import { env } from "../../config/env.ts";
import type { Session, User } from "../../generated/prisma/client.ts";
import { randomToken, sha256 } from "../../lib/crypto.ts";
import { prisma } from "../../lib/prisma.ts";

// Server-side sessions (PRD §19.1). The browser holds a random token in an
// HTTP-only cookie; the database holds only its SHA-256 fingerprint.

export const SESSION_COOKIE = "nf_session";

const DAY_MS = 86_400_000;
const SLIDING_LIFETIME_MS = 30 * DAY_MS; // stays signed in 30 days after last use...
const ABSOLUTE_LIFETIME_MS = 90 * DAY_MS; // ...but never longer than 90 days in total
const EXTEND_AFTER_MS = DAY_MS; // extend the 30 days at most once a day
const LAST_SEEN_EVERY_MS = 5 * 60_000; // record "last seen" at most every 5 minutes
const CACHE_MS = 30_000; // remember a looked-up session for 30 s to save database trips

const cookieOptions = (): CookieOptions => ({
  httpOnly: true, // page scripts cannot read it, so a script injection cannot steal it
  secure: env.NODE_ENV === "production", // https only on the real site
  sameSite: "lax", // not sent with requests started by other websites
  path: "/",
});

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SLIDING_LIFETIME_MS });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

/** Signs the user in on this browser: creates a session and sets the cookie. */
export async function startSession(req: Request, res: Response, userId: string): Promise<Session> {
  const token = randomToken();
  const now = Date.now();
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
      ip: req.ip ?? null,
      expiresAt: new Date(now + SLIDING_LIFETIME_MS),
      absoluteExpiresAt: new Date(now + ABSOLUTE_LIFETIME_MS),
    },
  });
  setSessionCookie(res, token);
  return session;
}

interface CachedSession {
  session: Session;
  user: User;
  cachedAt: number;
}

// token fingerprint -> session and user. One server process, so a plain Map works.
const cache = new Map<string, CachedSession>();

/** Drops cached sessions so the next request reads fresh data from the database. */
export function forgetCachedSessions(match: { userId?: string; sessionId?: string }) {
  for (const [key, entry] of cache) {
    if (entry.user.id === match.userId || entry.session.id === match.sessionId) cache.delete(key);
  }
}

export interface ActiveSession {
  session: Session;
  user: User;
  /** True when the expiry moved forward, so the cookie should be renewed too. */
  extended: boolean;
}

/** Finds the signed-in session for a cookie token, or null if it is unknown, ended or expired. */
export async function findActiveSession(token: string): Promise<ActiveSession | null> {
  const tokenHash = sha256(token);
  const now = Date.now();

  let entry = cache.get(tokenHash);
  if (!entry || now - entry.cachedAt > CACHE_MS) {
    const found = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!found) {
      cache.delete(tokenHash);
      return null;
    }
    const { user, ...session } = found;
    entry = { session, user, cachedAt: now };
    cache.set(tokenHash, entry);
  }

  const { session, user } = entry;
  const ended =
    session.revokedAt !== null ||
    session.expiresAt.getTime() <= now ||
    session.absoluteExpiresAt.getTime() <= now ||
    user.deletedAt !== null;
  if (ended) {
    cache.delete(tokenHash);
    return null;
  }

  // Keep active people signed in: push the expiry forward once a day, and note
  // when the session was last used (shown on the Security settings page).
  const extend = session.expiresAt.getTime() - now < SLIDING_LIFETIME_MS - EXTEND_AFTER_MS;
  const touch = now - session.lastSeenAt.getTime() > LAST_SEEN_EVERY_MS;
  if (extend || touch) {
    entry.session = await prisma.session.update({
      where: { id: session.id },
      data: {
        lastSeenAt: new Date(now),
        expiresAt: extend
          ? new Date(Math.min(now + SLIDING_LIFETIME_MS, session.absoluteExpiresAt.getTime()))
          : session.expiresAt,
      },
    });
  }
  return { session: entry.session, user, extended: extend };
}

/** Ends one session (log out on this device). */
export async function revokeSession(sessionId: string) {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  forgetCachedSessions({ sessionId });
}

/** Ends every session of a user, optionally keeping the current one. */
export async function revokeAllSessions(userId: string, keepSessionId?: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
  forgetCachedSessions({ userId });
}
