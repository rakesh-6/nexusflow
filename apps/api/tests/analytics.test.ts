import { addDays, freshPositions } from "@nexusflow/shared";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.ts";
import { createTestClient } from "./helpers/http.ts";
import { orgHelpers } from "./helpers/orgs.ts";

// Dashboard numbers and search (PRD §11.12, §11.13, AC-DASH-01…05, AC-SRCH-01, 02, 04).
const client = createTestClient("insights-test.example");
const { post } = client;
const { verifiedUser, createOrg, joinedMember } = orgHelpers(client);

const SLOW = { timeout: 300_000 };
const today = new Date().toISOString().slice(0, 10);
const at = (date: string) => new Date(`${date}T12:00:00Z`);

afterAll(async () => {
  await client.cleanup();
  await prisma.$disconnect();
});

interface Spec {
  status: "Todo" | "In Progress" | "Done";
  dueDate?: string;
  completedOn?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  title?: string;
}

/** Puts tasks straight into the database with known states (the fixture). */
async function addTasks(projectId: string, reporterId: string, specs: Spec[]) {
  const project = await prisma.project.update({
    where: { id: projectId },
    data: { taskSequence: { increment: specs.length } },
  });
  const statuses = await prisma.taskStatus.findMany({ where: { projectId } });
  const first = project.taskSequence - specs.length + 1;
  const positions = freshPositions(specs.length);
  await prisma.task.createMany({
    data: specs.map((spec, index) => ({
      organizationId: project.organizationId,
      projectId,
      number: first + index,
      title: spec.title ?? `Fixture ${first + index}`,
      statusId: statuses.find((status) => status.name === spec.status)?.id ?? "",
      priority: spec.priority ?? "MEDIUM",
      dueDate: spec.dueDate ? new Date(`${spec.dueDate}T00:00:00Z`) : null,
      completedAt: spec.completedOn ? at(spec.completedOn) : null,
      reporterId,
      createdById: reporterId,
      position: positions[index] as string,
    })),
  });
}

let keyCounter = 0;
async function fixture() {
  const owner = await verifiedUser();
  const slug = await createOrg(owner.agent);
  const api = `/orgs/${slug}`;
  const project = async (name: string) => {
    const response = await post(owner.agent, `${api}/workspaces/general/projects`, {
      name,
      key: `A${(++keyCounter).toString(36).toUpperCase()}${Date.now() % 1000}`.slice(0, 6),
      visibility: "PRIVATE",
    }).expect(201);
    return response.body.data as { id: string; key: string };
  };
  const [alpha, beta, gamma] = [
    await project("Alpha"),
    await project("Beta"),
    await project("Gamma"),
  ];
  await addTasks(alpha.id, owner.userId, [
    { status: "Done", completedOn: today },
    { status: "Done", completedOn: today },
    { status: "Todo", dueDate: addDays(today, -1), priority: "URGENT" },
    { status: "Todo" },
  ]);
  await addTasks(beta.id, owner.userId, [
    { status: "Done", completedOn: addDays(today, -10) },
    { status: "In Progress", dueDate: addDays(today, 2) },
    { status: "In Progress" },
  ]);
  await addTasks(gamma.id, owner.userId, [{ status: "Todo" }, { status: "Todo" }]);
  return { owner, slug, api, alpha, beta, gamma };
}

describe("dashboard numbers (AC-DASH-01…05)", SLOW, () => {
  it("matches the fixture, follows the range and the person's access", async () => {
    const { owner, slug, api, beta } = await fixture();
    const insights = `/api/v1${api}/workspaces/general/analytics`;

    // AC-DASH-01: every tile equals the fixture (3 projects, 9 tasks).
    const all = (await owner.agent.get(insights).expect(200)).body.data;
    expect(all.tiles).toEqual({
      totalProjects: 3,
      activeProjects: 0,
      completedProjects: 0,
      totalTasks: 9,
      pendingTasks: 6,
      overdueTasks: 1,
      completedTasks: 3,
      completedInRange: 3,
    });
    expect(
      all.byPriority.find((row: { priority: string }) => row.priority === "URGENT").count,
    ).toBe(1);
    expect(
      all.projects.map((row: { name: string; progress: number }) => [row.name, row.progress]),
    ).toEqual([
      ["Alpha", 50],
      ["Beta", 33],
      ["Gamma", 0],
    ]);
    expect(all.upcoming).toHaveLength(1);

    // AC-DASH-02: a shorter range changes the trend, not the totals.
    const todayOnly = (
      await owner.agent.get(insights).query({ from: today, to: today }).expect(200)
    ).body.data;
    expect(todayOnly.tiles.completedInRange).toBe(2);
    expect(todayOnly.tiles.totalTasks).toBe(9);
    expect(todayOnly.trend).toEqual([{ date: today, completed: 2, created: 9 }]);

    // AC-DASH-03: a member who can open one project sees only that project.
    const member = await joinedMember(owner.agent, slug);
    await post(owner.agent, `${api}/projects/${beta.id}/members`, {
      userId: member.userId,
      role: "CONTRIBUTOR",
    }).expect(201);
    const theirs = (await member.agent.get(insights).expect(200)).body.data;
    expect(theirs.tiles).toMatchObject({ totalProjects: 1, totalTasks: 3, completedTasks: 1 });

    // AC-DASH-04: FREE organizations look back 30 days at most.
    const longAgo = await owner.agent
      .get(insights)
      .query({ from: addDays(today, -89) })
      .expect(402);
    expect(longAgo.body.error.details).toMatchObject({ limit: "analyticsHistoryDays" });

    // AC-DASH-05: an unfinished project past its end date is off track.
    await prisma.project.update({
      where: { id: beta.id },
      data: { startDate: at(addDays(today, -20)), endDate: at(addDays(today, -1)) },
    });
    const health = (await owner.agent.get(insights).query({ projectId: beta.id }).expect(200)).body
      .data;
    expect(health.projects).toEqual([
      expect.objectContaining({ name: "Beta", health: "OFF_TRACK" }),
    ]);
  });
});

describe("search (AC-SRCH-01, 02, 04)", SLOW, () => {
  it("finds tasks by key, hides other people's projects and filters a whole workspace", async () => {
    const { owner, slug, api, alpha, gamma } = await fixture();
    await addTasks(alpha.id, owner.userId, [
      { status: "Todo", title: "Polish the launch checklist", priority: "URGENT", dueDate: today },
    ]);
    await addTasks(gamma.id, owner.userId, [
      { status: "Todo", title: "Launch party", priority: "URGENT", dueDate: addDays(today, -3) },
    ]);
    const find = (agent: typeof owner.agent, q: string) =>
      agent.get(`/api/v1${api}/search`).query({ q }).expect(200);

    // AC-SRCH-01: the key first, also typed loosely.
    const byKey = (await find(owner.agent, `${alpha.key}-5`)).body.data.task;
    expect(byKey.items[0].title.startsWith(`${alpha.key}-5 `)).toBe(true);
    const loose = (await find(owner.agent, `${alpha.key.toLowerCase()} 5`)).body.data.task;
    expect(loose.items[0].title.startsWith(`${alpha.key}-5 `)).toBe(true);
    const words = (await find(owner.agent, "launc")).body.data.task;
    expect(words.total).toBe(2);

    // AC-SRCH-02: a guest without the project finds nothing in it.
    const guest = await joinedMember(owner.agent, slug, "GUEST");
    const guestResults = (await find(guest.agent, "launch")).body.data;
    expect(guestResults.task.total).toBe(0);
    expect(guestResults.project.total).toBe(0);

    // AC-SRCH-04: the workspace-wide filter, one page at a time.
    const filter = (cursor?: string) =>
      owner.agent
        .get(`/api/v1${api}/workspaces/general/tasks`)
        .query({ priority: "URGENT", dueTo: today, limit: 1, ...(cursor ? { cursor } : {}) })
        .expect(200);
    const first = await filter();
    expect(first.body.data).toHaveLength(1);
    expect(first.body.meta.nextCursor).not.toBeNull();
    const second = await filter(first.body.meta.nextCursor);
    const titles = [first.body.data[0].title, second.body.data[0].title].sort();
    // The overdue URGENT task of the fixture, the party and the checklist (due today).
    expect(titles.length).toBe(2);
    const everything = await owner.agent
      .get(`/api/v1${api}/workspaces/general/tasks`)
      .query({ priority: "URGENT", dueTo: today })
      .expect(200);
    expect(everything.body.data).toHaveLength(3);
  });
});
