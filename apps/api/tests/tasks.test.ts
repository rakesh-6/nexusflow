import { addDays, freshPositions, todayIn } from "@nexusflow/shared";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.ts";
import { createTestClient } from "./helpers/http.ts";
import { orgHelpers } from "./helpers/orgs.ts";

// Tasks, the board, the list and My Tasks (PRD §11.6, §11.7).
const client = createTestClient("task-test.example");
const { post, patch } = client;
const { verifiedUser, createOrg, joinedMember } = orgHelpers(client);
type Agent = ReturnType<typeof client.newAgent>;

const SLOW = { timeout: 300_000 };
let keyCounter = 0;
const nextKey = () =>
  `T${(++keyCounter).toString(36).toUpperCase()}${Date.now() % 1000}`.slice(0, 6);

afterAll(async () => {
  await client.cleanup();
  await prisma.$disconnect();
});

interface Task {
  id: string;
  key: string;
  number: number;
  version: number;
  position: string;
  status: { id: string; name: string; category: string };
  completedAt: string | null;
}

async function setup() {
  const owner = await verifiedUser();
  const slug = await createOrg(owner.agent);
  const project = await newProject(owner.agent, slug);
  return { ...owner, slug, project, api: `/orgs/${slug}` };
}

async function newProject(agent: Agent, slug: string, body: object = {}) {
  const response = await post(agent, `/orgs/${slug}/workspaces/general/projects`, {
    name: "Tasks",
    key: nextKey(),
    ...body,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  const statuses = await agent
    .get(`/api/v1/orgs/${slug}/projects/${response.body.data.id}/statuses`)
    .expect(200);
  const status = (name: string) =>
    (statuses.body.data as { id: string; name: string }[]).find((s) => s.name === name)?.id ?? "";
  return { ...(response.body.data as { id: string; key: string }), status };
}

async function newTask(agent: Agent, slug: string, projectId: string, body: object = {}) {
  const response = await post(agent, `/orgs/${slug}/projects/${projectId}/tasks`, {
    title: "A task",
    ...body,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.data as Task;
}

/** Many tasks at once, straight into the database (creating 100 by HTTP would be slow). */
async function insertTasks(projectId: string, statusId: string, reporterId: string, count: number) {
  const project = await prisma.project.update({
    where: { id: projectId },
    data: { taskSequence: { increment: count } },
  });
  const first = project.taskSequence - count + 1;
  const positions = freshPositions(count);
  await prisma.task.createMany({
    data: positions.map((position, index) => ({
      organizationId: project.organizationId,
      projectId,
      number: first + index,
      title: `Bulk ${first + index}`,
      statusId,
      reporterId,
      createdById: reporterId,
      position,
    })),
  });
  const rows = await prisma.task.findMany({
    where: { projectId, number: { gte: first } },
    orderBy: { number: "asc" },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

describe("creating and numbering tasks (AC-TASK-01)", SLOW, () => {
  it("gives 50 parallel creations consecutive numbers and locks the project key", async () => {
    const { agent, project, api } = await setup();
    const created = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        post(agent, `${api}/projects/${project.id}/tasks`, { title: `Parallel ${i}` }),
      ),
    );
    expect(created.every((response) => response.status === 201)).toBe(true);
    const numbers = created.map((response) => response.body.data.number as number);
    expect([...numbers].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(created[0]?.body.data.key).toMatch(new RegExp(`^${project.key}-\\d+$`));

    const first = created[0]?.body.data as Task;
    expect(first.status.name).toBe("Todo");
    const locked = await patch(agent, `${api}/projects/${project.id}`, { key: "OTHER" }).expect(
      409,
    );
    expect(locked.body.error.code).toBe("KEY_LOCKED");
  });
});

describe("moving and editing (AC-TASK-02, 04, 05, AC-VIEW-03)", SLOW, () => {
  it("orders cards, sets completion in Done columns and refuses other projects' columns", async () => {
    const { agent, slug, project, api } = await setup();
    const a = await newTask(agent, slug, project.id, { title: "A" });
    const b = await newTask(agent, slug, project.id, { title: "B" });
    const c = await newTask(agent, slug, project.id, { title: "C" });

    // C goes between A and B.
    const moved = await post(agent, `${api}/tasks/${c.id}/move`, {
      statusId: project.status("Todo"),
      afterTaskId: a.id,
      beforeTaskId: b.id,
      version: c.version,
    }).expect(200);
    const board = await agent.get(`/api/v1${api}/projects/${project.id}/board`).expect(200);
    const todo = board.body.data.find(
      (col: { statusId: string }) => col.statusId === project.status("Todo"),
    );
    expect(todo.tasks.map((t: Task) => t.key)).toEqual([a.key, c.key, b.key]);
    expect(todo.total).toBe(3);

    // Done sets completedAt; moving back clears it; both are in the history.
    const done = await post(agent, `${api}/tasks/${c.id}/move`, {
      statusId: project.status("Done"),
      version: moved.body.data.version,
    }).expect(200);
    expect(done.body.data.completedAt).not.toBeNull();
    const back = await post(agent, `${api}/tasks/${c.id}/move`, {
      statusId: project.status("Todo"),
      version: done.body.data.version,
    }).expect(200);
    expect(back.body.data.completedAt).toBeNull();
    const activity = await agent.get(`/api/v1${api}/tasks/${c.id}/activity`).expect(200);
    const statusChanges = activity.body.data
      .flatMap((entry: { changes: { field: string; to: string }[] | null }) => entry.changes ?? [])
      .filter((change: { field: string }) => change.field === "status")
      .map((change: { to: string }) => change.to);
    expect(statusChanges).toEqual(["Todo", "Done"]);

    // A column of another project: 400 STATUS_NOT_IN_PROJECT.
    const other = await newProject(agent, slug);
    const wrong = await post(agent, `${api}/tasks/${c.id}/move`, {
      statusId: other.status("Todo"),
      version: back.body.data.version,
    }).expect(400);
    expect(wrong.body.error.code).toBe("STATUS_NOT_IN_PROJECT");
  });

  it("answers 409 with the current task for a stale version, and logs inline edits", async () => {
    const { agent, slug, project, api } = await setup();
    const task = await newTask(agent, slug, project.id);
    const first = await patch(agent, `${api}/tasks/${task.id}`, {
      priority: "URGENT",
      version: task.version,
    }).expect(200);
    expect(first.body.data).toMatchObject({ priority: "URGENT", version: task.version + 1 });

    const stale = await patch(agent, `${api}/tasks/${task.id}`, {
      title: "Old view",
      version: task.version,
    }).expect(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect(stale.body.error.details.current).toMatchObject({ id: task.id, priority: "URGENT" });

    const activity = await agent.get(`/api/v1${api}/tasks/${task.id}/activity`).expect(200);
    expect(activity.body.data[0].changes).toEqual([
      { field: "priority", from: "MEDIUM", to: "URGENT" },
    ]);

    const dates = await patch(agent, `${api}/tasks/${task.id}`, {
      startDate: "2026-12-10",
      dueDate: "2026-12-01",
      version: first.body.data.version,
    }).expect(400);
    expect(dates.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("subtasks, links, trash and copies (AC-TASK-03)", SLOW, () => {
  it("rejects dependency loops and shows open blockers", async () => {
    const { agent, slug, project, api } = await setup();
    const [a, b, c] = [
      await newTask(agent, slug, project.id, { title: "A" }),
      await newTask(agent, slug, project.id, { title: "B" }),
      await newTask(agent, slug, project.id, { title: "C" }),
    ] as [Task, Task, Task];
    // A blocks B, B blocks C.
    await post(agent, `${api}/tasks/${b.id}/dependencies`, {
      otherTaskId: a.id,
      direction: "BLOCKED_BY",
    }).expect(201);
    const chain = await post(agent, `${api}/tasks/${b.id}/dependencies`, {
      otherTaskId: c.id,
      direction: "BLOCKS",
    }).expect(201);
    expect(chain.body.data.blockedBy.map((t: Task) => t.key)).toEqual([a.key]);
    expect(chain.body.data.blocks.map((t: Task) => t.key)).toEqual([c.key]);
    expect(chain.body.data.openBlockerCount).toBe(1);

    for (const [taskId, otherTaskId] of [
      [a.id, b.id],
      [a.id, c.id],
    ] as const) {
      const loop = await post(agent, `${api}/tasks/${taskId}/dependencies`, {
        otherTaskId,
        direction: "BLOCKED_BY",
      }).expect(409);
      expect(loop.body.error.code).toBe("DEPENDENCY_CYCLE");
    }
  });

  it("keeps subtasks one level deep, deletes and restores them with the parent, and duplicates", async () => {
    const { agent, slug, project, api } = await setup();
    const parent = await newTask(agent, slug, project.id, { title: "Parent" });
    const child = await newTask(agent, slug, project.id, {
      title: "Child",
      parentTaskId: parent.id,
    });
    await newTask(agent, slug, project.id, {
      title: "Done child",
      parentTaskId: parent.id,
      statusId: project.status("Done"),
    });
    const deep = await post(agent, `${api}/projects/${project.id}/tasks`, {
      title: "Grandchild",
      parentTaskId: child.id,
    }).expect(400);
    expect(deep.body.error.code).toBe("MAX_DEPTH");

    const detail = await agent.get(`/api/v1${api}/tasks/${parent.id}`).expect(200);
    expect(detail.body.data).toMatchObject({ subtaskCount: 2, doneSubtaskCount: 1 });
    const byKey = await agent
      .get(`/api/v1${api}/workspaces/general/tasks/by-key/${parent.key.toLowerCase()}`)
      .expect(200);
    expect(byKey.body.data.id).toBe(parent.id);

    const copy = await post(agent, `${api}/tasks/${parent.id}/duplicate`).expect(201);
    expect(copy.body.data).toMatchObject({ title: "Parent (copy)", subtaskCount: 2 });

    await client.del(agent, `${api}/tasks/${parent.id}`).expect(200);
    await agent.get(`/api/v1${api}/tasks/${child.id}`).expect(404);
    const trash = await agent.get(`/api/v1${api}/projects/${project.id}/tasks/trash`).expect(200);
    expect(trash.body.data.map((t: Task) => t.key)).toEqual([parent.key]);
    await post(agent, `${api}/tasks/${parent.id}/restore`).expect(200);
    await agent.get(`/api/v1${api}/tasks/${child.id}`).expect(200);
  });
});

describe("bulk changes, columns and the board (AC-TASK-06, AC-VIEW-02, AC-VIEW-05)", SLOW, () => {
  it("changes 100 tasks in one request and refuses 101", async () => {
    const { agent, project, api, userId } = await setup();
    const ids = await insertTasks(project.id, project.status("Todo"), userId, 101);
    const path = `${api}/projects/${project.id}/tasks/bulk`;
    const tooMany = await post(agent, path, { taskIds: ids, set: { priority: "HIGH" } }).expect(
      400,
    );
    expect(tooMany.body.error.code).toBe("VALIDATION_ERROR");

    const hundred = ids.slice(0, 100);
    const result = await post(agent, path, {
      taskIds: hundred,
      set: { priority: "HIGH", statusId: project.status("Done") },
    }).expect(200);
    expect(result.body.data.updated).toBe(100);
    const done = await prisma.task.count({
      where: {
        id: { in: hundred },
        priority: "HIGH",
        statusId: project.status("Done"),
        completedAt: { not: null },
      },
    });
    expect(done).toBe(100);
    const history = await prisma.activityLog.count({
      where: { entityType: "task", entityId: { in: hundred }, action: "task.updated" },
    });
    expect(history).toBe(100);
  });

  it("adds and removes labels and people for several tasks at once", async () => {
    const { agent, project, api, userId } = await setup();
    const label = await post(agent, `${api}/workspaces/general/labels`, {
      name: "Bug",
      color: "#DC2626",
    }).expect(201);
    const ids = await insertTasks(project.id, project.status("Todo"), userId, 3);
    const bulk = `${api}/projects/${project.id}/tasks/bulk`;
    const list = () => agent.get(`/api/v1${api}/projects/${project.id}/tasks`).expect(200);

    await post(agent, bulk, {
      taskIds: ids,
      set: { addLabelIds: [label.body.data.id], addAssigneeIds: [userId] },
    }).expect(200);
    for (const task of (await list()).body.data) {
      expect(task.labels.map((l: { name: string }) => l.name)).toEqual(["Bug"]);
      expect(task.assignees).toHaveLength(1);
    }

    await post(agent, bulk, {
      taskIds: ids,
      set: { removeLabelIds: [label.body.data.id], removeAssigneeIds: [userId] },
    }).expect(200);
    for (const task of (await list()).body.data) {
      expect(task.labels).toEqual([]);
      expect(task.assignees).toEqual([]);
    }

    // Someone outside the project cannot be assigned, and nothing changes.
    const outsider = await verifiedUser();
    const refused = await post(agent, bulk, {
      taskIds: ids,
      set: { addAssigneeIds: [outsider.userId] },
    }).expect(400);
    expect(refused.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("moves a deleted column's tasks and pages columns over 200 cards", async () => {
    const { agent, slug, project, api, userId } = await setup();
    const review = await newTask(agent, slug, project.id, {
      statusId: project.status("In Review"),
    });
    const columns = `${api}/projects/${project.id}/statuses`;
    await agent
      .delete(`/api/v1${columns}/${project.status("In Review")}`)
      .set("X-Requested-With", "NexusFlow")
      .send({ targetStatusId: project.status("Blocked") })
      .expect(200);
    const moved = await agent.get(`/api/v1${api}/tasks/${review.id}`).expect(200);
    expect(moved.body.data.status.name).toBe("Blocked");

    await insertTasks(project.id, project.status("Backlog"), userId, 205);
    const board = await agent.get(`/api/v1${api}/projects/${project.id}/board`).expect(200);
    const backlog = board.body.data[0];
    expect(backlog).toMatchObject({ total: 205 });
    expect(backlog.tasks).toHaveLength(200);
    const more = await agent
      .get(`/api/v1${api}/projects/${project.id}/tasks`)
      .query({
        statusId: project.status("Backlog"),
        parentTaskId: "null",
        sort: "position",
        cursor: backlog.nextCursor,
        limit: 200,
      })
      .expect(200);
    expect(more.body.data).toHaveLength(5);
    expect(more.body.meta.nextCursor).toBeNull();
  });
});

describe("who may do what, filters and My Tasks (AC-TASK-07, AC-TASK-08)", SLOW, () => {
  it("lets viewers read but not write, and keeps guests to their own projects", async () => {
    const { agent, slug, project, api, userId } = await setup();
    const task = await newTask(agent, slug, project.id);
    const viewer = await joinedMember(agent, slug);
    await viewer.agent.get(`/api/v1${api}/tasks/${task.id}`).expect(200);
    await post(viewer.agent, `${api}/projects/${project.id}/tasks`, { title: "No" }).expect(403);
    await patch(viewer.agent, `${api}/tasks/${task.id}`, { title: "No", version: 1 }).expect(403);
    const assignViewer = await patch(agent, `${api}/tasks/${task.id}`, {
      assigneeIds: [viewer.userId],
      version: task.version,
    }).expect(400);
    expect(assignViewer.body.error.code).toBe("VALIDATION_ERROR");

    const guest = await joinedMember(agent, slug, "GUEST");
    await post(agent, `${api}/projects/${project.id}/members`, {
      userId: guest.userId,
      role: "CONTRIBUTOR",
    }).expect(201);
    const guestTask = await newTask(guest.agent, slug, project.id, { assigneeIds: [userId] });
    expect(guestTask.number).toBe(2);
    const other = await newProject(agent, slug);
    const hidden = await newTask(agent, slug, other.id);
    await guest.agent.get(`/api/v1${api}/tasks/${hidden.id}`).expect(404);
    await guest.agent.get(`/api/v1${api}/projects/${other.id}/tasks`).expect(404);
  });

  it("filters my overdue tasks in my time zone and groups My Tasks", async () => {
    const { agent, slug, project, api, userId } = await setup();
    const today = todayIn("UTC");
    const mine = { assigneeIds: [userId] };
    const late = await newTask(agent, slug, project.id, {
      ...mine,
      title: "Late",
      dueDate: addDays(today, -1),
    });
    await newTask(agent, slug, project.id, { ...mine, title: "Soon", dueDate: addDays(today, 30) });
    await newTask(agent, slug, project.id, {
      ...mine,
      title: "Late but done",
      dueDate: addDays(today, -2),
      statusId: project.status("Done"),
    });
    await newTask(agent, slug, project.id, {
      title: "Late, nobody's",
      dueDate: addDays(today, -1),
    });

    const filtered = await agent
      .get(`/api/v1${api}/projects/${project.id}/tasks`)
      .query({ assigneeId: "me", overdue: "true" })
      .expect(200);
    expect(filtered.body.data.map((t: Task) => t.key)).toEqual([late.key]);

    const my = await agent.get(`/api/v1${api}/workspaces/general/my-tasks`).expect(200);
    expect(
      my.body.data.tasks.map((t: { title: string; group: string }) => [t.title, t.group]),
    ).toEqual([
      ["Late", "OVERDUE"],
      ["Soon", "LATER"],
    ]);
    expect(my.body.data.projects[0].statuses).toHaveLength(6);
  });
});

describe("tenant isolation", SLOW, () => {
  it("answers 404 for every task address of another organization", async () => {
    const { agent, slug, project, api } = await setup();
    const task = await newTask(agent, slug, project.id);
    const outsider = await verifiedUser();
    const ownSlug = await createOrg(outsider.agent);
    const send = (method: "get" | "post" | "patch" | "delete", path: string, body: object = {}) =>
      outsider.agent[method](`/api/v1${path}`).set("X-Requested-With", "NexusFlow").send(body);

    const attempts = {
      list: send("get", `${api}/projects/${project.id}/tasks`),
      create: send("post", `${api}/projects/${project.id}/tasks`, { title: "x" }),
      board: send("get", `${api}/projects/${project.id}/board`),
      assignable: send("get", `${api}/projects/${project.id}/assignable`),
      bulk: send("post", `${api}/projects/${project.id}/tasks/bulk`, {
        taskIds: [task.id],
        action: "delete",
      }),
      trash: send("get", `${api}/projects/${project.id}/tasks/trash`),
      byKey: send("get", `${api}/workspaces/general/tasks/by-key/${task.key}`),
      myTasks: send("get", `${api}/workspaces/general/my-tasks`),
      read: send("get", `${api}/tasks/${task.id}`),
      update: send("patch", `${api}/tasks/${task.id}`, { title: "x", version: 1 }),
      remove: send("delete", `${api}/tasks/${task.id}`),
      move: send("post", `${api}/tasks/${task.id}/move`, { statusId: task.status.id, version: 1 }),
      restore: send("post", `${api}/tasks/${task.id}/restore`),
      duplicate: send("post", `${api}/tasks/${task.id}/duplicate`),
      activity: send("get", `${api}/tasks/${task.id}/activity`),
      link: send("post", `${api}/tasks/${task.id}/dependencies`, {
        otherTaskId: task.id,
        direction: "BLOCKS",
      }),
      unlink: send("delete", `${api}/tasks/${task.id}/dependencies/${task.id}`),
      // Through the outsider's own organization: still not found.
      viaOwnOrg: send("get", `/orgs/${ownSlug}/tasks/${task.id}`),
    };
    for (const [name, attempt] of Object.entries(attempts)) {
      const response = await attempt;
      expect(response.status, name).toBe(404);
    }
  });
});
