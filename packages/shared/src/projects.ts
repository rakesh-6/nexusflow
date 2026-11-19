import { z } from "zod";
import type { OrgRole, WorkspaceRole } from "./permissions.ts";
import { slugSchema } from "./organizations.ts";
import { STATUS_CATEGORIES, type StatusCategory } from "./taskStatuses.ts";

// Teams, projects, statuses, milestones and labels (PRD §11.4, §11.5, §12.3,
// §12.4), shared by the API and the web app.

export const TEAM_ROLES = ["LEAD", "MEMBER"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const PROJECT_ROLES = ["PROJECT_MANAGER", "CONTRIBUTOR", "VIEWER"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PROJECT_STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
/** Statuses a person can choose; ARCHIVED is reached only through "Archive". */
export const SETTABLE_PROJECT_STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"] as const;

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PROJECT_VISIBILITIES = ["WORKSPACE", "PRIVATE"] as const;
export type ProjectVisibility = (typeof PROJECT_VISIBILITIES)[number];

export const MAX_STATUSES_PER_PROJECT = 50;

// ---------------------------------------------------------------------------
// Who may do what in a project (PRD §12.4)
// ---------------------------------------------------------------------------

const RANK: Record<ProjectRole, number> = { VIEWER: 1, CONTRIBUTOR: 2, PROJECT_MANAGER: 3 };
const highest = (roles: (ProjectRole | null)[]) =>
  roles.reduce<ProjectRole | null>(
    (best, role) => (role && (!best || RANK[role] > RANK[best]) ? role : best),
    null,
  );

export interface ProjectAccessInput {
  orgRole: OrgRole;
  /** Your membership of the project's workspace, if any. */
  workspaceRole: WorkspaceRole | null;
  /** Your explicit ProjectMember role, if any. */
  explicitRole: ProjectRole | null;
  /** Your role in the project's team, if the project has one and you are in it. */
  teamRole: TeamRole | null;
  visibility: ProjectVisibility;
}

export interface ProjectAccess {
  role: ProjectRole;
  /** Edit details, dates and status; archive and restore; manage members. */
  canManage: boolean;
  /** Delete the project, and manage its statuses and milestones. Team leads cannot (PRD §12.3). */
  canAdminister: boolean;
  /** Create and edit tasks (Phase 5). */
  canContribute: boolean;
}

/** Your effective role in a project, or null when you cannot see it at all. */
export function resolveProjectRole(input: ProjectAccessInput): ProjectRole | null {
  const { orgRole, workspaceRole, explicitRole, teamRole, visibility } = input;
  if (orgRole === "OWNER" || orgRole === "ADMIN") return "PROJECT_MANAGER";
  // Guests only see projects shared with them, and never manage them.
  if (orgRole === "GUEST") return explicitRole === "PROJECT_MANAGER" ? "CONTRIBUTOR" : explicitRole;
  return highest([
    explicitRole,
    teamRole === "LEAD" ? "PROJECT_MANAGER" : teamRole ? "CONTRIBUTOR" : null,
    workspaceRole === "WORKSPACE_ADMIN" ? "PROJECT_MANAGER" : null,
    visibility === "WORKSPACE" && workspaceRole ? "VIEWER" : null,
  ]);
}

export function projectAccess(input: ProjectAccessInput): ProjectAccess | null {
  const role = resolveProjectRole(input);
  if (!role) return null;
  const isAdmin =
    input.orgRole === "OWNER" ||
    input.orgRole === "ADMIN" ||
    (input.orgRole === "MEMBER" && input.workspaceRole === "WORKSPACE_ADMIN");
  return {
    role,
    canManage: role === "PROJECT_MANAGER",
    canAdminister:
      isAdmin || (input.orgRole === "MEMBER" && input.explicitRole === "PROJECT_MANAGER"),
    canContribute: role !== "VIEWER",
  };
}

// ---------------------------------------------------------------------------
// Project keys
// ---------------------------------------------------------------------------

export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,6}$/, "Use 2 to 6 letters or digits, e.g. WEB");

/** "NexusFlow Web App" -> "NWA", "Marketing" -> "MAR". */
export function suggestProjectKey(name: string): string {
  const words = name
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const key = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "");
  return key.slice(0, words.length > 1 ? 6 : 3).padEnd(2, "X");
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a color like #4F46E5");
/** A calendar date without time, "2026-11-18" (PRD A-19). */
const dateOnly = z.iso.date({ message: "Use a date like 2026-11-18" });
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const createTeamSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters").max(60),
  slug: slugSchema,
  description: optionalText(500),
  leadId: z.uuid("Choose a team lead"),
});
export const updateTeamSchema = createTeamSchema.omit({ leadId: true }).partial();
export const deleteTeamSchema = z
  .object({ projectsAction: z.enum(["move", "archive"]).default("move") })
  .default({ projectsAction: "move" });
export const teamMemberSchema = z.object({
  userId: z.uuid(),
  role: z.enum(TEAM_ROLES).default("MEMBER"),
});
export const teamRoleSchema = z.object({ role: z.enum(TEAM_ROLES) });

export const labelSchema = z.object({
  name: z.string().trim().min(1, "Name the label").max(40),
  color: hexColor,
});
export const updateLabelSchema = labelSchema.partial();

const projectFields = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters").max(100),
  key: projectKeySchema,
  description: optionalText(5000),
  status: z.enum(SETTABLE_PROJECT_STATUSES).default("PLANNING"),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  visibility: z.enum(PROJECT_VISIBILITIES).default("WORKSPACE"),
  teamId: z.uuid().nullable().optional(),
  ownerId: z.uuid().optional(),
  startDate: dateOnly.nullable().optional(),
  endDate: dateOnly.nullable().optional(),
});

const endAfterStart = (value: { startDate?: string | null; endDate?: string | null }) =>
  !value.startDate || !value.endDate || value.endDate >= value.startDate;
const endAfterStartIssue = {
  message: "The end date must be on or after the start",
  path: ["endDate"],
};

export const createProjectSchema = projectFields.refine(endAfterStart, endAfterStartIssue);
export const updateProjectSchema = projectFields
  .partial()
  .extend({
    status: z.enum(SETTABLE_PROJECT_STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    visibility: z.enum(PROJECT_VISIBILITIES).optional(),
  })
  .refine(endAfterStart, endAfterStartIssue);

export const projectMemberSchema = z.object({
  userId: z.uuid(),
  role: z.enum(PROJECT_ROLES).default("CONTRIBUTOR"),
});
export const projectRoleSchema = z.object({ role: z.enum(PROJECT_ROLES) });

export const statusSchema = z.object({
  name: z.string().trim().min(1, "Name the column").max(40),
  color: hexColor,
  category: z.enum(STATUS_CATEGORIES),
});
export const updateStatusSchema = statusSchema
  .partial()
  .extend({ isDefault: z.literal(true).optional() });
export const reorderStatusesSchema = z.object({
  statusIds: z.array(z.uuid()).min(1).max(MAX_STATUSES_PER_PROJECT),
});
export const deleteStatusSchema = z.object({ targetStatusId: z.uuid("Choose where its tasks go") });

export const milestoneSchema = z.object({
  name: z.string().trim().min(1, "Name the milestone").max(100),
  description: optionalText(2000),
  dueDate: dateOnly.nullable().optional(),
});
export const updateMilestoneSchema = milestoneSchema
  .partial()
  .extend({ status: z.enum(["OPEN", "COMPLETED"]).optional() });

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// ---------------------------------------------------------------------------
// What the API answers
// ---------------------------------------------------------------------------

export interface PersonSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface TeamSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  workspaceId: string;
  memberCount: number;
  projectCount: number;
  leads: PersonSummary[];
  /** Your role in the team, if you are in it. */
  myRole: TeamRole | null;
  /** You may edit it and manage its members (workspace admins and leads). */
  canManage: boolean;
}

export interface TeamMemberSummary {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: TeamRole;
}

export interface ProjectSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: Priority;
  visibility: ProjectVisibility;
  workspaceId: string;
  team: { id: string; name: string; slug: string } | null;
  owner: PersonSummary;
  startDate: string | null;
  endDate: string | null;
  memberCount: number;
  taskCount: number;
  doneTaskCount: number;
  /** round(done / total × 100); 0 without tasks (PRD AC-PROJ-06). */
  progress: number;
  /** True once a task exists: the key can no longer change (PRD AC-PROJ-03). */
  keyLocked: boolean;
  createdAt: string;
  access: ProjectAccess;
}

export interface ProjectMemberSummary {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: ProjectRole;
  isOwner: boolean;
}

export interface TaskStatusSummary {
  id: string;
  name: string;
  color: string;
  category: StatusCategory;
  position: number;
  isDefault: boolean;
  taskCount: number;
}

export interface MilestoneSummary {
  id: string;
  name: string;
  description: string | null;
  dueDate: string | null;
  status: "OPEN" | "COMPLETED";
  position: number;
  taskCount: number;
  doneTaskCount: number;
  overdue: boolean;
}

export interface LabelSummary {
  id: string;
  name: string;
  color: string;
}

export interface TrashedProject {
  id: string;
  key: string;
  name: string;
  workspace: { id: string; name: string; slug: string };
  deletedAt: string;
  /** The last day it can be restored. */
  purgeAfter: string;
}
