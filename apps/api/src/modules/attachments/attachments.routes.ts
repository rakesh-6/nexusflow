import { signAttachmentSchema } from "@nexusflow/shared";
import { Router } from "express";
import { sendSuccess } from "../../utils/response.ts";
import { validateRequest } from "../../utils/validateRequest.ts";
import { actorAndTenant, idParam } from "../organizations/requestContext.ts";
import { loadTask } from "../tasks/taskAccess.ts";
import {
  attachmentUrl,
  confirmAttachment,
  deleteAttachment,
  listAttachments,
  signAttachment,
} from "./attachments.service.ts";

// File attachments (PRD §18.7). Mounted under /orgs/:orgSlug after loadTenant;
// a file is visible exactly when its task is (404 otherwise).
export const attachmentsRouter = Router({ mergeParams: true });

attachmentsRouter.post("/attachments/sign", async (req, res) => {
  const { body } = validateRequest(req, { body: signAttachmentSchema });
  const { user, tenant } = actorAndTenant(req);
  sendSuccess(res, await signAttachment(tenant, user, body), 201);
});

attachmentsRouter.post("/attachments/:attachmentId/confirm", async (req, res) => {
  const { user, tenant } = actorAndTenant(req);
  sendSuccess(res, await confirmAttachment(tenant, user, idParam(req, "attachmentId")));
});

attachmentsRouter.get("/attachments/:attachmentId/url", async (req, res) => {
  const { user, tenant } = actorAndTenant(req);
  sendSuccess(res, await attachmentUrl(tenant, user, idParam(req, "attachmentId")));
});

attachmentsRouter.delete("/attachments/:attachmentId", async (req, res) => {
  const { user, tenant } = actorAndTenant(req);
  await deleteAttachment(tenant, user, idParam(req, "attachmentId"));
  sendSuccess(res, { deleted: true });
});

attachmentsRouter.get("/tasks/:taskId/attachments", async (req, res) => {
  const { user, tenant } = actorAndTenant(req);
  const { task, loaded } = await loadTask(tenant, idParam(req, "taskId"), user.id);
  sendSuccess(res, await listAttachments(user, task.id, loaded));
});
