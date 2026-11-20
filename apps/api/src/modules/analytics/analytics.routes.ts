import { analyticsQuerySchema, searchQuerySchema } from "@nexusflow/shared";
import { Router } from "express";
import { sendSuccess } from "../../utils/response.ts";
import { validateRequest } from "../../utils/validateRequest.ts";
import { actorAndTenant, workspaceFor } from "../organizations/requestContext.ts";
import { search } from "../search/search.service.ts";
import { workspaceAnalytics } from "./analytics.service.ts";

// Dashboard numbers and search (PRD §18.7). Mounted under /orgs/:orgSlug.
export const analyticsRouter = Router({ mergeParams: true });

analyticsRouter.get("/workspaces/:workspaceSlug/analytics", async (req, res) => {
  const { query } = validateRequest(req, { query: analyticsQuerySchema });
  const { user, tenant, workspace } = await workspaceFor(req);
  sendSuccess(res, await workspaceAnalytics(tenant, user, workspace, query));
});

analyticsRouter.get("/search", async (req, res) => {
  const { query } = validateRequest(req, { query: searchQuerySchema });
  const { user, tenant } = actorAndTenant(req);
  sendSuccess(res, await search(tenant, user, query));
});
