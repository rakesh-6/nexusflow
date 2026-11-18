import type {
  ChangePasswordInput,
  CurrentUser,
  LoginInput,
  RegisterInput,
} from "@nexusflow/shared";
import type { Request, Response } from "express";
import { env } from "../../config/env.ts";
import type { Session, User } from "../../generated/prisma/client.ts";
import { sendEmail } from "../../lib/mail/index.ts";
import {
  accountExistsMessage,
  passwordChangedMessage,
  passwordResetMessage,
  verifyEmailMessage,
} from "../../lib/mail/templates.ts";
import { prisma } from "../../lib/prisma.ts";
import { logSecurityEvent } from "../../lib/securityLog.ts";
import { AppError } from "../../utils/errors.ts";
import { hashNeedsUpgrade, hashPassword, verifyPassword } from "./password.ts";
import { forgetCachedSessions, revokeAllSessions, startSession } from "./session.service.ts";
import {
  consumeVerificationToken,
  countRecentTokens,
  createVerificationToken,
} from "./verificationTokens.ts";

const MINUTE_MS = 60_000;
const LOCKOUT_FAILURES = 5;
const LOCKOUT_WINDOW_MS = 15 * MINUTE_MS;
const REAUTH_WINDOW_MS = 5 * MINUTE_MS;

const appLink = (path: string) => new URL(path, env.APP_URL).toString();

/** The user as the API returns it. Never includes the password hash. */
export function toCurrentUser(user: User): CurrentUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    timezone: user.timezone,
    emailVerified: user.emailVerifiedAt !== null,
    hasPassword: user.passwordHash !== null,
    createdAt: user.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Registration and email verification (PRD §11.1.1, §11.1.2)
// ---------------------------------------------------------------------------

export async function sendVerificationEmail(user: Pick<User, "id" | "name" | "email">) {
  const token = await createVerificationToken(user.id, "EMAIL_VERIFY");
  const link = appLink(`/verify-email?token=${encodeURIComponent(token)}`);
  await sendEmail({ to: user.email, ...verifyEmailMessage({ name: user.name, link }) });
}

export type RegisterResult = { created: true; user: User } | { created: false };

export async function register(
  input: RegisterInput,
  req: Request,
  res: Response,
): Promise<RegisterResult> {
  // Hash first, so a taken email takes as long as a new one (no timing hints).
  const passwordHash = await hashPassword(input.password);

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    // Tell the real owner, not the person filling in the form (PRD §11.1.1).
    await sendEmail({
      to: existing.email,
      ...accountExistsMessage({
        name: existing.name,
        loginLink: appLink("/login"),
        resetLink: appLink("/forgot-password"),
      }),
    });
    return { created: false };
  }

  let user: User;
  try {
    user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash },
    });
  } catch (error) {
    // Two sign-ups with the same email at the same moment: treat the second as "taken".
    if ((error as { code?: string }).code === "P2002") return { created: false };
    throw error;
  }

  await startSession(req, res, user.id);
  await sendVerificationEmail(user);
  await logSecurityEvent("auth.register", { userId: user.id, req });
  return { created: true, user };
}

export async function verifyEmail(token: string) {
  const { userId } = await consumeVerificationToken(token, "EMAIL_VERIFY");
  const user = await prisma.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
  });
  forgetCachedSessions({ userId });
  await logSecurityEvent("auth.email_verified", { userId });
  return user;
}

/** Sends a fresh verification link: at most one a minute and five a day. */
export async function resendVerification(user: User) {
  if (user.emailVerifiedAt) {
    throw new AppError(409, "ALREADY_VERIFIED", "Your email address is already verified");
  }
  if ((await countRecentTokens(user.id, "EMAIL_VERIFY", MINUTE_MS)) > 0) {
    throw new AppError(
      429,
      "TOO_MANY_ATTEMPTS",
      "Please wait a minute before asking for another email",
    );
  }
  if ((await countRecentTokens(user.id, "EMAIL_VERIFY", 24 * 60 * MINUTE_MS)) >= 5) {
    throw new AppError(
      429,
      "TOO_MANY_ATTEMPTS",
      "Too many emails today. Please try again tomorrow",
    );
  }
  await sendVerificationEmail(user);
}

// ---------------------------------------------------------------------------
// Login with lockout (PRD §11.1.3)
// ---------------------------------------------------------------------------

/** True after 5 failed logins in 15 minutes since the last successful login or reset. */
async function isLockedOut(userId: string) {
  const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MS);
  const lastSuccess = await prisma.activityLog.findFirst({
    where: {
      actorId: userId,
      action: { in: ["auth.login", "auth.password_reset"] },
      createdAt: { gte: windowStart },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const failures = await prisma.activityLog.count({
    where: {
      actorId: userId,
      action: "auth.login_failed",
      createdAt: { gte: lastSuccess?.createdAt ?? windowStart },
    },
  });
  return failures >= LOCKOUT_FAILURES;
}

export async function login(input: LoginInput, req: Request, res: Response): Promise<User> {
  const found = await prisma.user.findUnique({ where: { email: input.email } });
  const user = found && !found.deletedAt ? found : null;

  if (user && (await isLockedOut(user.id))) {
    throw new AppError(
      429,
      "TOO_MANY_ATTEMPTS",
      "Too many failed attempts. Please wait 15 minutes or reset your password.",
    );
  }

  const correct = await verifyPassword(user?.passwordHash ?? null, input.password);
  if (!user || !correct) {
    if (user) await logSecurityEvent("auth.login_failed", { userId: user.id, req });
    // The same message for "no such account" and "wrong password" (no hints).
    throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }

  if (user.passwordHash && hashNeedsUpgrade(user.passwordHash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password) },
    });
  }
  await startSession(req, res, user.id);
  await logSecurityEvent("auth.login", { userId: user.id, req });
  return user;
}

// ---------------------------------------------------------------------------
// Forgot, reset and change password (PRD §11.1.4)
// ---------------------------------------------------------------------------

/** Always "succeeds" from the caller's view, so it never reveals whether an account exists. */
export async function requestPasswordReset(email: string, req: Request) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) return;
  if ((await countRecentTokens(user.id, "PASSWORD_RESET", 24 * 60 * MINUTE_MS)) >= 5) return;

  const token = await createVerificationToken(user.id, "PASSWORD_RESET");
  const link = appLink(`/reset-password?token=${encodeURIComponent(token)}`);
  await sendEmail({ to: user.email, ...passwordResetMessage({ name: user.name, link }) });
  await logSecurityEvent("auth.password_reset_requested", { userId: user.id, req });
}

export async function resetPassword(token: string, newPassword: string, req: Request) {
  const { userId } = await consumeVerificationToken(token, "PASSWORD_RESET");
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(newPassword),
      // The reset link proved they own the inbox, so the email counts as verified.
      emailVerifiedAt: new Date(),
    },
  });
  await revokeAllSessions(userId);
  await sendEmail({ to: user.email, ...passwordChangedMessage({ name: user.name }) });
  await logSecurityEvent("auth.password_reset", { userId, req });
}

export async function changePassword(
  user: User,
  session: Session,
  input: ChangePasswordInput,
  req: Request,
) {
  if (!user.passwordHash) {
    throw new AppError(
      409,
      "NO_PASSWORD",
      "Your account signs in with Google. Use “Forgot password” to add a password.",
    );
  }
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Your current password is incorrect");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });
  // Stay signed in here, sign out everywhere else, and count this as a fresh login.
  await revokeAllSessions(user.id, session.id);
  await prisma.session.update({ where: { id: session.id }, data: { reauthAt: new Date() } });
  forgetCachedSessions({ userId: user.id });
  await sendEmail({ to: user.email, ...passwordChangedMessage({ name: user.name }) });
  await logSecurityEvent("auth.password_changed", { userId: user.id, req });
}

// ---------------------------------------------------------------------------
// Re-authentication before sensitive actions (PRD §19.1)
// ---------------------------------------------------------------------------

export async function reauthenticate(user: User, session: Session, password: string, req: Request) {
  if (!(await verifyPassword(user.passwordHash, password))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "That password is incorrect");
  }
  await prisma.session.update({ where: { id: session.id }, data: { reauthAt: new Date() } });
  forgetCachedSessions({ sessionId: session.id });
  await logSecurityEvent("auth.reauthenticated", { userId: user.id, req });
}

/** True when the person confirmed their password on this session in the last 5 minutes. */
export function hasRecentAuth(session: Session) {
  return session.reauthAt !== null && Date.now() - session.reauthAt.getTime() < REAUTH_WINDOW_MS;
}

// ---------------------------------------------------------------------------
// Active sessions (PRD §11.1.3)
// ---------------------------------------------------------------------------

export async function listSessions(userId: string, currentSessionId: string) {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
  });
  return sessions.map((session) => ({
    id: session.id,
    userAgent: session.userAgent,
    ip: session.ip,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    current: session.id === currentSessionId,
  }));
}
