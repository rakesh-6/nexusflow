import {
  createProjectSchema,
  createTeamSchema,
  deleteStatusSchema,
  deleteTeamSchema,
  labelSchema,
  milestoneSchema,
  PRIORITIES,
  PROJECT_ROLES,
  PROJECT_STATUSES,
  PROJECT_VISIBILITIES,
  projectMemberSchema,
  projectRoleSchema,
  reorderStatusesSchema,
  STATUS_CATEGORIES,
  statusSchema,
  TEAM_ROLES,
  teamMemberSchema,
  teamRoleSchema,
  updateLabelSchema,
  updateMilestoneSchema,
  updateProjectSchema,
  updateStatusSchema,
  updateTeamSchema,
} from "@nexusflow/shared";
import { z } from "zod";
import { cursorMeta, flag, FORBIDDEN, ok, okPage, type Endpoint } from "./helpers.ts";

// API documentation for Phase 4: teams, projects, columns, milestones, labels.

const Person = z.object({ id: z.uuid(), name: z.string(), avatarUrl: z.url().nullable() });

const Team = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  workspaceId: z.uuid(),
  memberCount: z.number().int(),
  projectCount: z.number().int(),
  leads: z.array(Person),
  myRole: z.enum(TEAM_ROLES).nullable(),
  canManage: z.boolean(),
});

const member = <R extends z.ZodType>(role: R) =>
  z.object({
    userId: z.uuid(),
    name: z.string(),
    email: z.email(),
    avatarUrl: z.url().nullable(),
    role,
  });

const Project = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(PROJECT_STATUSES),
  priority: z.enum(PRIORITIES),
  visibility: z.enum(PROJECT_VISIBILITIES),
  workspaceId: z.uuid(),
  team: z.object({ id: z.uuid(), name: z.string(), slug: z.string() }).nullable(),
  owner: Person,
  startDate: z.iso.date().nullable(),
  endDate: z.iso.date().nullable(),
  memberCount: z.number().int(),
  taskCount: z.number().int(),
  doneTaskCount: z.number().int(),
  progress: z.number().int().min(0).max(100),
  keyLocked: z.boolean(),
  createdAt: z.iso.datetime(),
  access: z.object({
    role: z.enum(PROJECT_ROLES),
    canManage: z.boolean(),
    canAdminister: z.boolean(),
    canContribute: z.boolean(),
  }),
});

const Status = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string(),
  category: z.enum(STATUS_CATEGORIES),
  position: z.number().int(),
  isDefault: z.boolean(),
  taskCount: z.number().int(),
});

const Milestone = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  dueDate: z.iso.date().nullable(),
  status: z.enum(["OPEN", "COMPLETED"]),
  position: z.number().int(),
  taskCount: z.number().int(),
  doneTaskCount: z.number().int(),
  overdue: z.boolean(),
});

const Label = z.object({ id: z.uuid(), name: z.string(), color: z.string() });

const Activity = z.object({
  id: z.uuid(),
  action: z.string(),
  actorName: z.string(),
  changes: z.unknown(),
  metadata: z.unknown(),
  createdAt: z.iso.datetime(),
});

const NO_PROJECT = "No such project you can open (NOT_FOUND)";
const ARCHIVED = "The project is archived (PROJECT_ARCHIVED)";
const WS = "/orgs/{orgSlug}/workspaces/{workspaceSlug}";
const P = "/orgs/{orgSlug}/projects/{projectId}";
const T = "/orgs/{orgSlug}/teams/{teamId}";

const endpoint = (
  method: Endpoint["method"],
  path: string,
  tag: string,
  summary: string,
  responses: Endpoint["responses"],
  extra: Partial<Endpoint> = {},
): Endpoint => ({ method, path, tag, summary, auth: true, responses, ...extra });

export const PROJECT_ENDPOINTS: Endpoint[] = [
  // Teams
  endpoint(
    "get",
    `${WS}/teams`,
    "Teams",
    "Teams in a workspace (meta.canCreate: you may create one)",
    {
      "200": ["Teams", okPage(z.array(Team), z.object({ canCreate: z.boolean() }))],
    },
  ),
  endpoint(
    "post",
    `${WS}/teams`,
    "Teams",
    "Create a team with its lead (workspace admins)",
    {
      "201": ["Team created", ok(Team)],
      "403": [FORBIDDEN],
      "409": ["The address is taken (SLUG_TAKEN)"],
    },
    { body: createTeamSchema },
  ),
  endpoint("get", T, "Teams", "One team", { "200": ["Team", ok(Team)], "404": ["Not found"] }),
  endpoint(
    "patch",
    T,
    "Teams",
    "Rename a team or change its address (lead or workspace admin)",
    { "200": ["Updated", ok(Team)], "403": [FORBIDDEN] },
    { body: updateTeamSchema },
  ),
  endpoint(
    "delete",
    T,
    "Teams",
    "Delete a team; its projects move to the workspace or are archived (workspace admins)",
    { "200": ["Deleted", ok(flag("deleted"))], "403": [FORBIDDEN] },
    { body: deleteTeamSchema, optionalBody: true },
  ),
  endpoint("get", `${T}/members`, "Teams", "Team members", {
    "200": ["Members", ok(z.array(member(z.enum(TEAM_ROLES))))],
  }),
  endpoint(
    "post",
    `${T}/members`,
    "Teams",
    "Add a workspace member to the team (lead or workspace admin)",
    { "201": ["Added", ok(flag("added"))], "403": [FORBIDDEN] },
    { body: teamMemberSchema },
  ),
  endpoint(
    "patch",
    `${T}/members/{userId}`,
    "Teams",
    "Make someone lead or member",
    {
      "200": ["Updated", ok(flag("updated"))],
      "409": ["The team would have no lead (LAST_LEAD)"],
    },
    { body: teamRoleSchema },
  ),
  endpoint("delete", `${T}/members/{userId}`, "Teams", "Take someone out of the team", {
    "200": ["Removed", ok(flag("removed"))],
    "409": ["The team would have no lead (LAST_LEAD)"],
  }),

  // Projects
  endpoint(
    "get",
    `${WS}/projects`,
    "Projects",
    "Projects you can open (?status&teamId&q&includeArchived)",
    {
      "200": ["Projects with progress and your access", ok(z.array(Project))],
    },
  ),
  endpoint(
    "post",
    `${WS}/projects`,
    "Projects",
    "Create a project with six default columns; you become its manager",
    {
      "201": ["Project created", ok(Project)],
      "402": ["The plan's active-project limit is reached (PLAN_LIMIT_REACHED)"],
      "403": ["Guests, or a team project without being its lead (FORBIDDEN)"],
      "409": ["The key is taken (KEY_TAKEN)"],
    },
    { body: createProjectSchema },
  ),
  endpoint(
    "get",
    `${WS}/projects/by-key/{key}`,
    "Projects",
    "Find a project by its key, e.g. NEX",
    {
      "200": ["Project", ok(Project)],
      "404": [NO_PROJECT],
    },
  ),
  endpoint("get", P, "Projects", "One project", {
    "200": ["Project", ok(Project)],
    "404": [NO_PROJECT],
  }),
  endpoint(
    "patch",
    P,
    "Projects",
    "Edit details, dates, status, team, owner or key (project managers)",
    {
      "200": ["Updated", ok(Project)],
      "403": [FORBIDDEN],
      "409": [
        "Key locked after the first task, key taken, or archived (KEY_LOCKED, KEY_TAKEN, PROJECT_ARCHIVED)",
      ],
    },
    { body: updateProjectSchema },
  ),
  endpoint("delete", P, "Projects", "Move the project to the trash for 30 days", {
    "200": ["Deleted", ok(flag("deleted"))],
    "403": [FORBIDDEN],
  }),
  endpoint(
    "post",
    `${P}/archive`,
    "Projects",
    "Archive: read-only, does not count against the plan",
    {
      "200": ["Archived", ok(Project)],
    },
  ),
  endpoint(
    "post",
    `${P}/restore`,
    "Projects",
    "Bring an archived project back to its previous status",
    {
      "200": ["Restored", ok(Project)],
      "402": ["The plan's active-project limit is reached (PLAN_LIMIT_REACHED)"],
    },
  ),
  endpoint(
    "get",
    `${P}/activity`,
    "Projects",
    "The project's history, newest first (?cursor&limit)",
    {
      "200": ["One page", okPage(z.array(Activity), cursorMeta)],
    },
  ),
  endpoint(
    "get",
    "/orgs/{orgSlug}/trash",
    "Projects",
    "Projects deleted in the last 30 days (owner, admin)",
    {
      "200": [
        "Trash",
        ok(
          z.array(
            z.object({
              id: z.uuid(),
              key: z.string(),
              name: z.string(),
              workspace: z.object({ id: z.uuid(), name: z.string(), slug: z.string() }),
              deletedAt: z.iso.datetime(),
              purgeAfter: z.iso.datetime(),
            }),
          ),
        ),
      ],
      "403": [FORBIDDEN],
    },
  ),
  endpoint("post", `${P}/undelete`, "Projects", "Restore a project from the trash (owner, admin)", {
    "200": ["Restored", ok(Project)],
    "404": ["Not in the trash"],
  }),

  // Project members
  endpoint("get", `${P}/members`, "Projects", "Project members (isOwner marks the owner)", {
    "200": ["Members", ok(z.array(member(z.enum(PROJECT_ROLES)).extend({ isOwner: z.boolean() })))],
  }),
  endpoint(
    "post",
    `${P}/members`,
    "Projects",
    "Add a workspace member or a guest to the project (project managers)",
    { "201": ["Added", ok(flag("added"))], "403": [FORBIDDEN], "409": [ARCHIVED] },
    { body: projectMemberSchema },
  ),
  endpoint(
    "patch",
    `${P}/members/{userId}`,
    "Projects",
    "Change someone's project role",
    {
      "200": ["Updated", ok(flag("updated"))],
      "409": [
        "The owner must stay manager, or no manager would remain (OWNER_IS_MANAGER, LAST_MANAGER)",
      ],
    },
    { body: projectRoleSchema },
  ),
  endpoint("delete", `${P}/members/{userId}`, "Projects", "Take someone out of the project", {
    "200": ["Removed", ok(flag("removed"))],
    "409": ["The owner or the last manager (OWNER_IS_MANAGER, LAST_MANAGER)"],
  }),

  // Columns
  endpoint("get", `${P}/statuses`, "Columns", "The project's board columns, left to right", {
    "200": ["Columns with task counts", ok(z.array(Status))],
  }),
  endpoint(
    "post",
    `${P}/statuses`,
    "Columns",
    "Add a column (at most 50)",
    {
      "201": ["All columns", ok(z.array(Status))],
      "409": ["Name taken or too many (STATUS_NAME_TAKEN, TOO_MANY_STATUSES)"],
    },
    { body: statusSchema },
  ),
  endpoint(
    "put",
    `${P}/statuses/reorder`,
    "Columns",
    "Put the columns in a new order (list every id once)",
    { "200": ["All columns", ok(z.array(Status))] },
    { body: reorderStatusesSchema },
  ),
  endpoint(
    "patch",
    `${P}/statuses/{statusId}`,
    "Columns",
    "Rename, recolor, change category, or make it the default column",
    { "200": ["All columns", ok(z.array(Status))] },
    { body: updateStatusSchema },
  ),
  endpoint(
    "delete",
    `${P}/statuses/{statusId}`,
    "Columns",
    "Delete a column after moving its tasks to another",
    {
      "200": ["Deleted", ok(z.object({ movedTasks: z.number().int(), statuses: z.array(Status) }))],
    },
    { body: deleteStatusSchema },
  ),

  // Milestones
  endpoint("get", `${P}/milestones`, "Milestones", "Milestones with progress", {
    "200": ["Milestones", ok(z.array(Milestone))],
  }),
  endpoint(
    "post",
    `${P}/milestones`,
    "Milestones",
    "Add a milestone",
    { "201": ["All milestones", ok(z.array(Milestone))] },
    { body: milestoneSchema },
  ),
  endpoint(
    "patch",
    `${P}/milestones/{milestoneId}`,
    "Milestones",
    "Edit or complete a milestone",
    { "200": ["All milestones", ok(z.array(Milestone))] },
    { body: updateMilestoneSchema },
  ),
  endpoint(
    "delete",
    `${P}/milestones/{milestoneId}`,
    "Milestones",
    "Delete a milestone (tasks keep existing)",
    {
      "200": ["All milestones", ok(z.array(Milestone))],
    },
  ),

  // Labels
  endpoint(
    "get",
    `${WS}/labels`,
    "Labels",
    "Workspace labels (meta.canManage: you may edit them)",
    {
      "200": ["Labels", okPage(z.array(Label), z.object({ canManage: z.boolean() }))],
    },
  ),
  endpoint(
    "post",
    `${WS}/labels`,
    "Labels",
    "Create a label (workspace admins and project managers)",
    {
      "201": ["Label", ok(Label)],
      "403": [FORBIDDEN],
      "409": ["Name taken (LABEL_NAME_TAKEN)"],
    },
    { body: labelSchema },
  ),
  endpoint(
    "patch",
    "/orgs/{orgSlug}/labels/{labelId}",
    "Labels",
    "Rename or recolor a label",
    { "200": ["Label", ok(Label)], "403": [FORBIDDEN] },
    { body: updateLabelSchema },
  ),
  endpoint(
    "delete",
    "/orgs/{orgSlug}/labels/{labelId}",
    "Labels",
    "Delete a label (removed from its tasks)",
    {
      "200": ["Deleted", ok(flag("deleted"))],
    },
  ),
];
