import {
  createAutomationSchema,
  dryRunSchema,
  EXECUTION_STATUSES,
  RECIPES,
  updateAutomationSchema,
} from "@nexusflow/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { sendSuccess } from "../../utils/response.ts";
import { validateRequest } from "../../utils/validateRequest.ts";
import { actorAndTenant, idParam, workspaceFor } from "../organizations/requestContext.ts";
import {
  createAutomation,
  deleteAutomation,
  dryRun,
  listAutomations,
  listExecutions,
  loadAutomation,
  scopeFor,
  toggleAutomation,
  updateAutomation,
} from "./automations.service.ts";

// Automation rules (PRD §11.15, §18.7). Mounted under /orgs/:orgSlug.
export const automationsRouter = Router({ mergeParams: true });

/** The ready-made rules (PRD §11.15.3). */
automationsRouter.get("/automations/recipes", (_req, res) => {
  sendSuccess(res, RECIPES);
});

automationsRouter.get("/workspaces/:workspaceSlug/automations", async (req, res) => {
  const { query } = validateRequest(req, { query: z.object({ projectId: z.uuid().optional() }) });
  const { user, tenant, workspace, canManage } = await workspaceFor(req);
  sendSuccess(res, await listAutomations({ tenant, user, workspace, canManage }, query.projectId));
});

automationsRouter.post("/workspaces/:workspaceSlug/automations", async (req, res) => {
  const { body } = validateRequest(req, { body: createAutomationSchema });
  const { user, tenant, workspace, canManage } = await workspaceFor(req);
  sendSuccess(res, await createAutomation({ tenant, user, workspace, canManage }, body, req), 201);
});

/** The rule in the address, with its workspace scope for permission checks. */
async function ruleFor(req: Request) {
  const { user, tenant } = actorAndTenant(req);
  const automation = await loadAutomation(tenant, user, idParam(req, "automationId"));
  return { automation, scope: await scopeFor(tenant, user, automation.workspace) };
}

automationsRouter.patch("/automations/:automationId", async (req, res) => {
  const { body } = validateRequest(req, { body: updateAutomationSchema });
  const { automation, scope } = await ruleFor(req);
  sendSuccess(res, await updateAutomation(scope, automation, body, req));
});

automationsRouter.delete("/automations/:automationId", async (req, res) => {
  const { automation, scope } = await ruleFor(req);
  sendSuccess(res, await deleteAutomation(scope, automation, req));
});

automationsRouter.post("/automations/:automationId/toggle", async (req, res) => {
  const { automation, scope } = await ruleFor(req);
  sendSuccess(res, await toggleAutomation(scope, automation, req));
});

automationsRouter.post("/automations/:automationId/dry-run", async (req, res) => {
  const { body } = validateRequest(req, { body: dryRunSchema });
  const { automation, scope } = await ruleFor(req);
  sendSuccess(res, await dryRun(scope, automation, body.taskId));
});

automationsRouter.get("/automations/:automationId/executions", async (req, res) => {
  const { query } = validateRequest(req, {
    query: z.object({
      cursor: z.uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      status: z.enum(EXECUTION_STATUSES).optional(),
    }),
  });
  const { automation, scope } = await ruleFor(req);
  const page = await listExecutions(scope, automation, query);
  sendSuccess(res, page.items, 200, { nextCursor: page.nextCursor });
});
