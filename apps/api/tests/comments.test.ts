import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { onEvent, type DomainEvent } from "../src/lib/events.ts";
import { prisma } from "../src/lib/prisma.ts";
import { createTestClient } from "./helpers/http.ts";
import { orgHelpers } from "./helpers/orgs.ts";

// Comments, replies, mentions and reactions (PRD §11.9, AC-COMM-01 to 05).
const client = createTestClient("comment-test.example");
const { post, patch } = client;
const { verifiedUser, createOrg, joinedMember } = orgHelpers(client);

const SLOW = { timeout: 300_000 };

interface Notice {
  type: string;
  recipientIds: string[];
  commentId: string;
}
const notices: Notice[] = [];
let stopListening = () => {};
beforeAll(() => {
  stopListening = onEvent((event: DomainEvent) => {
    if (event.name === "notification:requested") notices.push(event.data as Notice);
  });
});
afterAll(async () => {
  stopListening();
  await client.cleanup();
  await prisma.$disconnect();
});

const para = (...content: object[]) => ({ type: "paragraph", content });
const text = (value: string) => ({ type: "text", text: value });
const doc = (...content: object[]) => ({ type: "doc", content });
const say = (value: string) => doc(para(text(value)));
const mention = (id: string, label: string) => ({ type: "mention", attrs: { id, label } });

let keyCounter = 0;
async function setup() {
  const owner = await verifiedUser();
  const slug = await createOrg(owner.agent);
  const api = `/orgs/${slug}`;
  const project = await post(owner.agent, `${api}/workspaces/general/projects`, {
    name: "Comments",
    key: `C${(++keyCounter).toString(36).toUpperCase()}${Date.now() % 1000}`.slice(0, 6),
  }).expect(201);
  const projectId = project.body.data.id as string;

  const contributor = await joinedMember(owner.agent, slug);
  await post(owner.agent, `${api}/projects/${projectId}/members`, {
    userId: contributor.userId,
    role: "CONTRIBUTOR",
  }).expect(201);
  const viewer = await joinedMember(owner.agent, slug); // workspace member: views WORKSPACE projects

  const task = await post(owner.agent, `${api}/projects/${projectId}/tasks`, {
    title: "Discuss me",
    assigneeIds: [contributor.userId],
  }).expect(201);
  const taskId = task.body.data.id as string;
  const comments = `${api}/tasks/${taskId}/comments`;
  const list = async (agent = owner.agent) =>
    (await agent.get(`/api/v1${comments}`).expect(200)).body.data as {
      id: string;
      deleted: boolean;
      body: unknown;
      replies: { id: string }[];
      reactions: { emoji: string; count: number; userIds: string[] }[];
    }[];
  return { owner, contributor, viewer, slug, api, projectId, taskId, comments, list };
}

describe("comments (AC-COMM-02, 03)", SLOW, () => {
  it("threads replies one level deep and keeps deleted parents as placeholders", async () => {
    const { owner, contributor, comments, list, api } = await setup();
    const first = await post(owner.agent, comments, { body: say("First!") }).expect(201);
    const parentId = first.body.data.id as string;
    const reply = await post(contributor.agent, comments, {
      body: say("A reply"),
      parentCommentId: parentId,
    }).expect(201);
    const deep = await post(owner.agent, comments, {
      body: say("Too deep"),
      parentCommentId: reply.body.data.id,
    }).expect(400);
    expect(deep.body.error.code).toBe("MAX_DEPTH");

    const threads = await list();
    expect(threads).toHaveLength(1);
    expect(threads[0]?.replies.map((r) => r.id)).toEqual([reply.body.data.id]);

    // A contributor cannot delete someone else's comment; the owner (a manager) can.
    await client.del(contributor.agent, `${api}/comments/${parentId}`).expect(403);
    await client.del(owner.agent, `${api}/comments/${parentId}`).expect(200);
    const afterDelete = await list();
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0]).toMatchObject({ id: parentId, deleted: true, body: null });
    expect(afterDelete[0]?.replies).toHaveLength(1);

    // Deleting the last reply makes the placeholder disappear too.
    await client.del(contributor.agent, `${api}/comments/${reply.body.data.id}`).expect(200);
    expect(await list()).toHaveLength(0);

    // A comment without replies simply disappears.
    const lonely = await post(owner.agent, comments, { body: say("Bye") }).expect(201);
    await client.del(owner.agent, `${api}/comments/${lonely.body.data.id}`).expect(200);
    expect(await list()).toHaveLength(0);
  });

  it("lets only the author edit, and only contributors write", async () => {
    const { owner, contributor, viewer, comments, api } = await setup();
    const made = await post(owner.agent, comments, { body: say("Original") }).expect(201);
    const id = made.body.data.id as string;
    const edited = await patch(owner.agent, `${api}/comments/${id}`, {
      body: say("Edited"),
    }).expect(200);
    expect(edited.body.data).toMatchObject({ bodyText: "Edited", canEdit: true });
    expect(edited.body.data.editedAt).not.toBeNull();
    await patch(contributor.agent, `${api}/comments/${id}`, { body: say("Mine now") }).expect(403);
    await post(viewer.agent, comments, { body: say("Hello") }).expect(403);

    const unsafe = doc(
      para({
        type: "text",
        text: "click",
        marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
      }),
    );
    await post(owner.agent, comments, { body: unsafe }).expect(400);
    await post(owner.agent, comments, { body: doc(para()) }).expect(400);
  });
});

describe("mentions and notifications (AC-COMM-01, 05)", SLOW, () => {
  it("mentions only people who can open the project and never notifies the author", async () => {
    const { owner, contributor, viewer, comments } = await setup();
    const stranger = await verifiedUser();
    notices.length = 0;

    // The contributor mentions the viewer and a stranger from another organization.
    const made = await post(contributor.agent, comments, {
      body: doc(
        para(
          text("Hi "),
          mention(viewer.userId, "Viewer"),
          text(" and "),
          mention(stranger.userId, "Stranger"),
        ),
      ),
    }).expect(201);
    const kept = JSON.stringify(made.body.data.body);
    expect(kept).toContain(viewer.userId);
    expect(kept).not.toContain(stranger.userId);
    expect(made.body.data.bodyText).toBe("Hi @Viewer and @Stranger");

    const mine = notices.filter((n) => n.commentId === made.body.data.id);
    const mentioned = mine.find((n) => n.type === "MENTIONED");
    const commented = mine.find((n) => n.type === "TASK_COMMENTED");
    expect(mentioned?.recipientIds).toEqual([viewer.userId]);
    // The owner (the task's reporter) hears about the comment; its author never does.
    expect(commented?.recipientIds).toEqual([owner.userId]);
    expect(mine.flatMap((n) => n.recipientIds)).not.toContain(contributor.userId);
    expect(mine.flatMap((n) => n.recipientIds)).not.toContain(stranger.userId);
  });
});

describe("reactions (AC-COMM-04)", SLOW, () => {
  it("toggles a reaction and counts three people", async () => {
    const { owner, contributor, viewer, comments, list, api } = await setup();
    const made = await post(owner.agent, comments, { body: say("React to me") }).expect(201);
    const react = (agent: typeof owner.agent, emoji = "👍") =>
      post(agent, `${api}/comments/${made.body.data.id}/reactions`, { emoji });

    await react(owner.agent).expect(200);
    await react(contributor.agent).expect(200);
    // Viewers can react too: reacting needs access, not write rights.
    const third = await react(viewer.agent).expect(200);
    expect(third.body.data).toEqual([
      {
        emoji: "👍",
        count: 3,
        userIds: expect.arrayContaining([owner.userId, contributor.userId, viewer.userId]),
      },
    ]);

    const toggled = await react(owner.agent).expect(200);
    expect(toggled.body.data[0]).toMatchObject({ emoji: "👍", count: 2 });
    expect(toggled.body.data[0].userIds).not.toContain(owner.userId);

    await react(owner.agent, "🎉").expect(200);
    expect((await list())[0]?.reactions.map((r) => [r.emoji, r.count])).toEqual([
      ["👍", 2],
      ["🎉", 1],
    ]);
    await react(owner.agent, "not an emoji").expect(400);
  });
});

describe("tenant isolation", SLOW, () => {
  it("answers 404 for every comment address of another organization", async () => {
    const { owner, comments, taskId, api } = await setup();
    const made = await post(owner.agent, comments, { body: say("Private") }).expect(201);
    const commentId = made.body.data.id as string;
    const outsider = await verifiedUser();
    await createOrg(outsider.agent);
    const send = (method: "get" | "post" | "patch" | "delete", path: string, body: object = {}) =>
      outsider.agent[method](`/api/v1${path}`).set("X-Requested-With", "NexusFlow").send(body);

    const attempts = {
      list: send("get", comments),
      mentionable: send("get", `${api}/tasks/${taskId}/mentionable`),
      create: send("post", comments, { body: say("x") }),
      edit: send("patch", `${api}/comments/${commentId}`, { body: say("x") }),
      remove: send("delete", `${api}/comments/${commentId}`),
      react: send("post", `${api}/comments/${commentId}/reactions`, { emoji: "👍" }),
    };
    for (const [name, attempt] of Object.entries(attempts)) {
      expect((await attempt).status, name).toBe(404);
    }
  });
});
