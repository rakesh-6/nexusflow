import {
  createProjectSchema,
  deleteStatusSchema,
  labelSchema,
  milestoneSchema,
  PROJECT_STATUSES,
  projectKeySchema,
  projectMemberSchema,
  projectRoleSchema,
  reorderStatusesSchema,
  statusSchema,
  updateLabelSchema,
  updateMilestoneSchema,
  updateProjectSchema,
  updateStatusSchema,
} from "@nexusflow/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { recheckAccessAfter, requireOrgPermission } from "../../middleware/tenant.ts";
import { sendSuccess } from "../../utils/response.ts";
import { validateRequest } from "../../utils/validateRequest.ts";
import { actorAndTenant, idParam, workspaceFor } from "../organizations/requestContext.ts";
import { loadProject, loadProjectByKey } from "./access.ts";
import {
  canManageLabels,
  createLabel,
  deleteLabel,
  listLabels,
  updateLabel,
} from "./labels.service.ts";
import {
  createProject,
  deleteProject,
  listProjectActivity,
  listProjectMembers,
  listProjects,
  listTrash,
  projectDto,
  removeProjectMember,
  setProjectArchived,
  setProjectMember,
  undeleteProject,
  updateProject,
} from "./projects.service.ts";
import {
  createMilestone,
  createStatus,
  deleteMilestone,
  deleteStatus,
  listMilestones,
  listStatuses,
  reorderStatuses,
  updateMilestone,
  updateStatus,
} from "./structure.service.ts";

// Projects, their members, columns and milestones, and workspace labels
// (PRD §18.5). Mounted under /orgs/:orgSlug after loadTenant.
export const projectsRouter = Router({ mergeParams: true });

// Member, visibility, team and deletion changes alter who can see a project:
// live connections re-check their rooms afterwards (task routes are not affected).
projectsRouter.use("/projects/:projectId/members", recheckAccessAfter);
projectsRouter.use("/projects/:projectId/undelete", recheckAccessAfter);
projectsRouter.patch("/projects/:projectId", recheckAccessAfter);
projectsRouter.delete("/projects/:projectId", recheckAccessAfter);

/** The project in the address, with your access to it (404 without access). */
async function projectFor(req: Request) {
  const { user, tenant } = actorAndTenant(req);
  const loaded = await loadProject(tenant, idParam(req, "projectId"), user.id);
  return { user, tenant, ...loaded, loaded };
}

const listQuery = z.object({
  status: z.enum(PROJECT_STATUSES).optional(),
  teamId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(),
  includeArchived: z.stringbool().default(false),
});

// --- In a workspace ------------------------------------------------------------

projectsRouter.get("/workspaces/:workspaceSlug/projects", async (req, res) => {
  const { query } = validateRequest(req, { query: listQuery });
  const { user, tenant, workspace } = await workspaceFor(req);
  sendSuccess(res, await listProjects(tenant, workspace, user, query));
});

projectsRouter.post("/workspaces/:workspaceSlug/projects", async (req, res) => {
  const { body } = validateRequest(req, { body: createProjectSchema });
  const { user, tenant, workspace, canManage } = await workspaceFor(req);
  sendSuccess(res, await createProject(tenant, user, workspace, canManage, body, req), 201);
});

projectsRouter.get("/workspaces/:workspaceSlug/projects/by-key/:key", async (req, res) => {
  const { params } = validateRequest(req, { params: z.looseObject({ key: projectKeySchema }) });
  const { user, tenant, workspace } = await workspaceFor(req);
  const { project } = await loadProjectByKey(tenant, workspace.id, params.key, user.id);
  sendSuccess(res, await projectDto(tenant, project));
});

projectsRouter.get("/workspaces/:workspaceSlug/labels", async (req, res) => {
  const { user, workspace, canManage } = await workspaceFor(req);
  sendSuccess(res, await listLabels(workspace.id), 200, {
    canManage: await canManageLabels(workspace.id, user.id, canManage),
  });
});

projectsRouter.post("/workspaces/:workspaceSlug/labels", async (req, res) => {
  const { body } = validateRequest(req, { body: labelSchema });
  const { user, tenant, workspace, canManage } = await workspaceFor(req);
  sendSuccess(res, await createLabel(tenant, workspace, user.id, canManage, body), 201);
});

projectsRouter.patch("/labels/:labelId", async (req, res) => {
  const { body } = validateRequest(req, { body: updateLabelSchema });
  const { user, tenant } = actorAndTenant(req);
  sendSuccess(res, await updateLabel(tenant, idParam(req, "labelId"), user.id, body));
});

projectsRouter.delete("/labels/:labelId", async (req, res) => {
  const { user, tenant } = actorAndTenant(req);
  await deleteLabel(tenant, idParam(req, "labelId"), user.id);
  sendSuccess(res, { deleted: true });
});

// --- Trash (organization owners and admins) -------------------------------------

projectsRouter.get("/trash", requireOrgPermission("members:manage"), async (req, res) => {
  sendSuccess(res, await listTrash(actorAndTenant(req).tenant));
});

projectsRouter.post(
  "/projects/:projectId/undelete",
  requireOrgPermission("members:manage"),
  async (req, res) => {
    const { user, tenant } = actorAndTenant(req);
    sendSuccess(res, await undeleteProject(tenant, user, idParam(req, "projectId"), req));
  },
);

// --- One project --------------------------------------------------------------

projectsRouter.get("/projects/:projectId", async (req, res) => {
  const { tenant, project } = await projectFor(req);
  sendSuccess(res, await projectDto(tenant, project));
});

projectsRouter.patch("/projects/:projectId", async (req, res) => {
  const { body } = validateRequest(req, { body: updateProjectSchema });
  const { user, tenant, loaded } = await projectFor(req);
  sendSuccess(res, await updateProject(tenant, user, loaded, body, req));
});

projectsRouter.delete("/projects/:projectId", async (req, res) => {
  const { user, tenant, loaded } = await projectFor(req);
  await deleteProject(tenant, user, loaded, req);
  sendSuccess(res, { deleted: true });
});

for (const [path, archived] of [
  ["archive", true],
  ["restore", false],
] as const) {
  projectsRouter.post(`/projects/:projectId/${path}`, async (req, res) => {
    const { user, tenant, loaded } = await projectFor(req);
    sendSuccess(res, await setProjectArchived(tenant, user, loaded, archived, req));
  });
}

projectsRouter.get("/projects/:projectId/activity", async (req, res) => {
  const { query } = validateRequest(req, {
    query: z.object({
      cursor: z.uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(30),
    }),
  });
  const { tenant, project } = await projectFor(req);
  const page = await listProjectActivity(
    tenant.organization.id,
    project.id,
    query.cursor,
    query.limit,
  );
  sendSuccess(res, page.items, 200, { nextCursor: page.nextCursor });
});

// --- Members --------------------------------------------------------------------

projectsRouter.get("/projects/:projectId/members", async (req, res) => {
  const { project } = await projectFor(req);
  sendSuccess(res, await listProjectMembers(project));
});

projectsRouter.post("/projects/:projectId/members", async (req, res) => {
  const { body } = validateRequest(req, { body: projectMemberSchema });
  const { user, tenant, loaded } = await projectFor(req);
  await setProjectMember(tenant, user, loaded, body.userId, body.role, { mustExist: false });
  sendSuccess(res, { added: true }, 201);
});

projectsRouter.patch("/projects/:projectId/members/:userId", async (req, res) => {
  const { body } = validateRequest(req, { body: projectRoleSchema });
  const { user, tenant, loaded } = await projectFor(req);
  await setProjectMember(tenant, user, loaded, idParam(req, "userId"), body.role, {
    mustExist: true,
  });
  sendSuccess(res, { updated: true });
});

projectsRouter.delete("/projects/:projectId/members/:userId", async (req, res) => {
  const { user, tenant, loaded } = await projectFor(req);
  await removeProjectMember(tenant, user, loaded, idParam(req, "userId"));
  sendSuccess(res, { removed: true });
});

// --- Columns (task statuses) ------------------------------------------------------

projectsRouter.get("/projects/:projectId/statuses", async (req, res) => {
  const { project } = await projectFor(req);
  sendSuccess(res, await listStatuses(project.id));
});

projectsRouter.post("/projects/:projectId/statuses", async (req, res) => {
  const { body } = validateRequest(req, { body: statusSchema });
  const { user, tenant, loaded } = await projectFor(req);
  await createStatus(tenant, user, loaded, body);
  sendSuccess(res, await listStatuses(loaded.project.id), 201);
});

projectsRouter.put("/projects/:projectId/statuses/reorder", async (req, res) => {
  const { body } = validateRequest(req, { body: reorderStatusesSchema });
  const { user, tenant, loaded } = await projectFor(req);
  await reorderStatuses(tenant, user, loaded, body.statusIds);
  sendSuccess(res, await listStatuses(loaded.project.id));
});

projectsRouter.patch("/projects/:projectId/statuses/:statusId", async (req, res) => {
  const { body } = validateRequest(req, { body: updateStatusSchema });
  const { user, tenant, loaded } = await projectFor(req);
  await updateStatus(tenant, user, loaded, idParam(req, "statusId"), body);
  sendSuccess(res, await listStatuses(loaded.project.id));
});

projectsRouter.delete("/projects/:projectId/statuses/:statusId", async (req, res) => {
  const { body } = validateRequest(req, { body: deleteStatusSchema });
  const { user, tenant, loaded } = await projectFor(req);
  const result = await deleteStatus(
    tenant,
    user,
    loaded,
    idParam(req, "statusId"),
    body.targetStatusId,
  );
  sendSuccess(res, { ...result, statuses: await listStatuses(loaded.project.id) });
});

// --- Milestones -----------------------------------------------------------------

projectsRouter.get("/projects/:projectId/milestones", async (req, res) => {
  const { project } = await projectFor(req);
  sendSuccess(res, await listMilestones(project.id));
});

projectsRouter.post("/projects/:projectId/milestones", async (req, res) => {
  const { body } = validateRequest(req, { body: milestoneSchema });
  const { user, tenant, loaded } = await projectFor(req);
  await createMilestone(tenant, user, loaded, body);
  sendSuccess(res, await listMilestones(loaded.project.id), 201);
});

projectsRouter.patch("/projects/:projectId/milestones/:milestoneId", async (req, res) => {
  const { body } = validateRequest(req, { body: updateMilestoneSchema });
  const { user, tenant, loaded } = await projectFor(req);
  await updateMilestone(tenant, user, loaded, idParam(req, "milestoneId"), body);
  sendSuccess(res, await listMilestones(loaded.project.id));
});

projectsRouter.delete("/projects/:projectId/milestones/:milestoneId", async (req, res) => {
  const { user, tenant, loaded } = await projectFor(req);
  await deleteMilestone(tenant, user, loaded, idParam(req, "milestoneId"));
  sendSuccess(res, await listMilestones(loaded.project.id));
});
