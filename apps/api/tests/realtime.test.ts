import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connectClient, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DomainEvent } from "../src/lib/events.ts";
import { prisma } from "../src/lib/prisma.ts";
import { attachRealtime } from "../src/realtime/gateway.ts";
import { createTestClient } from "./helpers/http.ts";
import { orgHelpers } from "./helpers/orgs.ts";

// Live updates over Socket.io (PRD §11.8, AC-RT-01 to 05).
const client = createTestClient("realtime-test.example");
const { post, patch } = client;
const { verifiedUser, createOrg, joinedMember } = orgHelpers(client);
type Person = Awaited<ReturnType<typeof verifiedUser>>;

const SLOW = { timeout: 240_000 };
let server: Server;
let realtime: ReturnType<typeof attachRealtime>;
let port = 0;
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  server = createServer(client.app);
  // Short presence times so the "goes offline" test takes seconds, not a minute.
  realtime = attachRealtime(server, { presenceTtlMs: 1500, sweepMs: 250 });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  realtime.close();
  await new Promise((resolve) => server.close(resolve));
  await client.cleanup();
  await prisma.$disconnect();
});

/** The "nf_session=…" cookie the person got when they signed up. */
function cookieOf(person: Person) {
  const header = person.response.headers["set-cookie"] as unknown;
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  const session = cookies.find((cookie) => cookie.startsWith("nf_session="));
  if (!session) throw new Error("No session cookie");
  return session.split(";")[0] as string;
}

function connectAs(cookie: string | null) {
  const socket = connectClient(`http://127.0.0.1:${port}`, {
    path: "/socket.io",
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    extraHeaders: cookie ? { cookie } : {},
  });
  sockets.push(socket);
  return socket;
}

function waitFor<T>(
  socket: ClientSocket,
  event: string,
  match: (payload: T) => boolean = () => true,
  timeoutMs = 10_000,
) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`No "${event}" within ${timeoutMs} ms`));
    }, timeoutMs);
    function handler(payload: T) {
      if (!match(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

/** Everything `event` delivers until stop() is called. */
function collect<T>(socket: ClientSocket, event: string) {
  const seen: T[] = [];
  const handler = (payload: T) => seen.push(payload);
  socket.on(event, handler);
  return () => {
    socket.off(event, handler);
    return seen;
  };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function signedIn(person: Person) {
  const socket = connectAs(cookieOf(person));
  await waitFor(socket, "session:ready");
  return socket;
}

const join = (socket: ClientSocket, type: string, id: string) =>
  socket.emitWithAck("room:join", { type, id }) as Promise<{ ok: boolean; code?: string }>;

let keyCounter = 0;
async function setup() {
  const owner = await verifiedUser();
  const slug = await createOrg(owner.agent);
  const api = `/orgs/${slug}`;
  const project = async (body: object = {}) => {
    const response = await post(owner.agent, `${api}/workspaces/general/projects`, {
      name: "Live",
      key: `L${(++keyCounter).toString(36).toUpperCase()}${Date.now() % 1000}`.slice(0, 6),
      ...body,
    }).expect(201);
    return response.body.data as { id: string };
  };
  const task = async (projectId: string) => {
    const response = await post(owner.agent, `${api}/projects/${projectId}/tasks`, {
      title: "Watch me",
    }).expect(201);
    return response.body.data as { id: string; version: number };
  };
  return { owner, slug, api, project, task };
}

describe("connecting (AC-RT-01)", SLOW, () => {
  it("refuses connections without a valid session and accepts signed-in people", async () => {
    for (const cookie of [null, "nf_session=not-a-real-token"]) {
      const socket = connectAs(cookie);
      const error = await new Promise<Error>((resolve) => socket.on("connect_error", resolve));
      expect(error.message).toBe("UNAUTHENTICATED");
    }
    const person = await verifiedUser();
    const socket = connectAs(cookieOf(person));
    const ready = await waitFor<{ userId: string }>(socket, "session:ready");
    expect(ready.userId).toBe(person.userId);
  });
});

describe("rooms and events (AC-RT-02, AC-RT-03, AC-RT-04)", SLOW, () => {
  it("joins only rooms the person may see and delivers changes there", async () => {
    const { owner, slug, api, project, task } = await setup();
    const open = await project();
    const secret = await project({ visibility: "PRIVATE" });
    const [openTask, secretTask] = [await task(open.id), await task(secret.id)];
    const member = await joinedMember(owner.agent, slug);
    const socket = await signedIn(member);

    expect(await join(socket, "project", open.id)).toEqual({ ok: true });
    expect(await join(socket, "project", secret.id)).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await join(socket, "task", secretTask.id)).toEqual({ ok: false, code: "FORBIDDEN" });

    // AC-RT-03: the owner's change arrives with the changed field and the owner as actor.
    const updated = waitFor<DomainEvent>(socket, "task:updated", (e) => e.projectId === open.id);
    await patch(owner.agent, `${api}/tasks/${openTask.id}`, {
      priority: "URGENT",
      version: openTask.version,
    }).expect(200);
    expect(await updated).toMatchObject({
      actorId: owner.userId,
      projectId: open.id,
      data: { taskId: openTask.id, fields: ["priority"] },
    });

    // AC-RT-02: nothing arrives from the project it could not join.
    const stop = collect<DomainEvent>(socket, "task:updated");
    await patch(owner.agent, `${api}/tasks/${secretTask.id}`, {
      priority: "URGENT",
      version: secretTask.version,
    }).expect(200);
    await pause(1000);
    expect(stop().filter((event) => event.projectId === secret.id)).toEqual([]);
  });

  it("takes a removed person out of the project room within 5 seconds", async () => {
    const { owner, slug, api, project, task } = await setup();
    const secret = await project({ visibility: "PRIVATE" });
    const secretTask = await task(secret.id);
    const member = await joinedMember(owner.agent, slug);
    await post(owner.agent, `${api}/projects/${secret.id}/members`, {
      userId: member.userId,
      role: "CONTRIBUTOR",
    }).expect(201);
    const socket = await signedIn(member);
    expect(await join(socket, "project", secret.id)).toEqual({ ok: true });

    const revoked = waitFor(socket, "access:revoked", () => true, 30_000);
    await client
      .del(owner.agent, `${api}/projects/${secret.id}/members/${member.userId}`)
      .expect(200);
    const removedAt = Date.now();
    expect(await revoked).toEqual({ type: "project", id: secret.id });
    expect(Date.now() - removedAt).toBeLessThan(5000);

    const stop = collect<DomainEvent>(socket, "task:updated");
    await patch(owner.agent, `${api}/tasks/${secretTask.id}`, {
      title: "After removal",
      version: secretTask.version,
    }).expect(200);
    await pause(1000);
    expect(stop()).toEqual([]);
  });

  it("refuses every room of another organization", async () => {
    const { project, task, api, owner } = await setup();
    const open = await project();
    const openTask = await task(open.id);
    const context = await owner.agent.get(`/api/v1${api}/context`).expect(200);
    const workspaceId = context.body.data.workspaces[0].id as string;
    const orgId = context.body.data.organization.id as string;

    const outsider = await verifiedUser();
    await createOrg(outsider.agent);
    const socket = await signedIn(outsider);
    for (const [type, id] of [
      ["org", orgId],
      ["workspace", workspaceId],
      ["project", open.id],
      ["task", openTask.id],
    ] as const) {
      expect(await join(socket, type, id), type).toEqual({ ok: false, code: "FORBIDDEN" });
    }
  });
});

describe("presence, viewers and typing (AC-RT-05)", SLOW, () => {
  it("shows who is online, who views a task, who is typing, and new comments", async () => {
    const { owner, slug, api, project, task } = await setup();
    const open = await project();
    const openTask = await task(open.id);
    const member = await joinedMember(owner.agent, slug);
    const context = await owner.agent.get(`/api/v1${api}/context`).expect(200);
    const workspaceId = context.body.data.workspaces[0].id as string;
    const [ownerSocket, memberSocket] = [await signedIn(owner), await signedIn(member)];
    expect(await join(ownerSocket, "workspace", workspaceId)).toEqual({ ok: true });

    // Opening the workspace makes the member show up as online for the owner.
    type Presence = { workspaceId: string; online: string[] };
    const online = waitFor<Presence>(ownerSocket, "presence:update", (p) =>
      p.online.includes(member.userId),
    );
    expect(await join(memberSocket, "workspace", workspaceId)).toEqual({ ok: true });
    await online;
    // No pings after that: offline once the (shortened) time-out passes.
    await waitFor<Presence>(
      ownerSocket,
      "presence:update",
      (p) => !p.online.includes(member.userId),
    );

    // Both open the task: each sees the other as a viewer.
    expect(await join(ownerSocket, "task", openTask.id)).toEqual({ ok: true });
    const viewers = waitFor<{ userIds: string[] }>(
      ownerSocket,
      "task:viewers",
      (p) => p.userIds.length === 2,
    );
    expect(await join(memberSocket, "task", openTask.id)).toEqual({ ok: true });
    expect((await viewers).userIds.sort()).toEqual([owner.userId, member.userId].sort());

    const typing = waitFor<{ userId: string; typing: boolean }>(
      ownerSocket,
      "typing",
      (p) => p.typing,
    );
    memberSocket.emit("typing:start", { taskId: openTask.id });
    expect(await typing).toMatchObject({ userId: member.userId, taskId: openTask.id });

    // A new comment reaches everyone looking at the task.
    const commented = waitFor<DomainEvent>(memberSocket, "comment:created");
    await post(owner.agent, `${api}/tasks/${openTask.id}/comments`, {
      body: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }],
      },
    }).expect(201);
    expect(await commented).toMatchObject({ actorId: owner.userId, data: { taskId: openTask.id } });
  });
});
