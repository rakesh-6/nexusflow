import {
  createTeamSchema,
  deleteTeamSchema,
  teamMemberSchema,
  teamRoleSchema,
  updateTeamSchema,
} from "@nexusflow/shared";
import { Router, type Request } from "express";
import { recheckAccessAfter } from "../../middleware/tenant.ts";
import { sendSuccess } from "../../utils/response.ts";
import { validateRequest } from "../../utils/validateRequest.ts";
import { actorAndTenant, idParam, workspaceFor } from "../organizations/requestContext.ts";
import {
  createTeam,
  deleteTeam,
  listTeamMembers,
  listTeams,
  loadTeam,
  removeTeamMember,
  setTeamMember,
  updateTeam,
} from "./teams.service.ts";

// Teams and their members (PRD §18.5). Mounted under /orgs/:orgSlug after loadTenant.
export const teamsRouter = Router({ mergeParams: true });

// Team changes (members, leads, deletion) change project access: live connections re-check.
teamsRouter.use("/teams", recheckAccessAfter);

async function teamFor(req: Request) {
  const { user, tenant } = actorAndTenant(req);
  return { user, tenant, loaded: await loadTeam(tenant, idParam(req, "teamId"), user.id) };
}

teamsRouter.get("/workspaces/:workspaceSlug/teams", async (req, res) => {
  const { user, workspace, canManage } = await workspaceFor(req);
  sendSuccess(res, await listTeams(workspace, user.id, canManage), 200, { canCreate: canManage });
});

teamsRouter.post("/workspaces/:workspaceSlug/teams", async (req, res) => {
  const { body } = validateRequest(req, { body: createTeamSchema });
  const { user, tenant, workspace, canManage } = await workspaceFor(req);
  sendSuccess(res, await createTeam(tenant, user, workspace, canManage, body, req), 201);
});

teamsRouter.get("/teams/:teamId", async (req, res) => {
  const { loaded } = await teamFor(req);
  sendSuccess(res, loaded.dto);
});

teamsRouter.patch("/teams/:teamId", async (req, res) => {
  const { body } = validateRequest(req, { body: updateTeamSchema });
  const { user, tenant, loaded } = await teamFor(req);
  sendSuccess(res, await updateTeam(tenant, user, loaded, body));
});

teamsRouter.delete("/teams/:teamId", async (req, res) => {
  const { body } = validateRequest(req, { body: deleteTeamSchema });
  const { user, tenant, loaded } = await teamFor(req);
  await deleteTeam(tenant, user, loaded, body.projectsAction, req);
  sendSuccess(res, { deleted: true });
});

teamsRouter.get("/teams/:teamId/members", async (req, res) => {
  const { loaded } = await teamFor(req);
  sendSuccess(res, await listTeamMembers(loaded.team.id));
});

teamsRouter.post("/teams/:teamId/members", async (req, res) => {
  const { body } = validateRequest(req, { body: teamMemberSchema });
  const { tenant, loaded } = await teamFor(req);
  await setTeamMember(tenant, loaded, body.userId, body.role, { mustExist: false });
  sendSuccess(res, { added: true }, 201);
});

teamsRouter.patch("/teams/:teamId/members/:userId", async (req, res) => {
  const { body } = validateRequest(req, { body: teamRoleSchema });
  const { tenant, loaded } = await teamFor(req);
  await setTeamMember(tenant, loaded, idParam(req, "userId"), body.role, { mustExist: true });
  sendSuccess(res, { updated: true });
});

teamsRouter.delete("/teams/:teamId/members/:userId", async (req, res) => {
  const { loaded } = await teamFor(req);
  await removeTeamMember(loaded, idParam(req, "userId"));
  sendSuccess(res, { removed: true });
});
