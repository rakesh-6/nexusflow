import type { Request } from "express";
import { z } from "zod";
import { currentAuth } from "../../middleware/auth.ts";
import { currentTenant } from "../../middleware/tenant.ts";
import { validateRequest } from "../../utils/validateRequest.ts";
import { loadWorkspace } from "./workspaces.service.ts";

// Small helpers every /orgs/:orgSlug/... route uses.

/** The signed-in person and their organization. */
export const actorAndTenant = (req: Request) => ({
  user: currentAuth(req).user,
  tenant: currentTenant(req),
});

const workspaceParams = z.looseObject({ workspaceSlug: z.string().min(1).max(60) });

/** Loads the workspace named in the address, or answers "not found". */
export async function workspaceFor(req: Request) {
  const { params } = validateRequest(req, { params: workspaceParams });
  const { user, tenant } = actorAndTenant(req);
  return { user, tenant, ...(await loadWorkspace(tenant, params.workspaceSlug, user.id)) };
}

/** Reads one id from the address, e.g. idParam(req, "projectId"). Not a UUID → 400. */
export function idParam(req: Request, name: string): string {
  const { params } = validateRequest(req, { params: z.looseObject({ [name]: z.uuid() }) });
  return (params as Record<string, string>)[name] as string;
}
