import { createCommentSchema, reactionSchema, updateCommentSchema } from "@nexusflow/shared";
import { Router } from "express";
import { sendSuccess } from "../../utils/response.ts";
import { validateRequest } from "../../utils/validateRequest.ts";
import { actorAndTenant, idParam } from "../organizations/requestContext.ts";
import { loadTask } from "../tasks/taskAccess.ts";
import {
  createComment,
  deleteComment,
  listComments,
  loadComment,
  mentionablePeople,
  toggleReaction,
  updateComment,
} from "./comments.service.ts";

// Comments and reactions (PRD §18.7). Mounted under /orgs/:orgSlug after
// loadTenant. Comments belong to a task, so they are visible exactly when the
// task is: people without access get 404.
export const commentsRouter = Router({ mergeParams: true });

async function taskFor(req: Parameters<typeof actorAndTenant>[0]) {
  const { user, tenant } = actorAndTenant(req);
  return { user, tenant, ...(await loadTask(tenant, idParam(req, "taskId"), user.id)) };
}

commentsRouter.get("/tasks/:taskId/comments", async (req, res) => {
  const { user, task, loaded } = await taskFor(req);
  sendSuccess(res, await listComments(user, task.id, loaded));
});

commentsRouter.get("/tasks/:taskId/mentionable", async (req, res) => {
  const { tenant, loaded } = await taskFor(req);
  sendSuccess(res, await mentionablePeople(tenant, loaded));
});

commentsRouter.post("/tasks/:taskId/comments", async (req, res) => {
  const { body } = validateRequest(req, { body: createCommentSchema });
  const { user, tenant, task, loaded } = await taskFor(req);
  sendSuccess(res, await createComment(tenant, user, task, loaded, body), 201);
});

commentsRouter.patch("/comments/:commentId", async (req, res) => {
  const { body } = validateRequest(req, { body: updateCommentSchema });
  const { user, tenant } = actorAndTenant(req);
  const { comment, loaded } = await loadComment(tenant, idParam(req, "commentId"), user);
  sendSuccess(res, await updateComment(tenant, user, comment, loaded, body.body));
});

commentsRouter.delete("/comments/:commentId", async (req, res) => {
  const { user, tenant } = actorAndTenant(req);
  const { comment, loaded } = await loadComment(tenant, idParam(req, "commentId"), user);
  await deleteComment(tenant, user, comment, loaded);
  sendSuccess(res, { deleted: true });
});

commentsRouter.post("/comments/:commentId/reactions", async (req, res) => {
  const { body } = validateRequest(req, { body: reactionSchema });
  const { user, tenant } = actorAndTenant(req);
  const { comment, loaded } = await loadComment(tenant, idParam(req, "commentId"), user);
  sendSuccess(res, await toggleReaction(tenant, user, comment, loaded, body.emoji));
});
