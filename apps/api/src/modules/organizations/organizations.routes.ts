import {
  changeRoleSchema,
  createOrganizationSchema,
  createWorkspaceSchema,
  deleteOrganizationSchema,
  deleteWorkspaceSchema,
  invitationSchema,
  ORG_ROLES,
  transferOwnershipSchema,
  updateOrganizationSchema,
  updateWorkspaceSchema,
  workspaceMemberSchema,
  workspaceRoleSchema,
} from "@nexusflow/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import {
  currentAuth,
  requireAuth,
  requireRecentAuth,
  requireVerified,
} from "../../middleware/auth.ts";
import {
  currentTenant,
  loadTenant,
  recheckAccessAfter,
  requireOrgPermission,
} from "../../middleware/tenant.ts";
import { sendSuccess } from "../../utils/response.ts";
import { validateRequest } from "../../utils/validateRequest.ts";
import { aiProvider } from "../../lib/ai/provider.ts";
import { mountAi } from "../ai/ai.routes.ts";
import { analyticsRouter } from "../analytics/analytics.routes.ts";
import { attachmentsRouter } from "../attachments/attachments.routes.ts";
import { automationsRouter } from "../automations/automations.routes.ts";
import { billingRouter } from "../billing/billing.routes.ts";
import { commentsRouter } from "../comments/comments.routes.ts";
import { projectsRouter } from "../projects/projects.routes.ts";
import { tasksRouter } from "../tasks/tasks.routes.ts";
import { teamsRouter } from "../teams/teams.routes.ts";
import {
  createInvitations,
  listPendingInvitations,
  resendInvitation,
  revokeInvitation,
} from "./invitations.service.ts";
import { changeMemberRole, listMembers, removeMember } from "./members.service.ts";
import {
  accessibleWorkspaces,
  countUsage,
  createOrganization,
  deleteOrganization,
  getOrganizationContext,
  leaveOrganization,
  transferOwnership,
  updateOrganization,
} from "./organizations.service.ts";
import { workspaceFor } from "./requestContext.ts";
import {
  addWorkspaceMember,
  assertCanManage,
  createWorkspace,
  deleteWorkspace,
  listWorkspaceActivity,
  listWorkspaceMembers,
  removeWorkspaceMember,
  setArchived,
  toWorkspaceDto,
  updateWorkspace,
} from "./workspaces.service.ts";

// /api/v1/orgs/... (PRD §18.5). Every route under /:orgSlug first runs
// loadTenant, so non-members get "not found" before anything else happens.

export const organizationsRouter = Router();

organizationsRouter.post("/", requireVerified, async (req, res) => {
  const { body } = validateRequest(req, { body: createOrganizationSchema });
  const { organization, workspace } = await createOrganization(currentAuth(req).user, body, req);
  sendSuccess(
    res,
    { slug: organization.slug, name: organization.name, workspaceSlug: workspace.slug },
    201,
  );
});

const org = Router({ mergeParams: true });
organizationsRouter.use("/:orgSlug", requireAuth, loadTenant, org);

const auth = (req: Request) => ({ user: currentAuth(req).user, tenant: currentTenant(req) });

// Changes to members, roles and workspaces make live connections re-check their rooms.
org.use(["/members", "/workspaces", "/leave", "/transfer-ownership"], recheckAccessAfter);

// Teams, projects and labels (Phase 4) and tasks (Phase 5) live in their own modules.
org.use(teamsRouter);
org.use(projectsRouter);
org.use(tasksRouter);
org.use(commentsRouter); // comments and reactions (Phase 6)
org.use(attachmentsRouter); // file attachments (Phase 7)
org.use(analyticsRouter); // dashboard numbers and search (Phase 8)
org.use(billingRouter); // plans and payments, owner only (Phase 9)
org.use(automationsRouter); // automation rules (Phase 10)
// AI routes exist only when a provider is set up (Phase 11, AC-AI-01).
mountAi(org, aiProvider);

// --- The organization itself ------------------------------------------------

org.get("/context", async (req, res) => {
  const { user, tenant } = auth(req);
  sendSuccess(res, await getOrganizationContext(tenant, user));
});

org.patch("/", requireOrgPermission("org:update"), async (req, res) => {
  const { body } = validateRequest(req, { body: updateOrganizationSchema });
  const { user, tenant } = auth(req);
  const updated = await updateOrganization(tenant, user, body, req);
  sendSuccess(res, { name: updated.name, slug: updated.slug });
});

org.delete(
  "/",
  recheckAccessAfter,
  requireOrgPermission("org:delete"),
  requireRecentAuth,
  async (req, res) => {
    const { body } = validateRequest(req, { body: deleteOrganizationSchema });
    const { user, tenant } = auth(req);
    await deleteOrganization(tenant, user, body.confirmSlug, req);
    sendSuccess(res, { deleted: true });
  },
);

org.post(
  "/transfer-ownership",
  requireOrgPermission("org:transfer"),
  requireRecentAuth,
  async (req, res) => {
    const { body } = validateRequest(req, { body: transferOwnershipSchema });
    const { user, tenant } = auth(req);
    await transferOwnership(tenant, user, body.userId, req);
    sendSuccess(res, { transferred: true });
  },
);

org.post("/leave", async (req, res) => {
  const { user, tenant } = auth(req);
  await leaveOrganization(tenant, user, req);
  sendSuccess(res, { left: true });
});

org.get("/usage", requireOrgPermission("usage:read"), async (req, res) => {
  const { tenant } = auth(req);
  sendSuccess(res, await countUsage(tenant.organization.id));
});

// The audit log: security and billing events (PRD §11.17).
org.get("/audit-logs", requireOrgPermission("audit:read"), async (req, res) => {
  const { query } = validateRequest(req, {
    query: z.object({
      action: z.string().max(64).optional(),
      cursor: z.uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  });
  const { tenant } = auth(req);
  const rows = await prisma.activityLog.findMany({
    where: {
      organizationId: tenant.organization.id,
      category: { in: ["SECURITY", "BILLING"] },
      ...(query.action ? { action: query.action } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, query.limit);
  const actorIds = [...new Set(page.map((row) => row.actorId).filter((id): id is string => !!id))];
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  });
  const actorName = new Map(actors.map((actor) => [actor.id, actor.name]));
  sendSuccess(
    res,
    page.map((row) => ({
      id: row.id,
      action: row.action,
      actorName: row.actorId ? (actorName.get(row.actorId) ?? "Unknown") : "System",
      entityType: row.entityType,
      entityId: row.entityId,
      changes: row.changes,
      metadata: row.metadata,
      ip: row.ip,
      createdAt: row.createdAt.toISOString(),
    })),
    200,
    { nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null },
  );
});

// --- Members -------------------------------------------------------------

org.get("/members", requireOrgPermission("members:read"), async (req, res) => {
  const { query } = validateRequest(req, {
    query: z.object({
      q: z.string().trim().max(100).optional(),
      role: z.enum(ORG_ROLES).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }),
  });
  const result = await listMembers(auth(req).tenant.organization.id, query);
  sendSuccess(res, result.members, 200, {
    total: result.total,
    page: query.page,
    pageSize: query.pageSize,
  });
});

const userIdParams = z.object({ userId: z.uuid() });

org.patch("/members/:userId", requireOrgPermission("members:manage"), async (req, res) => {
  const { params, body } = validateRequest(req, { params: userIdParams, body: changeRoleSchema });
  const { user, tenant } = auth(req);
  await changeMemberRole(tenant, user, params.userId, body.role, req);
  sendSuccess(res, { updated: true });
});

org.delete("/members/:userId", requireOrgPermission("members:manage"), async (req, res) => {
  const { params } = validateRequest(req, { params: userIdParams });
  const { user, tenant } = auth(req);
  await removeMember(tenant, user, params.userId, req);
  sendSuccess(res, { removed: true });
});

// --- Invitations ------------------------------------------------------------

const invitationParams = z.object({ invitationId: z.uuid() });

org.get("/invitations", requireOrgPermission("members:invite"), async (req, res) => {
  sendSuccess(res, await listPendingInvitations(auth(req).tenant.organization.id));
});

org.post("/invitations", requireOrgPermission("members:invite"), async (req, res) => {
  const { body } = validateRequest(req, { body: invitationSchema });
  const { user, tenant } = auth(req);
  sendSuccess(res, await createInvitations(tenant, user, body, req), 201);
});

org.post(
  "/invitations/:invitationId/resend",
  requireOrgPermission("members:invite"),
  async (req, res) => {
    const { params } = validateRequest(req, { params: invitationParams });
    const { user, tenant } = auth(req);
    await resendInvitation(tenant, user, params.invitationId);
    sendSuccess(res, { sent: true });
  },
);

org.delete(
  "/invitations/:invitationId",
  requireOrgPermission("members:invite"),
  async (req, res) => {
    const { params } = validateRequest(req, { params: invitationParams });
    const { user, tenant } = auth(req);
    await revokeInvitation(tenant, user, params.invitationId, req);
    sendSuccess(res, { revoked: true });
  },
);

// --- Workspaces ---------------------------------------------------------------

org.get("/workspaces", async (req, res) => {
  const { user, tenant } = auth(req);
  const role = tenant.membership.role;
  sendSuccess(
    res,
    await accessibleWorkspaces(
      tenant.organization.id,
      user.id,
      role,
      role === "OWNER" || role === "ADMIN",
    ),
  );
});

org.post("/workspaces", requireOrgPermission("workspace:create"), async (req, res) => {
  const { body } = validateRequest(req, { body: createWorkspaceSchema });
  const { user, tenant } = auth(req);
  const workspace = await createWorkspace(tenant, user, body, req);
  sendSuccess(res, toWorkspaceDto(workspace, "WORKSPACE_ADMIN"), 201);
});

org.get("/workspaces/:workspaceSlug", async (req, res) => {
  const { workspace, role } = await workspaceFor(req);
  sendSuccess(res, toWorkspaceDto(workspace, role));
});

org.patch("/workspaces/:workspaceSlug", async (req, res) => {
  const { body } = validateRequest(req, { body: updateWorkspaceSchema });
  const { user, tenant, workspace, role, canManage } = await workspaceFor(req);
  assertCanManage(canManage);
  sendSuccess(res, toWorkspaceDto(await updateWorkspace(tenant, user, workspace, body, req), role));
});

for (const [path, archived] of [
  ["archive", true],
  ["restore", false],
] as const) {
  org.post(
    `/workspaces/:workspaceSlug/${path}`,
    requireOrgPermission("workspace:create"),
    async (req, res) => {
      const { user, tenant, workspace, role } = await workspaceFor(req);
      sendSuccess(
        res,
        toWorkspaceDto(await setArchived(tenant, user, workspace, archived, req), role),
      );
    },
  );
}

org.delete(
  "/workspaces/:workspaceSlug",
  requireOrgPermission("workspace:create"),
  async (req, res) => {
    const { body } = validateRequest(req, { body: deleteWorkspaceSchema });
    const { user, tenant, workspace } = await workspaceFor(req);
    await deleteWorkspace(tenant, user, workspace, body.deleteContents, req);
    sendSuccess(res, { deleted: true });
  },
);

org.get("/workspaces/:workspaceSlug/members", async (req, res) => {
  const { workspace } = await workspaceFor(req);
  sendSuccess(res, await listWorkspaceMembers(workspace.id));
});

org.post("/workspaces/:workspaceSlug/members", async (req, res) => {
  const { body } = validateRequest(req, { body: workspaceMemberSchema });
  const { tenant, workspace, canManage } = await workspaceFor(req);
  assertCanManage(canManage);
  await addWorkspaceMember(tenant, workspace, body.userId, body.role);
  sendSuccess(res, { added: true }, 201);
});

org.patch("/workspaces/:workspaceSlug/members/:userId", async (req, res) => {
  const { params, body } = validateRequest(req, {
    params: userIdParams.passthrough(),
    body: workspaceRoleSchema,
  });
  const { tenant, workspace, canManage } = await workspaceFor(req);
  assertCanManage(canManage);
  await addWorkspaceMember(tenant, workspace, params.userId, body.role);
  sendSuccess(res, { updated: true });
});

org.delete("/workspaces/:workspaceSlug/members/:userId", async (req, res) => {
  const { params } = validateRequest(req, { params: userIdParams.passthrough() });
  const { workspace, canManage } = await workspaceFor(req);
  assertCanManage(canManage);
  await removeWorkspaceMember(workspace, params.userId);
  sendSuccess(res, { removed: true });
});

org.get("/workspaces/:workspaceSlug/activity", async (req, res) => {
  const { query } = validateRequest(req, {
    query: z.object({
      cursor: z.uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(30),
    }),
  });
  const { workspace } = await workspaceFor(req);
  const page = await listWorkspaceActivity(workspace.id, query.cursor, query.limit);
  sendSuccess(res, page.items, 200, { nextCursor: page.nextCursor });
});
