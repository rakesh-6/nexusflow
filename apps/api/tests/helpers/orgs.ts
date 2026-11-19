import { expect } from "vitest";
import { memoryMailbox } from "../../src/lib/mail/index.ts";
import { prisma } from "../../src/lib/prisma.ts";
import { forgetCachedSessions } from "../../src/modules/auth/session.service.ts";
import type { createTestClient } from "./http.ts";

type Client = ReturnType<typeof createTestClient>;
type Agent = ReturnType<Client["newAgent"]>;

let slugCounter = 0;
export const newSlug = () => `t${Date.now().toString(36)}-${++slugCounter}`;

/** Organization helpers for HTTP tests: people, organizations, invitations. */
export function orgHelpers(client: Client) {
  const { post, registerUser, newEmail } = client;

  /** A signed-in person whose email is already verified. */
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

  /** A new verified person who joined organization `slug` with `role`. */
  async function joinedMember(ownerAgent: Agent, slug: string, role = "MEMBER") {
    const person = await verifiedUser();
    const token = await invite(ownerAgent, slug, person.email, role);
    const accepted = await post(person.agent, `/invitations/${token}/accept`);
    expect(accepted.status).toBe(200);
    return person;
  }

  return { verifiedUser, createOrg, invite, joinedMember };
}
