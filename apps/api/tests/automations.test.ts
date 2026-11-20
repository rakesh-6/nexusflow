import { RECIPES } from "@nexusflow/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sentJobs } from "../src/lib/jobs.ts";
import { prisma } from "../src/lib/prisma.ts";
import {
  evaluateAutomations,
  startAutomationBridge,
  type EvaluateJob,
} from "../src/modules/automations/automations.engine.ts";
import { settleNotifications } from "../src/modules/notifications/notifications.service.ts";
import { createTestClient } from "./helpers/http.ts";
import { orgHelpers } from "./helpers/orgs.ts";

// Automation rules and their engine (PRD §11.15, AC-AUTO-01…04).
const client = createTestClient("automations-test.example");
const { post, patch } = client;
const { verifiedUser, createOrg, joinedMember } = orgHelpers(client);
type Agent = ReturnType<typeof client.newAgent>;

const SLOW = { timeout: 300_000 };
let stopBridge: () => void;
beforeAll(() => {
  stopBridge = startAutomationBridge();
});
afterAll(async () => {
  stopBridge();
  await client.cleanup();
  await prisma.$disconnect();
});

/** Jobs already run (the queue is shared by the whole file). */
let seen = 0;

/** Runs queued evaluations until rules stop setting off other rules. */
async function drain() {
  for (let round = 0; round < 10; round++) {
    const jobs = sentJobs.filter((job) => job.name === "automation.evaluate");
    const fresh = jobs.slice(seen);
    if (fresh.length === 0) break;
    seen = jobs.length;
    for (const job of fresh) await evaluateAutomations(job.data as unknown as EvaluateJob);
  }
  await settleNotifications();
}

async function setup({ plan = "PRO" as "FREE" | "PRO" } = {}) {
  const owner = await verifiedUser();
  const slug = await createOrg(owner.agent);
  const api = `/orgs/${slug}`;
  const organization = await prisma.organization.findUniqueOrThrow({ where: { slug } });
  await prisma.subscription.update({
    where: { organizationId: organization.id },
    data: { planTier: plan },
  });
  const project = await post(owner.agent, `${api}/workspaces/general/projects`, {
    name: "Automated",
    key: `A${Date.now() % 100000}`.slice(0, 6),
  }).expect(201);
  const projectId = project.body.data.id as string;
  const statuses = await prisma.taskStatus.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
  });
  const column = (category: string) => statuses.find((s) => s.category === category)!.id;
  return { owner, slug, api, projectId, column, organizationId: organization.id };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const rule = (context: Setup, body: object, agent: Agent = context.owner.agent) =>
  post(agent, `${context.api}/workspaces/general/automations`, {
    projectId: context.projectId,
    ...body,
  });

async function newTask(context: Setup, title = "A task") {
  const task = await post(
    context.owner.agent,
    `${context.api}/projects/${context.projectId}/tasks`,
    {
      title,
    },
  ).expect(201);
  return task.body.data.id as string;
}

/** Changes a task with the version it has now. */
async function change(context: Setup, taskId: string, body: object) {
  const { version } = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await patch(context.owner.agent, `${context.api}/tasks/${taskId}`, { ...body, version }).expect(
    200,
  );
}

const alerts = (userId: string, organizationId: string) =>
  prisma.notification.count({ where: { userId, organizationId, type: "AUTOMATION_ALERT" } });

const executions = (automationId: string) =>
  prisma.automationExecution.findMany({ where: { automationId }, orderBy: { startedAt: "asc" } });

describe("rules and plans (AC-AUTO-04)", SLOW, () => {
  it("refuses FREE organizations, and lets only managers create rules", async () => {
    const free = await setup({ plan: "FREE" });
    const recipe = RECIPES.find((r) => r.id === "notify-pm-on-done")!;
    const refused = await rule(free, { name: "Done", ...recipe.rule }).expect(402);
    expect(refused.body.error.code).toBe("PLAN_FEATURE_REQUIRED");

    const pro = await setup();
    const member = await joinedMember(pro.owner.agent, pro.slug);
    await rule(pro, { name: "Done", ...recipe.rule }, member.agent).expect(403); // not a manager
    const created = await rule(pro, { name: "Done", ...recipe.rule }).expect(201);
    expect(created.body.data.summary).toBe(
      "When a task is completed, then notify project managers.",
    );
    const listed = await pro.owner.agent
      .get(`/api/v1${pro.api}/workspaces/general/automations`)
      .expect(200);
    expect(listed.body.data).toHaveLength(1);
    const recipes = await pro.owner.agent.get(`/api/v1${pro.api}/automations/recipes`).expect(200);
    expect(recipes.body.data.length).toBeGreaterThanOrEqual(5);
  });
});

describe("running rules (AC-AUTO-01, 03)", SLOW, () => {
  it("notifies project managers only when a task is done, and dry-runs", async () => {
    const context = await setup();
    const recipe = RECIPES.find((r) => r.id === "notify-pm-on-done")!;
    const created = await rule(context, { name: "Done", ...recipe.rule }).expect(201);
    const automationId = created.body.data.id as string;
    const taskId = await newTask(context);
    const ownerId = context.owner.userId;

    await change(context, taskId, { statusId: context.column("IN_PROGRESS") });
    await drain();
    expect(await alerts(ownerId, context.organizationId)).toBe(0);

    const dry = await post(
      context.owner.agent,
      `${context.api}/automations/${automationId}/dry-run`,
      {
        taskId,
      },
    ).expect(200);
    expect(dry.body.data).toMatchObject({ matches: true, actions: ["Would: Notified 1 person"] });

    await change(context, taskId, { statusId: context.column("DONE") });
    await drain();
    expect(await alerts(ownerId, context.organizationId)).toBe(1);
    const log = await context.owner.agent
      .get(`/api/v1${context.api}/automations/${automationId}/executions`)
      .expect(200);
    expect(log.body.data).toEqual([
      expect.objectContaining({ status: "SUCCESS", result: ["Notified 1 person"] }),
    ]);
  });

  it("completes the project only when the last open task is done", async () => {
    const context = await setup();
    const recipe = RECIPES.find((r) => r.id === "auto-complete-project")!;
    await rule(context, { name: "Finish", ...recipe.rule }).expect(201);
    const first = await newTask(context, "First");
    const second = await newTask(context, "Second");
    const projectStatus = async () =>
      (await prisma.project.findUniqueOrThrow({ where: { id: context.projectId } })).status;

    await change(context, first, { statusId: context.column("DONE") });
    await drain();
    expect(await projectStatus()).not.toBe("COMPLETED");

    await change(context, second, { statusId: context.column("DONE") });
    await drain();
    expect(await projectStatus()).toBe("COMPLETED");

    // Reopening a task does not undo it (AC-AUTO-03).
    await change(context, second, { statusId: context.column("TODO") });
    await drain();
    expect(await projectStatus()).toBe("COMPLETED");
  });
});

describe("loop protection (AC-AUTO-02)", SLOW, () => {
  it("runs a self-triggering rule once and skips the second time", async () => {
    const context = await setup();
    const created = await rule(context, {
      name: "Bounce back",
      trigger: { type: "TASK_STATUS_CHANGED" },
      actions: [{ type: "SET_STATUS", category: "IN_REVIEW" }],
    }).expect(201);
    const taskId = await newTask(context);

    await change(context, taskId, { statusId: context.column("DONE") });
    await drain();
    const runs = await executions(created.body.data.id);
    expect(runs.map((run) => run.status)).toEqual(["SUCCESS", "SKIPPED"]);
    const task = await prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      include: { status: true },
    });
    expect(task.status.category).toBe("IN_REVIEW");
  });

  it("stops a chain of rules after 3 steps", async () => {
    const context = await setup();
    const make = async (name: string, trigger: object, action: object) =>
      (await rule(context, { name, trigger, actions: [action] }).expect(201)).body.data
        .id as string;
    const one = await make(
      "Step 1",
      { type: "TASK_CREATED" },
      { type: "SET_PRIORITY", priority: "HIGH" },
    );
    const two = await make(
      "Step 2",
      { type: "TASK_PRIORITY_CHANGED", to: "HIGH" },
      { type: "SET_STATUS", category: "IN_PROGRESS" },
    );
    const three = await make(
      "Step 3",
      { type: "TASK_STATUS_CHANGED", toCategory: "IN_PROGRESS" },
      { type: "SET_PRIORITY", priority: "URGENT" },
    );
    const four = await make(
      "Step 4",
      { type: "TASK_PRIORITY_CHANGED", to: "URGENT" },
      { type: "SET_STATUS", category: "IN_REVIEW" },
    );

    await newTask(context);
    await drain();
    const statuses = async (id: string) => (await executions(id)).map((run) => run.status);
    expect(await statuses(one)).toEqual(["SUCCESS"]);
    expect(await statuses(two)).toEqual(["SUCCESS"]);
    expect(await statuses(three)).toEqual(["SUCCESS"]);
    expect(await statuses(four)).toEqual(["SKIPPED"]);
  });
});
