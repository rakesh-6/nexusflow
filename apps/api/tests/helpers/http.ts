import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../../src/app.ts";
import { prisma } from "../../src/lib/prisma.ts";

export const TEST_PASSWORD = "Correct-horse-42";

/**
 * Helpers for HTTP tests. Each test file passes its own email domain, so its
 * users can be found and deleted afterwards without touching anyone else's.
 */
export function createTestClient(domain: string) {
  const app = createApp();
  const run = randomUUID().slice(0, 8);
  let counter = 0;

  const newEmail = () => `user${++counter}-${run}@${domain}`;
  /** A fresh "browser" that keeps its own cookies. */
  const newAgent = () => request.agent(app);
  type Agent = ReturnType<typeof newAgent>;

  // Requests that change something need the anti-forgery header (PRD §19.3).
  const post = (agent: Agent, path: string, body: object = {}) =>
    agent.post(`/api/v1${path}`).set("X-Requested-With", "NexusFlow").send(body);
  const patch = (agent: Agent, path: string, body: object) =>
    agent.patch(`/api/v1${path}`).set("X-Requested-With", "NexusFlow").send(body);
  const put = (agent: Agent, path: string, body: object) =>
    agent.put(`/api/v1${path}`).set("X-Requested-With", "NexusFlow").send(body);
  const del = (agent: Agent, path: string) =>
    agent.delete(`/api/v1${path}`).set("X-Requested-With", "NexusFlow");

  async function registerUser(email = newEmail()) {
    const agent = newAgent();
    const response = await post(agent, "/auth/register", {
      name: "Test Person",
      email,
      password: TEST_PASSWORD,
    });
    return { agent, email, response, userId: response.body.data?.user?.id as string };
  }

  /** Deletes every user this file created, including deleted (scrubbed) ones. */
  async function cleanup() {
    const users = await prisma.user.findMany({
      where: { OR: [{ email: { endsWith: `@${domain}` } }, { id: { in: createdIds } }] },
      select: { id: true },
    });
    const ids = users.map((user) => user.id);
    await prisma.organization.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.activityLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  // Deleted accounts get a new email, so remember their ids for cleanup.
  const createdIds: string[] = [];
  const remember = (id: string | undefined) => {
    // A failed sign-up has no id; skip it so cleanup still works.
    if (id) createdIds.push(id);
  };

  return { app, newEmail, newAgent, post, patch, put, del, registerUser, cleanup, remember };
}
