import { z } from "zod";
import { emailSchema } from "./auth.ts";
import {
  INVITABLE_ROLES,
  ORG_ROLES,
  WORKSPACE_ROLES,
  type OrgPermission,
  type OrgRole,
  type WorkspaceRole,
} from "./permissions.ts";
import type { PlanLimits, PlanTier } from "./plans.ts";

// Validation rules for organizations, workspaces, members and invitations
// (PRD §11.2, §11.3, §17.7), shared by the API and the web app.

// Addresses the app itself uses; an organization cannot take them.
const RESERVED_SLUGS = new Set([
  "api",
  "app",
  "admin",
  "www",
  "auth",
  "login",
  "register",
  "verify-email",
  "forgot-password",
  "reset-password",
  "invite",
  "invitations",
  "onboarding",
  "pricing",
  "goodbye",
  "settings",
  "assets",
  "static",
  "help",
  "docs",
  "new",
  "org",
  "orgs",
  "me",
  "users",
  "home",
]);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Use at least 3 characters")
  .max(40, "Use at most 40 characters")
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use lowercase letters, numbers and dashes only")
  .refine((slug) => !RESERVED_SLUGS.has(slug), "This address is reserved");

/** "Acme Studio!" -> "acme-studio". Used to suggest an address from a name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

const nameSchema = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters")
  .max(60, "Use at most 60 characters");

export const createOrganizationSchema = z.object({ name: nameSchema, slug: slugSchema });
export const updateOrganizationSchema = createOrganizationSchema.partial();
export const deleteOrganizationSchema = z.object({ confirmSlug: z.string().min(1) });
export const transferOwnershipSchema = z.object({ userId: z.uuid() });

export const createWorkspaceSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  description: z.string().trim().max(500).optional(),
});
export const updateWorkspaceSchema = createWorkspaceSchema.partial();
// A DELETE request may have no body at all; that means "do not delete the projects inside".
export const deleteWorkspaceSchema = z
  .object({ deleteContents: z.boolean().default(false) })
  .default({ deleteContents: false });

export const changeRoleSchema = z.object({ role: z.enum(ORG_ROLES) });
export const workspaceMemberSchema = z.object({
  userId: z.uuid(),
  role: z.enum(WORKSPACE_ROLES).default("WORKSPACE_MEMBER"),
});
export const workspaceRoleSchema = z.object({ role: z.enum(WORKSPACE_ROLES) });

export const invitationSchema = z.object({
  invites: z
    .array(
      z.object({
        email: emailSchema,
        role: z.enum(INVITABLE_ROLES),
        workspaceId: z.uuid().optional(),
      }),
    )
    .min(1, "Add at least one email")
    .max(20, "Invite at most 20 people at once"),
});

/** The invite form: emails separated by commas, spaces or new lines. */
export const inviteFormSchema = z.object({
  emails: z
    .string()
    .transform((text) => text.split(/[\s,;]+/).filter(Boolean))
    .pipe(
      z
        .array(emailSchema)
        .min(1, "Add at least one email")
        .max(20, "Invite at most 20 people at once"),
    ),
  role: z.enum(INVITABLE_ROLES),
  workspaceId: z.string().optional(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type InvitationInput = z.infer<typeof invitationSchema>;

// ---------------------------------------------------------------------------
// What the API answers (documented in apps/api/openapi.json)
// ---------------------------------------------------------------------------

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  archived: boolean;
  role: WorkspaceRole;
}

/** GET /users/me/organizations: one entry per organization you belong to. */
export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  role: OrgRole;
  planTier: PlanTier;
  workspaces: WorkspaceSummary[];
}

export interface OrganizationUsage {
  workspaces: number;
  members: number;
  guests: number;
  pendingMembers: number;
  pendingGuests: number;
  storageBytes: number;
}

/** GET /orgs/:org/context: everything the app shell needs for one organization. */
export interface OrganizationContext {
  organization: { id: string; name: string; slug: string; logoUrl: string | null };
  role: OrgRole;
  permissions: OrgPermission[];
  plan: { tier: PlanTier; limits: PlanLimits };
  usage: OrganizationUsage;
  workspaces: WorkspaceSummary[];
}

export interface OrgMember {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: OrgRole;
  status: string;
  joinedAt: string;
}

export interface WorkspaceMember {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: WorkspaceRole;
}

export interface InvitationSummary {
  id: string;
  email: string;
  role: OrgRole;
  workspaceId: string | null;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

/** GET /invitations/:token: what the invitation page shows before signing in. */
export interface InvitationPreview {
  organization: { name: string; logoUrl: string | null };
  invitedBy: string;
  role: OrgRole;
  email: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actorName: string;
  entityType: string;
  entityId: string | null;
  changes: unknown;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
}
