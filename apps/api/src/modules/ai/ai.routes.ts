import {
  aiSettingsSchema,
  insightsRequestSchema,
  meetingNotesRequestSchema,
  projectPlanRequestSchema,
  projectSummaryRequestSchema,
  taskDescriptionRequestSchema,
  taskIdRequestSchema,
} from "@nexusflow/shared";
import { Router, type Request } from "express";
import type { Prisma } from "../../generated/prisma/client.ts";
import { logActivity } from "../../lib/activity.ts";
import type { AiProvider } from "../../lib/ai/provider.ts";
import { prisma } from "../../lib/prisma.ts";
import { requireOrgPermission } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { sendSuccess } from "../../utils/response.ts";
import { validateRequest } from "../../utils/validateRequest.ts";
import { actorAndTenant } from "../organizations/requestContext.ts";
import { aiStatus, usageThisMonth } from "./ai.guard.ts";
import {
  deadlineSuggestion,
  insights,
  meetingNotes,
  projectPlan,
  projectSummary,
  taskBreakdown,
  taskDescription,
} from "./ai.service.ts";

/**
 * AI routes under /orgs/:orgSlug/ai (PRD §18.7). Built only when a provider is
 * set up; without one they do not exist at all and answer 404 (AC-AI-01).
 */
export function aiRouter(provider: AiProvider) {
  const router = Router({ mergeParams: true });
  const ctx = (req: Request) => ({ ...actorAndTenant(req), provider });

  router.get("/ai/status", async (req, res) => {
    sendSuccess(res, await aiStatus(actorAndTenant(req).tenant, provider));
  });

  router.get("/ai/usage", requireOrgPermission("usage:read"), async (req, res) => {
    sendSuccess(res, await usageThisMonth(actorAndTenant(req).tenant));
  });

  /** The owner's switch (PRD §11.16.1, US-AI-06). */
  router.put("/ai/settings", async (req, res) => {
    const { body } = validateRequest(req, { body: aiSettingsSchema });
    const { user, tenant } = actorAndTenant(req);
    if (tenant.membership.role !== "OWNER") {
      throw new AppError(403, "FORBIDDEN", "Only the owner can turn AI features on or off");
    }
    const settings = {
      ...((tenant.organization.settings ?? {}) as object),
      aiEnabled: body.aiEnabled,
    };
    await prisma.organization.update({
      where: { id: tenant.organization.id },
      data: { settings: settings as Prisma.InputJsonValue },
    });
    await logActivity({
      organizationId: tenant.organization.id,
      actorId: user.id,
      category: "SECURITY",
      action: body.aiEnabled ? "org.ai_enabled" : "org.ai_disabled",
      entityType: "organization",
      entityId: tenant.organization.id,
      req,
    });
    sendSuccess(
      res,
      await aiStatus({ ...tenant, organization: { ...tenant.organization, settings } }, provider),
    );
  });

  router.post("/ai/task-description", async (req, res) => {
    const { body } = validateRequest(req, { body: taskDescriptionRequestSchema });
    sendSuccess(res, await taskDescription(ctx(req), body));
  });
  router.post("/ai/task-breakdown", async (req, res) => {
    const { body } = validateRequest(req, { body: taskIdRequestSchema });
    sendSuccess(res, await taskBreakdown(ctx(req), body.taskId));
  });
  router.post("/ai/deadline-suggestion", async (req, res) => {
    const { body } = validateRequest(req, { body: taskIdRequestSchema });
    sendSuccess(res, await deadlineSuggestion(ctx(req), body.taskId));
  });
  router.post("/ai/project-plan", async (req, res) => {
    const { body } = validateRequest(req, { body: projectPlanRequestSchema });
    sendSuccess(res, await projectPlan(ctx(req), body.projectId));
  });
  router.post("/ai/project-summary", async (req, res) => {
    const { body } = validateRequest(req, { body: projectSummaryRequestSchema });
    sendSuccess(res, await projectSummary(ctx(req), body.projectId));
  });
  router.post("/ai/meeting-notes", async (req, res) => {
    const { body } = validateRequest(req, { body: meetingNotesRequestSchema });
    sendSuccess(res, await meetingNotes(ctx(req), body));
  });
  router.post("/ai/insights", async (req, res) => {
    const { body } = validateRequest(req, { body: insightsRequestSchema });
    sendSuccess(res, await insights(ctx(req), body.workspaceId));
  });
  return router;
}

/** Adds the AI routes only when a provider is set up (AC-AI-01). */
export function mountAi(router: Router, provider: AiProvider | null) {
  if (provider) router.use(aiRouter(provider));
}
