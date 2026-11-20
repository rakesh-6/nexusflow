import {
  avatarConfirmSchema,
  avatarUploadSchema,
  changeRoleSchema,
  createOrganizationSchema,
  createWorkspaceSchema,
  deleteOrganizationSchema,
  deleteWorkspaceSchema,
  invitationSchema,
  ORG_PERMISSIONS,
  ORG_ROLES,
  PLAN_TIERS,
  transferOwnershipSchema,
  updateOrganizationSchema,
  updateProfileSchema,
  updateWorkspaceSchema,
  changePasswordSchema,
  emailOnlySchema,
  loginSchema,
  reauthenticateSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
  WORKSPACE_ROLES,
  workspaceMemberSchema,
  workspaceRoleSchema,
} from "@nexusflow/shared";
import path from "node:path";
import { z } from "zod";
import { cursorMeta, flag, FORBIDDEN, ok, okPage, type Endpoint } from "./helpers.ts";
import { ATTACHMENT_ENDPOINTS } from "./attachmentEndpoints.ts";
import { AUTOMATION_ENDPOINTS } from "./automationEndpoints.ts";
import { BILLING_ENDPOINTS } from "./billingEndpoints.ts";
import { COMMENT_ENDPOINTS } from "./commentEndpoints.ts";
import { NOTIFICATION_ENDPOINTS } from "./notificationEndpoints.ts";
import { PROJECT_ENDPOINTS } from "./projectEndpoints.ts";
import { INSIGHT_ENDPOINTS, TASK_ENDPOINTS } from "./taskEndpoints.ts";

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

const CurrentUser = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  avatarUrl: z.url().nullable(),
  timezone: z.string(),
  emailVerified: z.boolean(),
  hasPassword: z.boolean(),
  lastActiveWorkspaceId: z.uuid().nullable(),
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

const message = z.object({ message: z.string() });

// Phase 3: organizations, workspaces, members and invitations
const OrgRole = z.enum(ORG_ROLES);
const WorkspaceRole = z.enum(WORKSPACE_ROLES);

const WorkspaceSummary = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  isDefault: z.boolean(),
  archived: z.boolean(),
  role: WorkspaceRole,
});

const OrganizationSummary = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  logoUrl: z.url().nullable(),
  role: OrgRole,
  planTier: z.enum(PLAN_TIERS),
  workspaces: z.array(WorkspaceSummary),
});

const Usage = z.object({
  workspaces: z.number().int(),
  members: z.number().int(),
  guests: z.number().int(),
  pendingMembers: z.number().int(),
  pendingGuests: z.number().int(),
  storageBytes: z.number().int(),
});

const limit = z.number().int().nullable();
const OrganizationContext = z.object({
  organization: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    logoUrl: z.url().nullable(),
  }),
  role: OrgRole,
  permissions: z.array(z.enum(Object.keys(ORG_PERMISSIONS) as [string, ...string[]])),
  plan: z.object({
    tier: z.enum(PLAN_TIERS),
    limits: z.object({
      maxWorkspaces: limit,
      maxMembers: limit,
      maxGuests: limit,
      maxActiveProjectsPerWorkspace: limit,
      maxStorageBytes: limit,
      maxFileBytes: z.number().int(),
      analyticsHistoryDays: limit,
    }),
  }),
  usage: Usage,
  workspaces: z.array(WorkspaceSummary),
});

const Member = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.email(),
  avatarUrl: z.url().nullable(),
  role: OrgRole,
  status: z.string(),
  joinedAt: z.iso.datetime(),
});

const WorkspaceMember = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.email(),
  avatarUrl: z.url().nullable(),
  role: WorkspaceRole,
});

const InvitationSummary = z.object({
  id: z.uuid(),
  email: z.email(),
  role: OrgRole,
  workspaceId: z.uuid().nullable(),
  invitedBy: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  expired: z.boolean(),
});

const AuditLogEntry = z.object({
  id: z.uuid(),
  action: z.string(),
  actorName: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  changes: z.unknown(),
  metadata: z.unknown(),
  ip: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

const ActivityEntry = z.object({
  id: z.uuid(),
  action: z.string(),
  actorId: z.uuid().nullable(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  changes: z.unknown(),
  createdAt: z.iso.datetime(),
});

const NOT_MEMBER = "Not a member of this organization, or it does not exist (NOT_FOUND)";
// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

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

  // --- Phase 3: organizations and workspaces --------------------------------
  {
    method: "get",
    path: "/users/me/organizations",
    tag: "Users",
    summary: "Every organization you belong to, with the workspaces you can open",
    auth: true,
    responses: { "200": ["Your organizations", ok(z.array(OrganizationSummary))] },
  },
  {
    method: "put",
    path: "/users/me/last-workspace",
    tag: "Users",
    summary: "Remember the workspace you opened last (where “/” takes you)",
    auth: true,
    body: z.object({ workspaceId: z.uuid() }),
    responses: {
      "200": ["Saved", ok(flag("saved"))],
      "404": ["No such workspace you can open (NOT_FOUND)"],
    },
  },
  {
    method: "post",
    path: "/orgs",
    tag: "Organizations",
    summary: "Create an organization with a General workspace; you become its owner",
    auth: true,
    body: createOrganizationSchema,
    responses: {
      "201": [
        "Organization created",
        ok(z.object({ slug: z.string(), name: z.string(), workspaceSlug: z.string() })),
      ],
      "402": ["You already own 5 organizations (PLAN_LIMIT_REACHED)"],
      "409": ["The address is taken (SLUG_TAKEN)"],
    },
  },
  {
    method: "get",
    path: "/orgs/{orgSlug}/context",
    tag: "Organizations",
    summary: "Your role, permissions, plan, usage and workspaces in one organization",
    auth: true,
    responses: {
      "200": ["Organization context", ok(OrganizationContext)],
      "404": [NOT_MEMBER],
    },
  },
  {
    method: "patch",
    path: "/orgs/{orgSlug}",
    tag: "Organizations",
    summary: "Rename the organization or change its address (owner, admin)",
    auth: true,
    body: updateOrganizationSchema,
    responses: {
      "200": ["Updated", ok(z.object({ name: z.string(), slug: z.string() }))],
      "403": [FORBIDDEN],
      "409": ["The address is taken (SLUG_TAKEN)"],
    },
  },
  {
    method: "delete",
    path: "/orgs/{orgSlug}",
    tag: "Organizations",
    summary: "Delete the organization (owner; confirm your password first)",
    auth: true,
    body: deleteOrganizationSchema,
    responses: {
      "200": ["Deleted", ok(flag("deleted"))],
      "400": ["The typed address does not match (VALIDATION_ERROR)"],
      "403": ["Not the owner, or password not re-confirmed (FORBIDDEN, REAUTH_REQUIRED)"],
    },
  },
  {
    method: "post",
    path: "/orgs/{orgSlug}/transfer-ownership",
    tag: "Organizations",
    summary: "Make an admin the owner; you become an admin (confirm your password first)",
    auth: true,
    body: transferOwnershipSchema,
    responses: {
      "200": ["Transferred", ok(flag("transferred"))],
      "400": ["The new owner must be an admin (VALIDATION_ERROR)"],
      "403": ["Not the owner, or password not re-confirmed (FORBIDDEN, REAUTH_REQUIRED)"],
    },
  },
  {
    method: "post",
    path: "/orgs/{orgSlug}/leave",
    tag: "Organizations",
    summary: "Leave the organization",
    auth: true,
    responses: {
      "200": ["You left", ok(flag("left"))],
      "409": ["Owners must transfer ownership first (OWNER_CANNOT_LEAVE)"],
    },
  },
  {
    method: "get",
    path: "/orgs/{orgSlug}/usage",
    tag: "Organizations",
    summary: "What the organization uses against its plan limits (owner, admin)",
    auth: true,
    responses: { "200": ["Usage", ok(Usage)], "403": [FORBIDDEN] },
  },
  {
    method: "get",
    path: "/orgs/{orgSlug}/audit-logs",
    tag: "Organizations",
    summary: "Security and billing events, newest first (owner, admin; ?action&cursor&limit)",
    auth: true,
    responses: {
      "200": [
        "One page; meta.nextCursor fetches the next",
        okPage(z.array(AuditLogEntry), cursorMeta),
      ],
      "403": [FORBIDDEN],
    },
  },
  {
    method: "get",
    path: "/orgs/{orgSlug}/members",
    tag: "Members",
    summary: "Organization members (?q&role&page&pageSize; guests cannot list)",
    auth: true,
    responses: {
      "200": [
        "One page of members",
        okPage(
          z.array(Member),
          z.object({ total: z.number().int(), page: z.number(), pageSize: z.number() }),
        ),
      ],
      "403": [FORBIDDEN],
    },
  },
  {
    method: "patch",
    path: "/orgs/{orgSlug}/members/{userId}",
    tag: "Members",
    summary: "Change a member's role (owner: anyone; admin: members and guests)",
    auth: true,
    body: changeRoleSchema,
    responses: {
      "200": ["Role changed", ok(flag("updated"))],
      "402": ["Turning a guest into a member would exceed the plan (PLAN_LIMIT_REACHED)"],
      "403": [FORBIDDEN],
    },
  },
  {
    method: "delete",
    path: "/orgs/{orgSlug}/members/{userId}",
    tag: "Members",
    summary: "Remove someone; their access ends at once, their work stays",
    auth: true,
    responses: { "200": ["Removed", ok(flag("removed"))], "403": [FORBIDDEN] },
  },
  {
    method: "get",
    path: "/orgs/{orgSlug}/invitations",
    tag: "Invitations",
    summary: "Pending invitations (owner, admin)",
    auth: true,
    responses: { "200": ["Pending invitations", ok(z.array(InvitationSummary))] },
  },
  {
    method: "post",
    path: "/orgs/{orgSlug}/invitations",
    tag: "Invitations",
    summary: "Invite up to 20 people by email (owner, admin)",
    auth: true,
    body: invitationSchema,
    responses: {
      "201": [
        "Invitations sent",
        ok(
          z.object({
            invited: z.array(z.email()),
            skipped: z.array(z.object({ email: z.email(), reason: z.string() })),
          }),
        ),
      ],
      "402": ["Pending invitations would exceed the plan (PLAN_LIMIT_REACHED)"],
    },
  },
  {
    method: "post",
    path: "/orgs/{orgSlug}/invitations/{invitationId}/resend",
    tag: "Invitations",
    summary: "Send a fresh link; it works for another 7 days",
    auth: true,
    responses: { "200": ["Sent", ok(flag("sent"))], "404": ["No such pending invitation"] },
  },
  {
    method: "delete",
    path: "/orgs/{orgSlug}/invitations/{invitationId}",
    tag: "Invitations",
    summary: "Withdraw an invitation",
    auth: true,
    responses: { "200": ["Withdrawn", ok(flag("revoked"))], "404": ["No such pending invitation"] },
  },
  {
    method: "get",
    path: "/invitations/{token}",
    tag: "Invitations",
    summary: "Preview an invitation (no sign-in needed)",
    responses: {
      "200": [
        "Who invited you, to what",
        ok(
          z.object({
            organization: z.object({ name: z.string(), logoUrl: z.url().nullable() }),
            invitedBy: z.string(),
            role: OrgRole,
            email: z.email(),
          }),
        ),
      ],
      "404": ["Used, withdrawn or unknown (NOT_FOUND)"],
      "410": ["Expired (INVITATION_EXPIRED)"],
    },
  },
  {
    method: "post",
    path: "/invitations/{token}/accept",
    tag: "Invitations",
    summary: "Join the organization (signed in with the invited email)",
    auth: true,
    responses: {
      "200": [
        "Joined; where to go next",
        ok(z.object({ orgSlug: z.string(), workspaceSlug: z.string().nullable() })),
      ],
      "402": ["The organization's plan is full (PLAN_LIMIT_REACHED)"],
      "403": ["Signed in with a different email (INVITATION_EMAIL_MISMATCH)"],
    },
  },
  {
    method: "post",
    path: "/invitations/{token}/decline",
    tag: "Invitations",
    summary: "Decline an invitation",
    auth: true,
    responses: { "200": ["Declined", ok(flag("declined"))] },
  },
  {
    method: "get",
    path: "/orgs/{orgSlug}/workspaces",
    tag: "Workspaces",
    summary: "Workspaces you can open (owners and admins also see archived ones)",
    auth: true,
    responses: { "200": ["Workspaces", ok(z.array(WorkspaceSummary))] },
  },
  {
    method: "post",
    path: "/orgs/{orgSlug}/workspaces",
    tag: "Workspaces",
    summary: "Create a workspace (owner, admin)",
    auth: true,
    body: createWorkspaceSchema,
    responses: {
      "201": ["Workspace created", ok(WorkspaceSummary)],
      "402": ["The plan's workspace limit is reached (PLAN_LIMIT_REACHED)"],
      "409": ["The address is taken (SLUG_TAKEN)"],
    },
  },
  {
    method: "get",
    path: "/orgs/{orgSlug}/workspaces/{workspaceSlug}",
    tag: "Workspaces",
    summary: "One workspace",
    auth: true,
    responses: { "200": ["Workspace", ok(WorkspaceSummary)], "404": ["Not found"] },
  },
  {
    method: "patch",
    path: "/orgs/{orgSlug}/workspaces/{workspaceSlug}",
    tag: "Workspaces",
    summary: "Rename a workspace or change its address (workspace admins)",
    auth: true,
    body: updateWorkspaceSchema,
    responses: { "200": ["Updated", ok(WorkspaceSummary)], "403": [FORBIDDEN] },
  },
  {
    method: "post",
    path: "/orgs/{orgSlug}/workspaces/{workspaceSlug}/archive",
    tag: "Workspaces",
    summary: "Archive a workspace (owner, admin)",
    auth: true,
    responses: {
      "200": ["Archived", ok(WorkspaceSummary)],
      "409": ["It is the last active workspace (LAST_WORKSPACE)"],
    },
  },
  {
    method: "post",
    path: "/orgs/{orgSlug}/workspaces/{workspaceSlug}/restore",
    tag: "Workspaces",
    summary: "Bring an archived workspace back (owner, admin)",
    auth: true,
    responses: {
      "200": ["Restored", ok(WorkspaceSummary)],
      "402": ["The plan's workspace limit is reached (PLAN_LIMIT_REACHED)"],
    },
  },
  {
    method: "delete",
    path: "/orgs/{orgSlug}/workspaces/{workspaceSlug}",
    tag: "Workspaces",
    summary: "Delete a workspace (owner, admin); the body is optional",
    auth: true,
    body: deleteWorkspaceSchema,
    optionalBody: true,
    responses: {
      "200": ["Deleted", ok(flag("deleted"))],
      "409": [
        "Last workspace, or it has projects and deleteContents is false (LAST_WORKSPACE, WORKSPACE_NOT_EMPTY)",
      ],
    },
  },
  {
    method: "get",
    path: "/orgs/{orgSlug}/workspaces/{workspaceSlug}/members",
    tag: "Workspaces",
    summary: "Workspace members",
    auth: true,
    responses: { "200": ["Members", ok(z.array(WorkspaceMember))] },
  },
  {
    method: "post",
    path: "/orgs/{orgSlug}/workspaces/{workspaceSlug}/members",
    tag: "Workspaces",
    summary: "Add an organization member to the workspace (workspace admins; not guests)",
    auth: true,
    body: workspaceMemberSchema,
    responses: { "201": ["Added", ok(flag("added"))], "403": [FORBIDDEN] },
  },
  {
    method: "patch",
    path: "/orgs/{orgSlug}/workspaces/{workspaceSlug}/members/{userId}",
    tag: "Workspaces",
    summary: "Change someone's workspace role (workspace admins)",
    auth: true,
    body: workspaceRoleSchema,
    responses: { "200": ["Updated", ok(flag("updated"))], "403": [FORBIDDEN] },
  },
  {
    method: "delete",
    path: "/orgs/{orgSlug}/workspaces/{workspaceSlug}/members/{userId}",
    tag: "Workspaces",
    summary: "Take someone out of the workspace (workspace admins)",
    auth: true,
    responses: { "200": ["Removed", ok(flag("removed"))], "403": [FORBIDDEN] },
  },
  {
    method: "get",
    path: "/orgs/{orgSlug}/workspaces/{workspaceSlug}/activity",
    tag: "Workspaces",
    summary: "The workspace's history, newest first (?cursor&limit)",
    auth: true,
    responses: {
      "200": [
        "One page; meta.nextCursor fetches the next",
        okPage(z.array(ActivityEntry), cursorMeta),
      ],
    },
  },

  // Phase 4: teams, projects, columns, milestones and labels
  ...PROJECT_ENDPOINTS,

  // Phase 5: tasks, board, links, bulk changes, My Tasks
  ...TASK_ENDPOINTS,

  // Phase 6: comments, mentions and reactions
  ...COMMENT_ENDPOINTS,

  // Phase 7: notifications and their settings, file attachments
  ...NOTIFICATION_ENDPOINTS,
  ...ATTACHMENT_ENDPOINTS,
  ...BILLING_ENDPOINTS,
  ...AUTOMATION_ENDPOINTS,

  // Phase 8: dashboard numbers, search, workspace-wide task filter
  ...INSIGHT_ENDPOINTS,
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
            required: !endpoint.optionalBody,
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
