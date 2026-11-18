import {
  avatarConfirmSchema,
  avatarUploadSchema,
  updateProfileSchema,
  changePasswordSchema,
  emailOnlySchema,
  loginSchema,
  reauthenticateSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
} from "@nexusflow/shared";
import path from "node:path";
import { z } from "zod";

// API documentation in the OpenAPI 3.1 format (PRD §18.8), built from Zod
// schemas with Zod's own z.toJSONSchema(). To document a new endpoint, add an
// entry to ENDPOINTS below and run `pnpm docs:openapi`. A test fails if the
// saved openapi.json and this code ever disagree.

export const OPENAPI_FILE = path.resolve(import.meta.dirname, "../../openapi.json");

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

const ErrorResponse = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    requestId: z.string(),
  }),
});

const ok = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });

const CurrentUser = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  avatarUrl: z.url().nullable(),
  timezone: z.string(),
  emailVerified: z.boolean(),
  hasPassword: z.boolean(),
  createdAt: z.iso.datetime(),
});

const SessionInfo = z.object({
  id: z.uuid(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  current: z.boolean(),
});

const HealthData = z.object({
  status: z.literal("ok"),
  app: z.string(),
  uptimeSeconds: z.number().int(),
  timestamp: z.iso.datetime(),
});

const ReadyData = z.object({
  status: z.literal("ready"),
  database: z.literal("ok"),
  latencyMs: z.number().int(),
});

const flag = (name: string) => z.object({ [name]: z.literal(true) });
const message = z.object({ message: z.string() });

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

interface Endpoint {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  tag: string;
  summary: string;
  /** Needs a signed-in session cookie. */
  auth?: boolean;
  body?: z.ZodType;
  /** Status code -> [description, response schema]. Errors use ErrorResponse. */
  responses: Record<string, [string, z.ZodType?]>;
}

const ENDPOINTS: Endpoint[] = [
  {
    method: "get",
    path: "/health",
    tag: "Health",
    summary: "Liveness check: answers while the server process is running",
    responses: { "200": ["The server is running", ok(HealthData)] },
  },
  {
    method: "get",
    path: "/health/ready",
    tag: "Health",
    summary: "Readiness check: also confirms the database answers",
    responses: {
      "200": ["The server and database are ready", ok(ReadyData)],
      "503": ["The database is not reachable (DATABASE_UNAVAILABLE)"],
    },
  },
  {
    method: "post",
    path: "/auth/register",
    tag: "Auth",
    summary: "Create an account, sign in and send a verification email",
    body: registerSchema,
    responses: {
      "201": ["Account created and signed in", ok(z.object({ user: CurrentUser }))],
      "200": [
        "The email already has an account; its owner was emailed (no details revealed)",
        ok(z.object({ user: z.null(), message: z.string() })),
      ],
      "400": ["Invalid name, email or password (VALIDATION_ERROR)"],
    },
  },
  {
    method: "post",
    path: "/auth/login",
    tag: "Auth",
    summary: "Sign in with email and password",
    body: loginSchema,
    responses: {
      "200": ["Signed in; sets the nf_session cookie", ok(z.object({ user: CurrentUser }))],
      "401": ["Email or password is incorrect (INVALID_CREDENTIALS)"],
      "429": ["Locked after 5 failed attempts in 15 minutes (TOO_MANY_ATTEMPTS)"],
    },
  },
  {
    method: "post",
    path: "/auth/logout",
    tag: "Auth",
    summary: "Sign out on this device",
    auth: true,
    responses: { "200": ["Signed out", ok(flag("loggedOut"))] },
  },
  {
    method: "post",
    path: "/auth/logout-all",
    tag: "Auth",
    summary: "Sign out on every device",
    auth: true,
    responses: { "200": ["Signed out everywhere", ok(flag("loggedOut"))] },
  },
  {
    method: "post",
    path: "/auth/verify-email",
    tag: "Auth",
    summary: "Confirm an email address with the token from the emailed link",
    body: tokenSchema,
    responses: {
      "200": ["Email verified", ok(z.object({ user: CurrentUser }))],
      "400": ["Link used, replaced or expired (TOKEN_INVALID, TOKEN_EXPIRED)"],
    },
  },
  {
    method: "post",
    path: "/auth/resend-verification",
    tag: "Auth",
    summary: "Send a new verification email (1 a minute, 5 a day)",
    auth: true,
    responses: {
      "200": ["Email sent", ok(flag("sent"))],
      "409": ["Already verified (ALREADY_VERIFIED)"],
      "429": ["Asked too often (TOO_MANY_ATTEMPTS)"],
    },
  },
  {
    method: "post",
    path: "/auth/forgot-password",
    tag: "Auth",
    summary: "Email a password reset link (same answer whether or not the account exists)",
    body: emailOnlySchema,
    responses: { "200": ["Request accepted", ok(message)] },
  },
  {
    method: "post",
    path: "/auth/reset-password",
    tag: "Auth",
    summary: "Set a new password with the emailed token; signs out every device",
    body: resetPasswordSchema,
    responses: {
      "200": ["Password changed", ok(flag("reset"))],
      "400": ["Invalid or expired link, or weak password"],
    },
  },
  {
    method: "post",
    path: "/auth/reauthenticate",
    tag: "Auth",
    summary: "Confirm your password before a sensitive action (valid 5 minutes)",
    auth: true,
    body: reauthenticateSchema,
    responses: {
      "200": ["Confirmed", ok(flag("confirmed"))],
      "401": ["Wrong password (INVALID_CREDENTIALS)"],
    },
  },
  {
    method: "post",
    path: "/auth/change-password",
    tag: "Auth",
    summary: "Change your password; signs out your other devices",
    auth: true,
    body: changePasswordSchema,
    responses: {
      "200": ["Password changed", ok(flag("changed"))],
      "401": ["Current password is wrong (INVALID_CREDENTIALS)"],
      "409": ["Account has no password yet (NO_PASSWORD)"],
    },
  },
  {
    method: "get",
    path: "/auth/sessions",
    tag: "Auth",
    summary: "List the devices where you are signed in",
    auth: true,
    responses: { "200": ["Active sessions, newest first", ok(z.array(SessionInfo))] },
  },
  {
    method: "delete",
    path: "/auth/sessions/{sessionId}",
    tag: "Auth",
    summary: "Sign out one device",
    auth: true,
    responses: {
      "200": ["Signed out that device", ok(flag("revoked"))],
      "404": ["No such session of yours (NOT_FOUND)"],
    },
  },
  {
    method: "get",
    path: "/users/me",
    tag: "Users",
    summary: "The signed-in person",
    auth: true,
    responses: {
      "200": ["Your profile", ok(CurrentUser)],
      "401": ["Not signed in (UNAUTHENTICATED)"],
    },
  },
  {
    method: "patch",
    path: "/users/me",
    tag: "Users",
    summary: "Update your name or time zone (send only what changed)",
    auth: true,
    body: updateProfileSchema,
    responses: {
      "200": ["Updated profile", ok(CurrentUser)],
      "400": ["Invalid name or unknown time zone (VALIDATION_ERROR)"],
    },
  },
  {
    method: "delete",
    path: "/users/me",
    tag: "Users",
    summary: "Delete your account (confirm your password with /auth/reauthenticate first)",
    auth: true,
    responses: {
      "200": ["Account deleted and signed out", ok(flag("deleted"))],
      "403": ["Password not confirmed in the last 5 minutes (REAUTH_REQUIRED)"],
      "409": ["You own an organization; transfer or delete it first (SOLE_OWNER)"],
    },
  },
  {
    method: "post",
    path: "/users/me/avatar/sign",
    tag: "Users",
    summary: "Get a one-time signed upload to send a profile photo straight to Cloudinary",
    auth: true,
    body: avatarUploadSchema,
    responses: {
      "200": [
        "Upload address and signed form fields",
        ok(z.object({ url: z.url(), fields: z.record(z.string(), z.string()) })),
      ],
      "503": ["Photo upload is not set up (STORAGE_NOT_CONFIGURED)"],
    },
  },
  {
    method: "post",
    path: "/users/me/avatar/confirm",
    tag: "Users",
    summary: "Check the uploaded photo with Cloudinary and make it your profile photo",
    auth: true,
    body: avatarConfirmSchema,
    responses: {
      "200": ["Updated profile", ok(CurrentUser)],
      "400": ["Not your upload or not a valid photo (UPLOAD_INVALID)"],
    },
  },
  {
    method: "delete",
    path: "/users/me/avatar",
    tag: "Users",
    summary: "Remove your profile photo",
    auth: true,
    responses: { "200": ["Updated profile", ok(CurrentUser)] },
  },
  {
    method: "get",
    path: "/auth/providers",
    tag: "Auth",
    summary: "Which optional features are set up on this server",
    responses: {
      "200": ["Feature switches", ok(z.object({ google: z.boolean(), photoUpload: z.boolean() }))],
    },
  },
  {
    method: "get",
    path: "/auth/google",
    tag: "Auth",
    summary: "Start “Continue with Google” (a browser redirect to Google)",
    responses: {
      "302": ["Redirect to Google's sign-in page", z.null()],
      "404": ["Google sign-in is not set up (NOT_FOUND)"],
    },
  },
  {
    method: "get",
    path: "/auth/google/callback",
    tag: "Auth",
    summary: "Where Google sends the browser back; signs in and redirects into the app",
    responses: {
      "302": ["Redirect into the app, or to /login?error=… if sign-in failed", z.null()],
    },
  },
];

// ---------------------------------------------------------------------------
// Building the document
// ---------------------------------------------------------------------------

/** Converts a Zod schema to JSON Schema, minus the "$schema" line OpenAPI does not want. */
function jsonSchema(schema: z.ZodType, io: "input" | "output") {
  const result: Record<string, unknown> = {
    ...z.toJSONSchema(schema, { io, unrepresentable: "any" }),
  };
  delete result["$schema"];
  return result;
}

function operation(endpoint: Endpoint) {
  const responses = Object.fromEntries(
    Object.entries(endpoint.responses).map(([status, [description, schema]]) => [
      status,
      {
        description,
        content: { "application/json": { schema: jsonSchema(schema ?? ErrorResponse, "output") } },
      },
    ]),
  );
  return {
    operationId: `${endpoint.method}${endpoint.path.replace(/[/{}-]+(\w)?/g, (_, c: string = "") => c.toUpperCase())}`,
    tags: [endpoint.tag],
    summary: endpoint.summary,
    ...(endpoint.auth ? { security: [{ sessionCookie: [] }] } : {}),
    ...(endpoint.body
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: jsonSchema(endpoint.body, "input") } },
          },
        }
      : {}),
    responses,
  };
}

export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of ENDPOINTS) {
    paths[endpoint.path] = { ...paths[endpoint.path], [endpoint.method]: operation(endpoint) };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "NexusFlow API",
      version: "1.0.0",
      description:
        "REST API for NexusFlow. Every response uses { success, data } or { success: false, error }. Requests that change data must send the header X-Requested-With: NexusFlow.",
    },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: {
        sessionCookie: { type: "apiKey", in: "cookie", name: "nf_session" },
      },
    },
    paths,
  };
}
