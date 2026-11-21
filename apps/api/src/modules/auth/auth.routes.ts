import { assertNotDemo, startDemo } from "../../demo/demo.service.ts";
import { env } from "../../config/env.ts";
import {
  changePasswordSchema,
  emailOnlySchema,
  loginSchema,
  reauthenticateSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
} from "@nexusflow/shared";
import { Router } from "express";
import { z } from "zod";
import { currentAuth, requireAuth } from "../../middleware/auth.ts";
import { authLimiter } from "../../middleware/rateLimit.ts";
import { prisma } from "../../lib/prisma.ts";
import { logSecurityEvent } from "../../lib/securityLog.ts";
import { AppError } from "../../utils/errors.ts";
import { sendSuccess } from "../../utils/response.ts";
import { validateRequest } from "../../utils/validateRequest.ts";
import {
  changePassword,
  listSessions,
  login,
  reauthenticate,
  register,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  toCurrentUser,
  verifyEmail,
} from "./auth.service.ts";
import { cloudinaryConfigured } from "../../lib/storage/cloudinary.ts";
import { finishGoogleSignIn, googleConfigured, startGoogleSignIn } from "./google.ts";
import { clearSessionCookie, revokeAllSessions, revokeSession } from "./session.service.ts";

/** Only addresses inside this app ("/acme/..."), never other websites (open redirect). */
function safeReturnTo(value: string): string {
  return value.startsWith("/") && !/^\/[/\\]/.test(value) ? value : "/";
}

// /api/v1/auth/... (PRD §18.5). authLimiter allows 10 requests a minute per
// visitor on the routes people could use to guess passwords or send spam.
export const authRouter = Router();

const REGISTER_TAKEN_MESSAGE =
  "If this email is new, your account is ready. If it already has an account, we sent its owner an email.";

authRouter.post("/register", authLimiter, async (req, res) => {
  const { body } = validateRequest(req, { body: registerSchema });
  const result = await register(body, req, res);
  if (result.created) {
    sendSuccess(res, { user: toCurrentUser(result.user) }, 201);
  } else {
    sendSuccess(res, { user: null, message: REGISTER_TAKEN_MESSAGE });
  }
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const { body } = validateRequest(req, { body: loginSchema });
  const user = await login(body, req, res);
  sendSuccess(res, { user: toCurrentUser(user) });
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  const { user, session } = currentAuth(req);
  await revokeSession(session.id);
  clearSessionCookie(res);
  await logSecurityEvent("auth.logout", { userId: user.id, req });
  sendSuccess(res, { loggedOut: true });
});

authRouter.post("/logout-all", requireAuth, async (req, res) => {
  const { user } = currentAuth(req);
  await revokeAllSessions(user.id);
  clearSessionCookie(res);
  await logSecurityEvent("auth.logout_all", { userId: user.id, req });
  sendSuccess(res, { loggedOut: true });
});

authRouter.post("/verify-email", authLimiter, async (req, res) => {
  const { body } = validateRequest(req, { body: tokenSchema });
  const user = await verifyEmail(body.token);
  sendSuccess(res, { user: toCurrentUser(user) });
});

authRouter.post("/resend-verification", requireAuth, async (req, res) => {
  await resendVerification(currentAuth(req).user);
  sendSuccess(res, { sent: true });
});

authRouter.post("/forgot-password", authLimiter, async (req, res) => {
  const { body } = validateRequest(req, { body: emailOnlySchema });
  await requestPasswordReset(body.email, req);
  sendSuccess(res, {
    message: "If an account uses this email, we sent it a link to reset the password.",
  });
});

authRouter.post("/reset-password", authLimiter, async (req, res) => {
  const { body } = validateRequest(req, { body: resetPasswordSchema });
  await resetPassword(body.token, body.password, req);
  clearSessionCookie(res);
  sendSuccess(res, { reset: true });
});

authRouter.post("/reauthenticate", requireAuth, authLimiter, async (req, res) => {
  const { body } = validateRequest(req, { body: reauthenticateSchema });
  const { user, session } = currentAuth(req);
  await reauthenticate(user, session, body.password, req);
  sendSuccess(res, { confirmed: true });
});

authRouter.post("/change-password", requireAuth, authLimiter, async (req, res) => {
  assertNotDemo(currentAuth(req).user, "Changing the password");
  const { body } = validateRequest(req, { body: changePasswordSchema });
  const { user, session } = currentAuth(req);
  await changePassword(user, session, body, req);
  sendSuccess(res, { changed: true });
});

// Which sign-in methods are switched on, so the web app shows only working buttons.
authRouter.get("/providers", (_req, res) => {
  sendSuccess(res, {
    google: googleConfigured,
    photoUpload: cloudinaryConfigured,
    demo: env.DEMO_MODE,
  });
});

/** "Try the demo" (PRD §26.8): signs in a fresh visitor to the sample organization. */
authRouter.post("/demo", authLimiter, async (req, res) => {
  sendSuccess(res, await startDemo(req, res), 201);
});

authRouter.get("/google", authLimiter, async (req, res) => {
  if (!googleConfigured) throw new AppError(404, "NOT_FOUND", "Google sign-in is not set up");
  const returnTo = typeof req.query["returnTo"] === "string" ? req.query["returnTo"] : "/";
  await startGoogleSignIn(res, safeReturnTo(returnTo));
});

authRouter.get("/google/callback", authLimiter, async (req, res) => {
  if (!googleConfigured) throw new AppError(404, "NOT_FOUND", "Google sign-in is not set up");
  // Errors become a message on the login page instead of a JSON reply, because
  // this address is opened by the browser, not by the app's code.
  try {
    if (typeof req.query["error"] === "string") {
      throw new AppError(400, "OAUTH_CANCELLED", "Google sign-in was cancelled.");
    }
    res.redirect(await finishGoogleSignIn(req, res));
  } catch (error) {
    const message =
      error instanceof AppError ? error.message : "Google sign-in failed. Please try again.";
    if (!(error instanceof AppError)) req.log.warn({ err: error }, "Google sign-in failed");
    res.redirect(`/login?error=${encodeURIComponent(message)}`);
  }
});

authRouter.get("/sessions", requireAuth, async (req, res) => {
  const { user, session } = currentAuth(req);
  sendSuccess(res, await listSessions(user.id, session.id));
});

authRouter.delete("/sessions/:sessionId", requireAuth, async (req, res) => {
  const { params } = validateRequest(req, { params: z.object({ sessionId: z.uuid() }) });
  const { user, session } = currentAuth(req);
  // Only your own sessions; someone else's id looks exactly like a missing one.
  const target = await prisma.session.findFirst({
    where: { id: params.sessionId, userId: user.id, revokedAt: null },
  });
  if (!target) throw new AppError(404, "NOT_FOUND", "Session not found");
  await revokeSession(target.id);
  if (target.id === session.id) clearSessionCookie(res);
  await logSecurityEvent("auth.session_revoked", { userId: user.id, req });
  sendSuccess(res, { revoked: true });
});
