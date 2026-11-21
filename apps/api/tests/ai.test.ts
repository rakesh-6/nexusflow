import { richTextDocSchema } from "@nexusflow/shared";
import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testAi } from "../src/lib/ai/provider.ts";
import { prisma } from "../src/lib/prisma.ts";
import { resetAiBreaker } from "../src/modules/ai/ai.guard.ts";
import { mountAi } from "../src/modules/ai/ai.routes.ts";
import { createTestClient } from "./helpers/http.ts";
import { orgHelpers } from "./helpers/orgs.ts";

// AI features with the fake provider (PRD §11.16, §24.4, AC-AI-01…05).
const client = createTestClient("ai-test.example");
const { post, put } = client;
const { verifiedUser, createOrg, joinedMember } = orgHelpers(client);

const SLOW = { timeout: 300_000 };

beforeEach(() => resetAiBreaker());
afterAll(async () => {
  await client.cleanup();
  await prisma.$disconnect();
});

async function setup(plan: "FREE" | "PRO" = "PRO") {
  const owner = await verifiedUser();
  const slug = await createOrg(owner.agent);
  const api = `/orgs/${slug}`;
  const organization = await prisma.organization.findUniqueOrThrow({ where: { slug } });
  await prisma.subscription.update({
    where: { organizationId: organization.id },
    data: { planTier: plan },
  });
  const project = await post(owner.agent, `${api}/workspaces/general/projects`, {
    name: "Website",
    key: `W${Date.now() % 100000}`.slice(0, 6),
  }).expect(201);
  const task = await post(owner.agent, `${api}/projects/${project.body.data.id}/tasks`, {
    title: "Build the login page",
  }).expect(201);
  return {
    owner,
    slug,
    api,
    organizationId: organization.id,
    projectId: project.body.data.id as string,
    taskId: task.body.data.id as string,
  };
}

const usage = (organizationId: string) =>
  prisma.aiUsage.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });

describe("switched off (AC-AI-01)", () => {
  it("has no AI routes at all without a provider", async () => {
    const router = express.Router();
    mountAi(router, null);
    const app = express().use(router);
    await request(app).get("/ai/status").expect(404);
    await request(app).post("/ai/task-breakdown").expect(404);
  });
});

describe("who may use AI (AC-AI-02, AC-AI-05)", SLOW, () => {
  it("refuses FREE organizations, people over the hourly limit, and a used-up month", async () => {
    const free = await setup("FREE");
    const refused = await post(free.owner.agent, `${free.api}/ai/task-breakdown`, {
      taskId: free.taskId,
    }).expect(402);
    expect(refused.body.error.code).toBe("PLAN_FEATURE_REQUIRED");

    const pro = await setup();
    const status = await pro.owner.agent.get(`/api/v1${pro.api}/ai/status`).expect(200);
    expect(status.body.data).toMatchObject({ enabled: true, planAllows: true, monthlyLimit: 500 });

    // 20 requests in the last hour: the 21st is refused.
    const row = {
      organizationId: pro.organizationId,
      feature: "TASK_BREAKDOWN" as const,
      provider: "fake",
      model: "fake-model",
      promptTokens: 1,
      completionTokens: 1,
      latencyMs: 1,
      status: "SUCCESS",
    };
    await prisma.aiUsage.createMany({
      data: Array.from({ length: 20 }, () => ({ ...row, userId: pro.owner.userId })),
    });
    const limited = await post(pro.owner.agent, `${pro.api}/ai/task-breakdown`, {
      taskId: pro.taskId,
    }).expect(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");

    // The month's 500 requests used up (by nobody in particular): 402 (AC-AI-05).
    await prisma.aiUsage.createMany({
      data: Array.from({ length: 480 }, () => ({ ...row, userId: null })),
    });
    const quota = await post(pro.owner.agent, `${pro.api}/ai/task-breakdown`, {
      taskId: pro.taskId,
    }).expect(402);
    expect(quota.body.error).toMatchObject({
      code: "PLAN_LIMIT_REACHED",
      details: { limit: "aiRequestsPerMonth", max: 500 },
    });
  });

  it("lets only the owner turn AI off, and then refuses requests", async () => {
    const context = await setup();
    const admin = await joinedMember(context.owner.agent, context.slug, "ADMIN");
    await put(admin.agent, `${context.api}/ai/settings`, { aiEnabled: false }).expect(403);
    const off = await put(context.owner.agent, `${context.api}/ai/settings`, {
      aiEnabled: false,
    }).expect(200);
    expect(off.body.data.enabled).toBe(false);
    const refused = await post(context.owner.agent, `${context.api}/ai/task-breakdown`, {
      taskId: context.taskId,
    }).expect(403);
    expect(refused.body.error.code).toBe("AI_DISABLED");
  });
});

describe("task breakdown and description (AC-AI-03, AC-AI-04)", SLOW, () => {
  it("rejects unusable answers without creating anything", async () => {
    const context = await setup();
    testAi.willAnswer({ subtasks: [{ title: "Only one" }] }); // fewer than 3
    const bad = await post(context.owner.agent, `${context.api}/ai/task-breakdown`, {
      taskId: context.taskId,
    }).expect(502);
    expect(bad.body.error.code).toBe("AI_INVALID_OUTPUT");
    testAi.willAnswer("this is not JSON");
    await post(context.owner.agent, `${context.api}/ai/task-breakdown`, {
      taskId: context.taskId,
    }).expect(502);
    testAi.willAnswer(new Error("provider down"));
    const down = await post(context.owner.agent, `${context.api}/ai/task-breakdown`, {
      taskId: context.taskId,
    }).expect(502);
    expect(down.body.error.code).toBe("AI_PROVIDER_ERROR");

    expect(await prisma.task.count({ where: { parentTaskId: context.taskId } })).toBe(0);
    // Every call is recorded, failures too.
    expect((await usage(context.organizationId)).map((u) => u.status)).toEqual([
      "INVALID_OUTPUT",
      "INVALID_OUTPUT",
      "ERROR",
    ]);
  });

  it("suggests subtasks that become real ones only when accepted", async () => {
    const context = await setup();
    testAi.willAnswer({
      subtasks: [
        { title: "Design the form", estimatedHours: 2, priority: "HIGH" },
        { title: "Connect the API", estimatedHours: 3 },
        { title: "Write tests", estimatedHours: null, priority: null },
      ],
    });
    const suggestion = await post(context.owner.agent, `${context.api}/ai/task-breakdown`, {
      taskId: context.taskId,
    }).expect(200);
    expect(suggestion.body.data.subtasks).toHaveLength(3);
    expect(await prisma.task.count({ where: { parentTaskId: context.taskId } })).toBe(0);
    // The user's data is wrapped as data in the prompt (prompt-injection hygiene).
    expect(testAi.requests.at(-1)?.prompt).toContain("<data>");
    expect(testAi.requests.at(-1)?.prompt).toContain("Build the login page");

    // Accepting: the web app creates each subtask with the normal task API.
    for (const subtask of suggestion.body.data.subtasks as { title: string }[]) {
      await post(context.owner.agent, `${context.api}/projects/${context.projectId}/tasks`, {
        title: subtask.title,
        parentTaskId: context.taskId,
      }).expect(201);
    }
    const created = await prisma.task.findMany({ where: { parentTaskId: context.taskId } });
    expect(created).toHaveLength(3);
    expect(created.every((task) => task.reporterId === context.owner.userId)).toBe(true);
    expect((await usage(context.organizationId)).map((u) => [u.feature, u.status])).toEqual([
      ["TASK_BREAKDOWN", "SUCCESS"],
    ]);
  });

  it("drafts a description as a valid editor document", async () => {
    const context = await setup();
    testAi.willAnswer({
      goal: "Let people sign in with email and password.",
      details: ["Show errors under each field"],
      acceptanceCriteria: ["A wrong password shows an error", "Signing in opens the home page"],
    });
    const draft = await post(context.owner.agent, `${context.api}/ai/task-description`, {
      projectId: context.projectId,
      title: "Build the login page",
    }).expect(200);
    expect(richTextDocSchema.safeParse(draft.body.data.description).success).toBe(true);
    expect(JSON.stringify(draft.body.data.description)).toContain("Acceptance criteria");
  });
});
