import {
  bulkTaskSchema,
  createTaskSchema,
  dependencySchema,
  moveTaskSchema,
  taskQuerySchema,
  updateTaskSchema,
} from "@nexusflow/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { listActivity } from "../../lib/activity.ts";
import { sendSuccess } from "../../utils/response.ts";
import { validateRequest } from "../../utils/validateRequest.ts";
import { actorAndTenant, idParam, workspaceFor } from "../organizations/requestContext.ts";
import { loadProject } from "../projects/access.ts";
import { assignablePeople, loadTask } from "./taskAccess.ts";
import { boardColumns, listTasks, myTasks } from "./taskLists.service.ts";
import { addDependency, bulkChangeTasks, removeDependency } from "./taskRelations.service.ts";
import {
  createTask,
  deleteTask,
  duplicateTask,
  listTaskTrash,
  loadTaskByKey,
  moveTask,
  restoreTask,
  taskDetail,
  updateTask,
} from "./tasks.service.ts";

// Tasks (PRD §18.6). Mounted under /orgs/:orgSlug after loadTenant. Every route
// loads the task's project first, so people without access get 404.
export const tasksRouter = Router({ mergeParams: true });

async function projectFor(req: Request) {
  const { user, tenant } = actorAndTenant(req);
  return { user, tenant, loaded: await loadProject(tenant, idParam(req, "projectId"), user.id) };
}

async function taskFor(req: Request, options?: { deleted: boolean }) {
  const { user, tenant } = actorAndTenant(req);
  return { user, tenant, ...(await loadTask(tenant, idParam(req, "taskId"), user.id, options)) };
}

// --- In a project -----------------------------------------------------------------

tasksRouter.get("/projects/:projectId/tasks", async (req, res) => {
  const { query } = validateRequest(req, { query: taskQuerySchema });
  const { user, loaded } = await projectFor(req);
  const page = await listTasks(user, loaded, query);
  sendSuccess(res, page.items, 200, { nextCursor: page.nextCursor });
});

tasksRouter.post("/projects/:projectId/tasks", async (req, res) => {
  const { body } = validateRequest(req, { body: createTaskSchema });
  const { user, tenant, loaded } = await projectFor(req);
  sendSuccess(res, await createTask(tenant, user, loaded, body, req), 201);
});

tasksRouter.get("/projects/:projectId/board", async (req, res) => {
  const { query } = validateRequest(req, { query: taskQuerySchema });
  const { user, loaded } = await projectFor(req);
  sendSuccess(res, await boardColumns(user, loaded, query));
});

tasksRouter.get("/projects/:projectId/assignable", async (req, res) => {
  const { tenant, loaded } = await projectFor(req);
  sendSuccess(res, await assignablePeople(tenant, loaded.project));
});

tasksRouter.post("/projects/:projectId/tasks/bulk", async (req, res) => {
  const { body } = validateRequest(req, { body: bulkTaskSchema });
  const { user, tenant, loaded } = await projectFor(req);
  sendSuccess(res, await bulkChangeTasks(tenant, user, loaded, body, req));
});

tasksRouter.get("/projects/:projectId/tasks/trash", async (req, res) => {
  const { loaded } = await projectFor(req);
  sendSuccess(res, await listTaskTrash(loaded));
});

// --- In a workspace ---------------------------------------------------------------

tasksRouter.get("/workspaces/:workspaceSlug/tasks/by-key/:taskKey", async (req, res) => {
  const { params } = validateRequest(req, {
    params: z.looseObject({ taskKey: z.string().min(3).max(20) }),
  });
  const { user, tenant, workspace } = await workspaceFor(req);
  const { task, loaded } = await loadTaskByKey(tenant, user, workspace.id, params.taskKey);
  sendSuccess(res, await taskDetail(user, task, loaded));
});

tasksRouter.get("/workspaces/:workspaceSlug/my-tasks", async (req, res) => {
  const { user, tenant, workspace } = await workspaceFor(req);
  sendSuccess(res, await myTasks(tenant, user, workspace));
});

// --- One task ---------------------------------------------------------------------

tasksRouter.get("/tasks/:taskId", async (req, res) => {
  const { user, task, loaded } = await taskFor(req);
  sendSuccess(res, await taskDetail(user, task, loaded));
});

tasksRouter.patch("/tasks/:taskId", async (req, res) => {
  const { body } = validateRequest(req, { body: updateTaskSchema });
  const { user, tenant, task, loaded } = await taskFor(req);
  sendSuccess(res, await updateTask(tenant, user, task, loaded, body, req));
});

tasksRouter.delete("/tasks/:taskId", async (req, res) => {
  const { user, tenant, task, loaded } = await taskFor(req);
  await deleteTask(tenant, user, task, loaded, req);
  sendSuccess(res, { deleted: true });
});

tasksRouter.post("/tasks/:taskId/move", async (req, res) => {
  const { body } = validateRequest(req, { body: moveTaskSchema });
  const { user, tenant, task, loaded } = await taskFor(req);
  const result = await moveTask(tenant, user, task, loaded, body, req);
  sendSuccess(res, result.task, 200, { renumbered: result.renumbered });
});

tasksRouter.post("/tasks/:taskId/restore", async (req, res) => {
  const { user, tenant, task, loaded } = await taskFor(req, { deleted: true });
  sendSuccess(res, await restoreTask(tenant, user, task, loaded, req));
});

tasksRouter.post("/tasks/:taskId/duplicate", async (req, res) => {
  const { user, tenant, task, loaded } = await taskFor(req);
  sendSuccess(res, await duplicateTask(tenant, user, task, loaded, req), 201);
});

tasksRouter.get("/tasks/:taskId/activity", async (req, res) => {
  const { query } = validateRequest(req, {
    query: z.object({
      cursor: z.uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(30),
    }),
  });
  const { tenant, task } = await taskFor(req);
  const page = await listActivity(
    tenant.organization.id,
    "task",
    task.id,
    query.cursor,
    query.limit,
  );
  sendSuccess(res, page.items, 200, { nextCursor: page.nextCursor });
});

tasksRouter.post("/tasks/:taskId/dependencies", async (req, res) => {
  const { body } = validateRequest(req, { body: dependencySchema });
  const { user, tenant, task, loaded } = await taskFor(req);
  sendSuccess(res, await addDependency(tenant, user, task, loaded, body, req), 201);
});

tasksRouter.delete("/tasks/:taskId/dependencies/:dependencyId", async (req, res) => {
  const { user, tenant, task, loaded } = await taskFor(req);
  const dependencyId = idParam(req, "dependencyId");
  sendSuccess(res, await removeDependency(tenant, user, task, loaded, dependencyId, req));
});
