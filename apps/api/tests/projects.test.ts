import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.ts";
import { createTestClient } from "./helpers/http.ts";
import { orgHelpers } from "./helpers/orgs.ts";

// Teams, projects, columns, milestones, labels and the trash (PRD §11.4,
// §11.5, §12.3, §12.4). Tasks arrive in Phase 5, so tests that need one
// insert it directly.
const client = createTestClient("project-test.example");
const { post, patch, put, del } = client;
const { verifiedUser, createOrg, joinedMember } = orgHelpers(client);
type Agent = ReturnType<typeof client.newAgent>;

const SLOW = { timeout: 240_000 };
let keyCounter = 0;
const nextKey = () =>
  `P${(++keyCounter).toString(36).toUpperCase()}${Date.now() % 1000}`.slice(0, 6);

afterAll(async () => {
  await client.cleanup();
  await prisma.$disconnect();
});

async function ownerWithOrg() {
  const owner = await verifiedUser();
  const slug = await createOrg(owner.agent);
  return { ...owner, slug };
}

async function newProject(agent: Agent, slug: string, body: object = {}) {
  const response = await post(agent, `/orgs/${slug}/workspaces/general/projects`, {
    name: "Website",
    key: nextKey(),
    ...body,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.data as { id: string; key: string; status: string };
}

/** Phase 5 creates tasks through the API; until then, insert one directly. */
async function insertTask(projectId: string, statusName: string, reporterId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const status = await prisma.taskStatus.findFirstOrThrow({
    where: { projectId, name: statusName },
  });
  const number = project.taskSequence + 1;
  await prisma.project.update({ where: { id: projectId }, data: { taskSequence: number } });
  return prisma.task.create({
    data: {
      organizationId: project.organizationId,
      projectId,
      number,
      title: `Task ${number}`,
      statusId: status.id,
      reporterId,
      createdById: reporterId,
      position: `a${number}`,
    },
  });
}

describe("projects (AC-PROJ-01 to 05)", SLOW, () => {
  it("seeds six columns, makes the creator a manager and allows 3 active projects on FREE", async () => {
    const { agent, slug, userId } = await ownerWithOrg();
    const first = await newProject(agent, slug, { name: "NexusFlow Web App" });

    const statuses = await agent
      .get(`/api/v1/orgs/${slug}/projects/${first.id}/statuses`)
      .expect(200);
    expect(
      statuses.body.data.map((s: { name: string; category: string }) => [s.name, s.category]),
    ).toEqual([
      ["Backlog", "BACKLOG"],
      ["Todo", "TODO"],
      ["In Progress", "IN_PROGRESS"],
      ["In Review", "IN_REVIEW"],
      ["Blocked", "BLOCKED"],
      ["Done", "DONE"],
    ]);
    expect(statuses.body.data.find((s: { isDefault: boolean }) => s.isDefault).name).toBe("Todo");
    const members = await agent
      .get(`/api/v1/orgs/${slug}/projects/${first.id}/members`)
      .expect(200);
    expect(members.body.data).toEqual([
      expect.objectContaining({ userId, role: "PROJECT_MANAGER", isOwner: true }),
    ]);

    const taken = await post(agent, `/orgs/${slug}/workspaces/general/projects`, {
      name: "Again",
      key: first.key,
    }).expect(409);
    expect(taken.body.error.code).toBe("KEY_TAKEN");

    await newProject(agent, slug);
    await newProject(agent, slug);
    const fourth = await post(agent, `/orgs/${slug}/workspaces/general/projects`, {
      name: "Fourth",
      key: nextKey(),
    }).expect(402);
    expect(fourth.body.error.details).toMatchObject({
      limit: "maxActiveProjectsPerWorkspace",
      current: 3,
      max: 3,
    });

    // Archiving frees a slot; restoring would go over the limit again.
    await post(agent, `/orgs/${slug}/projects/${first.id}/archive`).expect(200);
    await newProject(agent, slug);
    await post(agent, `/orgs/${slug}/projects/${first.id}/restore`).expect(402);
  });

  it("locks the key after the first task and keeps archived projects read-only", async () => {
    const { agent, slug, userId } = await ownerWithOrg();
    const project = await newProject(agent, slug, { status: "ACTIVE" });
    const path = `/orgs/${slug}/projects/${project.id}`;

    const renamed = await patch(agent, path, { key: "NEWKEY" }).expect(200);
    expect(renamed.body.data).toMatchObject({ key: "NEWKEY", keyLocked: false });
    await insertTask(project.id, "Todo", userId);
    const locked = await patch(agent, path, { key: "OTHER" }).expect(409);
    expect(locked.body.error.code).toBe("KEY_LOCKED");

    const archived = await post(agent, `${path}/archive`).expect(200);
    expect(archived.body.data.status).toBe("ARCHIVED");
    const blocked = await patch(agent, path, { name: "Renamed" }).expect(409);
    expect(blocked.body.error.code).toBe("PROJECT_ARCHIVED");
    const restored = await post(agent, `${path}/restore`).expect(200);
    expect(restored.body.data.status).toBe("ACTIVE");
    expect(restored.body.data).toMatchObject({ taskCount: 1, progress: 0 });
  });

  it("lets workspace members view WORKSPACE projects but never PRIVATE ones", async () => {
    const { agent, slug } = await ownerWithOrg();
    const open = await newProject(agent, slug, { name: "Open" });
    const hidden = await newProject(agent, slug, { name: "Hidden", visibility: "PRIVATE" });
    const member = await joinedMember(agent, slug);

    const seen = await member.agent.get(`/api/v1/orgs/${slug}/projects/${open.id}`).expect(200);
    expect(seen.body.data.access).toMatchObject({ role: "VIEWER", canManage: false });
    await patch(member.agent, `/orgs/${slug}/projects/${open.id}`, { name: "Mine" }).expect(403);
    await member.agent.get(`/api/v1/orgs/${slug}/projects/${hidden.id}`).expect(404);
    const list = await member.agent
      .get(`/api/v1/orgs/${slug}/workspaces/general/projects`)
      .expect(200);
    expect(list.body.data.map((p: { id: string }) => p.id)).toEqual([open.id]);

    await post(agent, `/orgs/${slug}/projects/${hidden.id}/members`, {
      userId: member.userId,
      role: "CONTRIBUTOR",
    }).expect(201);
    const shared = await member.agent.get(`/api/v1/orgs/${slug}/projects/${hidden.id}`).expect(200);
    expect(shared.body.data.access.role).toBe("CONTRIBUTOR");
  });
});

describe("columns and milestones", SLOW, () => {
  it("adds, reorders, renames and deletes columns, moving their tasks", async () => {
    const { agent, slug, userId } = await ownerWithOrg();
    const project = await newProject(agent, slug);
    const path = `/orgs/${slug}/projects/${project.id}/statuses`;
    const task = await insertTask(project.id, "Blocked", userId);

    const added = await post(agent, path, {
      name: "QA",
      color: "#0EA5E9",
      category: "IN_REVIEW",
    }).expect(201);
    expect(added.body.data).toHaveLength(7);
    await post(agent, path, { name: "QA", color: "#0EA5E9", category: "IN_REVIEW" }).expect(409);
    const byName = (list: { id: string; name: string }[], name: string) =>
      list.find((s) => s.name === name) as { id: string; name: string };

    const reversed = [...added.body.data].reverse().map((s: { id: string }) => s.id);
    const reordered = await put(agent, `${path}/reorder`, { statusIds: reversed }).expect(200);
    expect(reordered.body.data[0].name).toBe("QA");

    const qa = byName(added.body.data, "QA");
    const defaulted = await patch(agent, `${path}/${qa.id}`, { isDefault: true }).expect(200);
    expect(defaulted.body.data.filter((s: { isDefault: boolean }) => s.isDefault)).toEqual([
      expect.objectContaining({ name: "QA" }),
    ]);

    const blocked = byName(added.body.data, "Blocked");
    const done = byName(added.body.data, "Done");
    const removed = await del(agent, `${path}/${blocked.id}`)
      .send({ targetStatusId: done.id })
      .expect(200);
    expect(removed.body.data.movedTasks).toBe(1);
    const moved = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(moved.statusId).toBe(done.id);
    expect(moved.completedAt).not.toBeNull();

    const project2 = await agent.get(`/api/v1/orgs/${slug}/projects/${project.id}`).expect(200);
    expect(project2.body.data).toMatchObject({ taskCount: 1, doneTaskCount: 1, progress: 100 });
  });

  it("creates, completes and deletes milestones", async () => {
    const { agent, slug } = await ownerWithOrg();
    const project = await newProject(agent, slug);
    const path = `/orgs/${slug}/projects/${project.id}/milestones`;

    const created = await post(agent, path, { name: "Beta", dueDate: "2020-01-31" }).expect(201);
    const beta = created.body.data[0];
    expect(beta).toMatchObject({
      name: "Beta",
      dueDate: "2020-01-31",
      status: "OPEN",
      overdue: true,
    });
    const completed = await patch(agent, `${path}/${beta.id}`, { status: "COMPLETED" }).expect(200);
    expect(completed.body.data[0]).toMatchObject({ status: "COMPLETED", overdue: false });
    const deleted = await del(agent, `${path}/${beta.id}`).expect(200);
    expect(deleted.body.data).toEqual([]);
  });
});

describe("teams (AC-TEAM-01 to 03)", SLOW, () => {
  it("only leads and workspace admins manage members; team members reach team projects", async () => {
    const { agent, slug, userId } = await ownerWithOrg();
    const first = await joinedMember(agent, slug);
    const second = await joinedMember(agent, slug);
    const team = await post(agent, `/orgs/${slug}/workspaces/general/teams`, {
      name: "Design",
      slug: "design",
      leadId: userId,
    }).expect(201);
    const teamPath = `/orgs/${slug}/teams/${team.body.data.id}`;
    await post(agent, `${teamPath}/members`, { userId: first.userId }).expect(201);

    // AC-TEAM-01: a plain team member cannot add people.
    await post(first.agent, `${teamPath}/members`, { userId: second.userId }).expect(403);

    // AC-TEAM-02: joining the team opens its PRIVATE projects; leaving closes them.
    const project = await newProject(agent, slug, {
      visibility: "PRIVATE",
      teamId: team.body.data.id,
    });
    const projectPath = `/api/v1/orgs/${slug}/projects/${project.id}`;
    await second.agent.get(projectPath).expect(404);
    await post(agent, `${teamPath}/members`, { userId: second.userId }).expect(201);
    const opened = await second.agent.get(projectPath).expect(200);
    expect(opened.body.data.access.role).toBe("CONTRIBUTOR");
    await del(agent, `${teamPath}/members/${second.userId}`).expect(200);
    await second.agent.get(projectPath).expect(404);

    // A lead may manage members; the last lead cannot step down.
    await patch(agent, `${teamPath}/members/${first.userId}`, { role: "LEAD" }).expect(200);
    await post(first.agent, `${teamPath}/members`, { userId: second.userId }).expect(201);
    await patch(agent, `${teamPath}/members/${userId}`, { role: "MEMBER" }).expect(200);
    const last = await patch(agent, `${teamPath}/members/${first.userId}`, {
      role: "MEMBER",
    }).expect(409);
    expect(last.body.error.code).toBe("LAST_LEAD");
  });

  it("deleting a team moves its projects to the workspace or archives them", async () => {
    const { agent, slug, userId } = await ownerWithOrg();
    const makeTeam = async (name: string) =>
      (
        await post(agent, `/orgs/${slug}/workspaces/general/teams`, {
          name,
          slug: name.toLowerCase(),
          leadId: userId,
        }).expect(201)
      ).body.data.id as string;
    const keep = await makeTeam("Alpha");
    const shelve = await makeTeam("Bravo");
    const moved = await newProject(agent, slug, { teamId: keep, status: "ACTIVE" });
    const archived = await newProject(agent, slug, { teamId: shelve, status: "ACTIVE" });

    await del(agent, `/orgs/${slug}/teams/${keep}`).send({ projectsAction: "move" }).expect(200);
    await del(agent, `/orgs/${slug}/teams/${shelve}`)
      .send({ projectsAction: "archive" })
      .expect(200);

    const a = await prisma.project.findUniqueOrThrow({ where: { id: moved.id } });
    const b = await prisma.project.findUniqueOrThrow({ where: { id: archived.id } });
    expect(a).toMatchObject({ teamId: null, status: "ACTIVE" });
    expect(b).toMatchObject({ teamId: null, status: "ARCHIVED", previousStatus: "ACTIVE" });
    const teams = await agent.get(`/api/v1/orgs/${slug}/workspaces/general/teams`).expect(200);
    expect(teams.body.data).toEqual([]);
  });
});

describe("labels and the trash", SLOW, () => {
  it("lets admins and project managers manage labels, but not other members", async () => {
    const { agent, slug } = await ownerWithOrg();
    const member = await joinedMember(agent, slug);
    const path = `/orgs/${slug}/workspaces/general/labels`;

    const bug = await post(agent, path, { name: "Bug", color: "#DC2626" }).expect(201);
    await post(agent, path, { name: "Bug", color: "#DC2626" }).expect(409);
    await post(member.agent, path, { name: "Mine", color: "#16A34A" }).expect(403);
    const list = await member.agent.get(`/api/v1${path}`).expect(200);
    expect(list.body).toMatchObject({ data: [{ name: "Bug" }], meta: { canManage: false } });

    // A member who manages a project may manage labels too.
    await newProject(member.agent, slug);
    await post(member.agent, path, { name: "Mine", color: "#16A34A" }).expect(201);
    await patch(agent, `/orgs/${slug}/labels/${bug.body.data.id}`, { color: "#B91C1C" }).expect(
      200,
    );
    await del(agent, `/orgs/${slug}/labels/${bug.body.data.id}`).expect(200);
  });

  it("deleted projects disappear, wait in the trash and can be restored", async () => {
    const { agent, slug } = await ownerWithOrg();
    const project = await newProject(agent, slug);
    await del(agent, `/orgs/${slug}/projects/${project.id}`).expect(200);
    await agent.get(`/api/v1/orgs/${slug}/projects/${project.id}`).expect(404);

    const trash = await agent.get(`/api/v1/orgs/${slug}/trash`).expect(200);
    expect(trash.body.data).toEqual([expect.objectContaining({ id: project.id })]);
    await post(agent, `/orgs/${slug}/projects/${project.id}/undelete`).expect(200);
    const list = await agent.get(`/api/v1/orgs/${slug}/workspaces/general/projects`).expect(200);
    expect(list.body.data.map((p: { id: string }) => p.id)).toEqual([project.id]);
  });
});

describe("tenant isolation (PRD §20.4)", SLOW, () => {
  it("answers 404 to outsiders on every project, team and label endpoint", async () => {
    const { agent, slug, userId } = await ownerWithOrg();
    const project = await newProject(agent, slug);
    const team = await post(agent, `/orgs/${slug}/workspaces/general/teams`, {
      name: "Core",
      slug: "core",
      leadId: userId,
    }).expect(201);
    const label = await post(agent, `/orgs/${slug}/workspaces/general/labels`, {
      name: "Bug",
      color: "#DC2626",
    }).expect(201);

    // The outsider has their own organization and tries both its address and ours.
    const outsider = await ownerWithOrg();
    for (const org of [slug, outsider.slug]) {
      const p = `/orgs/${org}/projects/${project.id}`;
      const t = `/orgs/${org}/teams/${team.body.data.id}`;
      const get = (path: string) => outsider.agent.get(`/api/v1${path}`);
      const attempts = {
        "GET project": get(p),
        "PATCH project": patch(outsider.agent, p, { name: "Hacked" }),
        "DELETE project": del(outsider.agent, p),
        "archive project": post(outsider.agent, `${p}/archive`),
        "project members": get(`${p}/members`),
        "project statuses": get(`${p}/statuses`),
        "project milestones": get(`${p}/milestones`),
        "project activity": get(`${p}/activity`),
        "GET team": get(t),
        "PATCH team": patch(outsider.agent, t, { name: "Hacked" }),
        "team members": get(`${t}/members`),
        "PATCH label": patch(outsider.agent, `/orgs/${org}/labels/${label.body.data.id}`, {
          name: "Hacked",
        }),
      };
      for (const [name, attempt] of Object.entries(attempts)) {
        expect((await attempt).status, `${name} via /orgs/${org}`).toBe(404);
      }
    }
    const intact = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(intact.name).toBe("Website");
  });
});
