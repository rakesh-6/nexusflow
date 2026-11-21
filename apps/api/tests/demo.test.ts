import { DEMO_EMAIL_DOMAIN } from "@nexusflow/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../src/config/env.ts";
import { memoryMailbox } from "../src/lib/mail/index.ts";
import { prisma } from "../src/lib/prisma.ts";
import { DEMO_ORG_SLUG, resetDemoIfDue } from "../src/demo/demo.service.ts";
import { removeSampleData } from "../src/demo/sampleData.ts";
import { createTestClient } from "./helpers/http.ts";
import { orgHelpers } from "./helpers/orgs.ts";

// "Try the demo" (PRD §26.8): one-click visitors, their limits, the daily rebuild.
const client = createTestClient("demo-test.example");
const { app, post, patch } = client;
const { verifiedUser, createOrg } = orgHelpers(client);

const SLOW = { timeout: 600_000 };
const wasOn = env.DEMO_MODE;

beforeAll(async () => {
  env.DEMO_MODE = true;
  await removeSampleData(["acme"]);
});
afterAll(async () => {
  env.DEMO_MODE = wasOn;
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } } });
  await removeSampleData(["acme"]);
  await client.cleanup();
  await prisma.$disconnect();
});

const startDemo = () =>
  request.agent(app).post("/api/v1/auth/demo").set("X-Requested-With", "NexusFlow").send({});

describe("demo visitors", SLOW, () => {
  it("signs a visitor into the demo organization as an admin, with demo limits", async () => {
    // A small stand-in for Acme Studio (the full rebuild is tested below).
    const owner = await verifiedUser();
    await createOrg(owner.agent, DEMO_ORG_SLUG);

    const agent = request.agent(app);
    const started = await agent
      .post("/api/v1/auth/demo")
      .set("X-Requested-With", "NexusFlow")
      .send({})
      .expect(201);
    expect(started.body.data).toMatchObject({
      orgSlug: DEMO_ORG_SLUG,
      user: { isDemo: true, emailVerified: true },
    });
    const membership = await prisma.organizationMember.findFirstOrThrow({
      where: { userId: started.body.data.user.id },
    });
    expect(membership.role).toBe("ADMIN");

    const me = await agent.get("/api/v1/users/me").expect(200);
    expect(me.body.data.isDemo).toBe(true);
    const api = `/orgs/${DEMO_ORG_SLUG}`;
    const renamed = await patch(agent, api, { name: "Hacked" }).expect(403);
    expect(renamed.body.error.code).toBe("DEMO_RESTRICTED");
    await post(agent, "/orgs", { name: "Mine", slug: `mine-${Date.now()}` }).expect(403);
    await post(agent, "/auth/change-password", {
      currentPassword: "x",
      newPassword: "Another-pass-42",
    }).expect(403);

    // Invitations are created but never emailed.
    memoryMailbox.clear();
    await post(agent, `${api}/invitations`, {
      invites: [{ email: `friend-${Date.now()}@demo-test.example`, role: "MEMBER" }],
    }).expect(201);
    expect(memoryMailbox.sent).toHaveLength(0);

    // The providers list tells the login page to show the button.
    const providers = await request(app).get("/api/v1/auth/providers").expect(200);
    expect(providers.body.data.demo).toBe(true);
  });

  it("is switched off without DEMO_MODE", async () => {
    env.DEMO_MODE = false;
    try {
      await startDemo().expect(404);
    } finally {
      env.DEMO_MODE = true;
    }
  });

  it("rebuilds Acme Studio when it is due, removing visitors", async () => {
    expect(await resetDemoIfDue()).toBe("fresh");
    // A day later the organization is due: it is rebuilt from the sample data.
    const later = new Date(Date.now() + (env.DEMO_RESET_HOURS + 1) * 3_600_000);
    expect(await resetDemoIfDue(later)).toBe("reset");
    const acme = await prisma.organization.findUniqueOrThrow({
      where: { slug: DEMO_ORG_SLUG },
      include: { _count: { select: { projects: true, members: true } } },
    });
    expect(acme.name).toBe("Acme Studio");
    expect(acme._count.projects).toBeGreaterThanOrEqual(5);
    expect(
      await prisma.user.count({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } } }),
    ).toBe(0);

    // Visitors can join the rebuilt organization straight away.
    await startDemo().expect(201);
  });
});
