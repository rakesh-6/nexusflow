import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { memoryMailbox } from "../src/lib/mail/index.ts";
import { prisma } from "../src/lib/prisma.ts";
import { forgetCachedSessions } from "../src/modules/auth/session.service.ts";
import { createTestClient, TEST_PASSWORD } from "./helpers/http.ts";

// Organizations, workspaces, members and invitations (PRD §11.2, §11.3, §12, §20).
const client = createTestClient("org-test.example");
const { newAgent, post, patch, del, registerUser, newEmail } = client;
type Agent = ReturnType<typeof newAgent>;

let slugCounter = 0;
const newSlug = () => `t${Date.now().toString(36)}-${++slugCounter}`;

/** A signed-in person whose email is already verified (verification itself is tested in auth.test.ts). */
async function verifiedUser(email = newEmail()) {
  const user = await registerUser(email);
  await prisma.user.update({ where: { id: user.userId }, data: { emailVerifiedAt: new Date() } });
  forgetCachedSessions({ userId: user.userId });
  return user;
}

async function createOrg(agent: Agent, slug = newSlug()) {
  const response = await post(agent, "/orgs", { name: "Test Org", slug });
  expect(response.status).toBe(201);
  return slug;
}

/** Invites `email` as `role` and returns the token from the emailed link. */
async function invite(agent: Agent, slug: string, email: string, role = "MEMBER") {
  memoryMailbox.clear();
  const response = await post(agent, `/orgs/${slug}/invitations`, { invites: [{ email, role }] });
  expect(response.status).toBe(201);
  const mail = memoryMailbox.sent.find((m) => m.to === email);
  const token = mail ? /\/invite\/([\w-]+)/.exec(mail.text)?.[1] : undefined;
  if (!token) throw new Error("No invitation email found");
  return token;
}

beforeEach(() => memoryMailbox.clear());

afterAll(async () => {
  await client.cleanup();
  await prisma.$disconnect();
});

describe("creating an organization (AC-ORG-01)", () => {
  it("creates the organization, its General workspace, the owner and a FREE plan", async () => {
    const { agent } = await verifiedUser();
    const slug = await createOrg(agent);

    const context = await agent.get(`/api/v1/orgs/${slug}/context`).expect(200);
    expect(context.body.data).toMatchObject({
      role: "OWNER",
      plan: { tier: "FREE", limits: { maxWorkspaces: 1, maxMembers: 5 } },
      usage: { workspaces: 1, members: 1 },
    });
    expect(context.body.data.workspaces).toEqual([
      expect.objectContaining({ slug: "general", isDefault: true, role: "WORKSPACE_ADMIN" }),
    ]);

    const mine = await agent.get("/api/v1/users/me/organizations").expect(200);
    expect(mine.body.data.map((o: { slug: string }) => o.slug)).toContain(slug);
    const me = await agent.get("/api/v1/users/me").expect(200);
    expect(me.body.data.lastActiveWorkspaceId).toBe(context.body.data.workspaces[0].id);
  });

  it("refuses a taken or reserved address", async () => {
    const { agent } = await verifiedUser();
    const slug = await createOrg(agent);
    const taken = await post(agent, "/orgs", { name: "Again", slug }).expect(409);
    expect(taken.body.error.code).toBe("SLUG_TAKEN");
    const reserved = await post(agent, "/orgs", { name: "Reserved", slug: "settings" }).expect(400);
    expect(reserved.body.error.details[0].message).toBe("This address is reserved");
  });

  it("requires a verified email", async () => {
    const { agent } = await registerUser();
    await post(agent, "/orgs", { name: "Nope", slug: newSlug() }).expect(403);
  });
});

describe("plan limits (AC-ORG-02, AC-BILL-01)", () => {
  it("allows one workspace on the FREE plan", async () => {
    const { agent } = await verifiedUser();
    const slug = await createOrg(agent);
    const response = await post(agent, `/orgs/${slug}/workspaces`, {
      name: "Second",
      slug: "second",
    }).expect(402);
    expect(response.body.error).toMatchObject({
      code: "PLAN_LIMIT_REACHED",
      details: { limit: "maxWorkspaces", current: 1, max: 1, planTier: "FREE" },
    });
  });

  it("counts pending invitations against the 5-member limit", async () => {
    const { agent } = await verifiedUser();
    const slug = await createOrg(agent);
    const four = Array.from({ length: 4 }, () => ({ email: newEmail(), role: "MEMBER" }));
    await post(agent, `/orgs/${slug}/invitations`, { invites: four }).expect(201);
    const fifth = await post(agent, `/orgs/${slug}/invitations`, {
      invites: [{ email: newEmail(), role: "MEMBER" }],
    }).expect(402);
    expect(fifth.body.error.details).toMatchObject({ limit: "maxMembers", current: 5, max: 5 });
  });
});

describe("invitations (AC-INV-01 to 04)", () => {
  it("invites by email; the invitee previews, signs up and joins the default workspace", async () => {
    const owner = await verifiedUser();
    const slug = await createOrg(owner.agent);
    const inviteeEmail = newEmail();
    const token = await invite(owner.agent, slug, inviteeEmail);

    const preview = await newAgent().get(`/api/v1/invitations/${token}`).expect(200);
    expect(preview.body.data).toMatchObject({
      role: "MEMBER",
      email: inviteeEmail,
      invitedBy: "Test Person",
    });

    const invitee = await verifiedUser(inviteeEmail);
    const accepted = await post(invitee.agent, `/invitations/${token}/accept`).expect(200);
    expect(accepted.body.data).toEqual({ orgSlug: slug, workspaceSlug: "general" });

    const context = await invitee.agent.get(`/api/v1/orgs/${slug}/context`).expect(200);
    expect(context.body.data).toMatchObject({ role: "MEMBER", permissions: ["members:read"] });
    expect(context.body.data.workspaces.map((w: { slug: string }) => w.slug)).toEqual(["general"]);

    // The link works only once.
    await post(invitee.agent, `/invitations/${token}/accept`).expect(404);
  });

  it("re-inviting the same email resends instead of creating a second invitation", async () => {
    const owner = await verifiedUser();
    const slug = await createOrg(owner.agent);
    const email = newEmail();
    await invite(owner.agent, slug, email);
    await invite(owner.agent, slug, email);
    const list = await owner.agent.get(`/api/v1/orgs/${slug}/invitations`).expect(200);
    expect(list.body.data.filter((i: { email: string }) => i.email === email)).toHaveLength(1);
  });

  it("refuses someone signed in with a different email (403)", async () => {
    const owner = await verifiedUser();
    const slug = await createOrg(owner.agent);
    const token = await invite(owner.agent, slug, newEmail());
    const stranger = await verifiedUser();
    const response = await post(stranger.agent, `/invitations/${token}/accept`).expect(403);
    expect(response.body.error.code).toBe("INVITATION_EMAIL_MISMATCH");
  });

  it("refuses an expired invitation (410) and a revoked one (404)", async () => {
    const owner = await verifiedUser();
    const slug = await createOrg(owner.agent);
    const email = newEmail();
    const token = await invite(owner.agent, slug, email);
    await prisma.invitation.updateMany({
      where: { email },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await newAgent().get(`/api/v1/invitations/${token}`).expect(410);
    expect(expired.body.error.code).toBe("INVITATION_EXPIRED");

    const second = newEmail();
    const token2 = await invite(owner.agent, slug, second);
    const [pending] = (await owner.agent.get(`/api/v1/orgs/${slug}/invitations`)).body.data;
    await del(owner.agent, `/orgs/${slug}/invitations/${pending.id}`).expect(200);
    await newAgent().get(`/api/v1/invitations/${token2}`).expect(404);
  });
});

// These tests sign up several people and make many requests to the database,
// which can take longer than the usual 30 seconds.
describe("roles and members (PRD §12.2)", { timeout: 120_000 }, () => {
  async function orgWithMember() {
    const owner = await verifiedUser();
    const slug = await createOrg(owner.agent);
    const memberEmail = newEmail();
    const token = await invite(owner.agent, slug, memberEmail);
    const member = await verifiedUser(memberEmail);
    await post(member.agent, `/invitations/${token}/accept`).expect(200);
    return { owner, member, slug };
  }

  it("lets members read the member list but not invite or change roles", async () => {
    const { owner, member, slug } = await orgWithMember();
    await member.agent.get(`/api/v1/orgs/${slug}/members`).expect(200);
    await post(member.agent, `/orgs/${slug}/invitations`, {
      invites: [{ email: newEmail(), role: "MEMBER" }],
    }).expect(403);
    await patch(member.agent, `/orgs/${slug}/members/${owner.userId}`, { role: "MEMBER" }).expect(
      403,
    );
  });

  it("lets the owner promote a member, but an admin cannot change another admin", async () => {
    const { owner, member, slug } = await orgWithMember();
    await patch(owner.agent, `/orgs/${slug}/members/${member.userId}`, { role: "ADMIN" }).expect(
      200,
    );
    const secondAdminEmail = newEmail();
    const token = await invite(owner.agent, slug, secondAdminEmail, "ADMIN");
    const secondAdmin = await verifiedUser(secondAdminEmail);
    await post(secondAdmin.agent, `/invitations/${token}/accept`).expect(200);
    await patch(member.agent, `/orgs/${slug}/members/${secondAdmin.userId}`, {
      role: "MEMBER",
    }).expect(403);
    await patch(owner.agent, `/orgs/${slug}/members/${owner.userId}`, { role: "ADMIN" }).expect(
      403,
    );
  });

  it("removing a member ends their access at once (AC-INV-05)", async () => {
    const { owner, member, slug } = await orgWithMember();
    await member.agent.get(`/api/v1/orgs/${slug}/context`).expect(200);
    await del(owner.agent, `/orgs/${slug}/members/${member.userId}`).expect(200);
    await member.agent.get(`/api/v1/orgs/${slug}/context`).expect(404);
  });

  it("transfers ownership to an admin after re-confirming the password", async () => {
    const { owner, member, slug } = await orgWithMember();
    await patch(owner.agent, `/orgs/${slug}/members/${member.userId}`, { role: "ADMIN" }).expect(
      200,
    );
    const blocked = await post(owner.agent, `/orgs/${slug}/transfer-ownership`, {
      userId: member.userId,
    }).expect(403);
    expect(blocked.body.error.code).toBe("REAUTH_REQUIRED");

    await post(owner.agent, "/auth/reauthenticate", { password: TEST_PASSWORD }).expect(200);
    await post(owner.agent, `/orgs/${slug}/transfer-ownership`, { userId: member.userId }).expect(
      200,
    );
    expect((await member.agent.get(`/api/v1/orgs/${slug}/context`)).body.data.role).toBe("OWNER");
    expect((await owner.agent.get(`/api/v1/orgs/${slug}/context`)).body.data.role).toBe("ADMIN");
  });

  it("owners cannot leave; members can", async () => {
    const { owner, member, slug } = await orgWithMember();
    expect((await post(owner.agent, `/orgs/${slug}/leave`)).body.error.code).toBe(
      "OWNER_CANNOT_LEAVE",
    );
    await post(member.agent, `/orgs/${slug}/leave`).expect(200);
    await member.agent.get(`/api/v1/orgs/${slug}/context`).expect(404);
  });
});

describe("workspaces (AC-ORG-05)", () => {
  it("never archives or deletes the last workspace", async () => {
    const { agent } = await verifiedUser();
    const slug = await createOrg(agent);
    expect((await post(agent, `/orgs/${slug}/workspaces/general/archive`)).body.error.code).toBe(
      "LAST_WORKSPACE",
    );
    expect((await del(agent, `/orgs/${slug}/workspaces/general`)).body.error.code).toBe(
      "LAST_WORKSPACE",
    );
  });

  it("renames a workspace and lists its members", async () => {
    const { agent, userId } = await verifiedUser();
    const slug = await createOrg(agent);
    const renamed = await patch(agent, `/orgs/${slug}/workspaces/general`, {
      name: "Everyone",
    }).expect(200);
    expect(renamed.body.data.name).toBe("Everyone");
    const members = await agent.get(`/api/v1/orgs/${slug}/workspaces/general/members`).expect(200);
    expect(members.body.data).toEqual([
      expect.objectContaining({ userId, role: "WORKSPACE_ADMIN" }),
    ]);
  });
});

describe("tenant isolation (AC-ORG-04, PRD §20.4)", { timeout: 120_000 }, () => {
  it("answers 404 to an outsider on every organization endpoint", async () => {
    const owner = await verifiedUser();
    const slug = await createOrg(owner.agent);
    const [pending] = [await invite(owner.agent, slug, newEmail())];
    const invitationId = (await owner.agent.get(`/api/v1/orgs/${slug}/invitations`)).body.data[0]
      .id;
    const outsider = await verifiedUser();
    await createOrg(outsider.agent); // the outsider owns their own organization

    const attempts: [string, () => Promise<{ status: number }>][] = [
      ["GET context", () => outsider.agent.get(`/api/v1/orgs/${slug}/context`)],
      ["GET members", () => outsider.agent.get(`/api/v1/orgs/${slug}/members`)],
      ["GET usage", () => outsider.agent.get(`/api/v1/orgs/${slug}/usage`)],
      ["GET audit log", () => outsider.agent.get(`/api/v1/orgs/${slug}/audit-logs`)],
      ["GET invitations", () => outsider.agent.get(`/api/v1/orgs/${slug}/invitations`)],
      ["GET workspaces", () => outsider.agent.get(`/api/v1/orgs/${slug}/workspaces`)],
      ["GET workspace", () => outsider.agent.get(`/api/v1/orgs/${slug}/workspaces/general`)],
      [
        "GET workspace activity",
        () => outsider.agent.get(`/api/v1/orgs/${slug}/workspaces/general/activity`),
      ],
      ["PATCH organization", () => patch(outsider.agent, `/orgs/${slug}`, { name: "Hacked" })],
      ["DELETE organization", () => del(outsider.agent, `/orgs/${slug}`)],
      [
        "POST invitation",
        () =>
          post(outsider.agent, `/orgs/${slug}/invitations`, {
            invites: [{ email: newEmail(), role: "ADMIN" }],
          }),
      ],
      ["DELETE invitation", () => del(outsider.agent, `/orgs/${slug}/invitations/${invitationId}`)],
      [
        "PATCH member",
        () => patch(outsider.agent, `/orgs/${slug}/members/${owner.userId}`, { role: "GUEST" }),
      ],
      [
        "POST workspace",
        () => post(outsider.agent, `/orgs/${slug}/workspaces`, { name: "X", slug: "xx-x" }),
      ],
      [
        "PATCH workspace",
        () => patch(outsider.agent, `/orgs/${slug}/workspaces/general`, { name: "Hacked" }),
      ],
      ["POST leave", () => post(outsider.agent, `/orgs/${slug}/leave`)],
    ];
    for (const [label, attempt] of attempts) {
      expect((await attempt()).status, label).toBe(404);
    }
    // Nothing changed.
    expect(
      (await owner.agent.get(`/api/v1/orgs/${slug}/context`)).body.data.organization.name,
    ).toBe("Test Org");
    expect(pending).toBeTruthy();
  });

  it("a deleted organization disappears for its own owner and frees its address", async () => {
    const owner = await verifiedUser();
    const slug = await createOrg(owner.agent);
    await post(owner.agent, "/auth/reauthenticate", { password: TEST_PASSWORD }).expect(200);
    await del(owner.agent, `/orgs/${slug}`).send({ confirmSlug: "wrong" }).expect(400);
    await del(owner.agent, `/orgs/${slug}`).send({ confirmSlug: slug }).expect(200);
    await owner.agent.get(`/api/v1/orgs/${slug}/context`).expect(404);
    await createOrg(owner.agent, slug);
  });
});
