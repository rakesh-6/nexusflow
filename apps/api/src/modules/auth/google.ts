import type { Request, Response } from "express";
import * as oidc from "openid-client";
import { env } from "../../config/env.ts";
import type { User } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { logSecurityEvent } from "../../lib/securityLog.ts";
import { AppError } from "../../utils/errors.ts";
import { startSession } from "./session.service.ts";

// "Continue with Google" (PRD §11.1.5, §19.4), using the Authorization Code
// flow with PKCE:
//   1. /auth/google sends the browser to Google with random state, nonce and
//      PKCE values, remembered in a short-lived cookie.
//   2. Google sends the browser back to /auth/google/callback with a code.
//   3. The server swaps the code for Google's signed identity token, checks it,
//      and signs the person in.

export const googleConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

const OAUTH_COOKIE = "nf_oauth";
const COOKIE_PATH = "/api/v1/auth/google";
const callbackUrl = () => new URL("/api/v1/auth/google/callback", env.APP_URL).toString();

// Google's settings are downloaded once and reused.
let configuration: Promise<oidc.Configuration> | undefined;
function googleConfig() {
  configuration ??= oidc
    .discovery(
      new URL("https://accounts.google.com"),
      env.GOOGLE_CLIENT_ID ?? "",
      env.GOOGLE_CLIENT_SECRET ?? "",
    )
    .catch((error: unknown) => {
      configuration = undefined; // try again next time
      throw error;
    });
  return configuration;
}

interface PendingSignIn {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

/** Step 1: redirect to Google's sign-in page. */
export async function startGoogleSignIn(res: Response, returnTo: string) {
  const config = await googleConfig();
  const pending: PendingSignIn = {
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
    codeVerifier: oidc.randomPKCECodeVerifier(),
    returnTo,
  };
  res.cookie(OAUTH_COOKIE, Buffer.from(JSON.stringify(pending)).toString("base64url"), {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax", // still sent when Google redirects back (a normal page visit)
    path: COOKIE_PATH,
    maxAge: 10 * 60_000,
  });
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl(),
    scope: "openid email profile",
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(pending.codeVerifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  res.redirect(url.toString());
}

function readPending(req: Request, res: Response): PendingSignIn {
  const raw: unknown = req.cookies?.[OAUTH_COOKIE];
  res.clearCookie(OAUTH_COOKIE, { path: COOKIE_PATH });
  if (typeof raw !== "string")
    throw new AppError(400, "OAUTH_STATE_MISSING", "Sign-in took too long. Please try again.");
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString()) as PendingSignIn;
  } catch {
    throw new AppError(400, "OAUTH_STATE_MISSING", "Sign-in took too long. Please try again.");
  }
}

/** Step 3: check Google's answer, find or create the account, and sign in. Returns where to go next. */
export async function finishGoogleSignIn(req: Request, res: Response): Promise<string> {
  const pending = readPending(req, res);
  const config = await googleConfig();

  // Rebuild the address Google sent the browser to, including its code and state.
  const currentUrl = new URL(callbackUrl());
  currentUrl.search = new URL(req.originalUrl, "http://placeholder").search;

  const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: pending.codeVerifier,
    expectedState: pending.state,
    expectedNonce: pending.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  const email = typeof claims?.["email"] === "string" ? claims["email"].toLowerCase() : null;
  if (!claims || !email || claims["email_verified"] !== true) {
    throw new AppError(
      400,
      "OAUTH_EMAIL_UNVERIFIED",
      "Your Google account's email is not verified.",
    );
  }

  const user = await findOrCreateGoogleUser(
    {
      sub: claims.sub,
      email,
      name:
        typeof claims["name"] === "string" ? claims["name"] : (email.split("@")[0] ?? "New user"),
      picture: typeof claims["picture"] === "string" ? claims["picture"] : null,
    },
    req,
  );

  await startSession(req, res, user.id);
  await logSecurityEvent("auth.login", { userId: user.id, req, metadata: { method: "google" } });
  return pending.returnTo;
}

async function findOrCreateGoogleUser(
  profile: { sub: string; email: string; name: string; picture: string | null },
  req: Request,
): Promise<User> {
  // 1. This Google account was linked before.
  const linked = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: profile.sub } },
    include: { user: true },
  });
  if (linked && !linked.user.deletedAt) return linked.user;

  // 2. An account with the same email exists. Google has verified the address,
  //    so it is safe to link (PRD §19.4). One Google account per user.
  const existing = await prisma.user.findUnique({
    where: { email: profile.email },
    include: { oauthAccounts: { where: { provider: "google" } } },
  });
  if (existing && !existing.deletedAt) {
    if (existing.oauthAccounts.length > 0) {
      throw new AppError(
        409,
        "OAUTH_ACCOUNT_CONFLICT",
        "This email is already linked to a different Google account.",
      );
    }
    await prisma.oAuthAccount.create({
      data: {
        userId: existing.id,
        provider: "google",
        providerAccountId: profile.sub,
        email: profile.email,
      },
    });
    await logSecurityEvent("auth.oauth_linked", { userId: existing.id, req });
    return existing.emailVerifiedAt
      ? existing
      : prisma.user.update({ where: { id: existing.id }, data: { emailVerifiedAt: new Date() } });
  }

  // 3. A new person: create a verified account without a password.
  const user = await prisma.user.create({
    data: {
      email: profile.email,
      name: profile.name.slice(0, 80),
      avatarUrl: profile.picture,
      emailVerifiedAt: new Date(),
      oauthAccounts: {
        create: { provider: "google", providerAccountId: profile.sub, email: profile.email },
      },
    },
  });
  await logSecurityEvent("auth.register", { userId: user.id, req, metadata: { method: "google" } });
  return user;
}
