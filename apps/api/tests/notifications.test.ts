import { addDays } from "@nexusflow/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sendNotificationEmail } from "../src/jobs/index.ts";
import { emptyTrash, expireInvitations, removeOldNotifications } from "../src/jobs/cleanup.ts";
import {
  sendDueSoonReminders,
  sendMilestoneReminders,
  sendOverdueReminders,
} from "../src/jobs/reminders.ts";
import { onEvent, type DomainEvent } from "../src/lib/events.ts";
import { sentJobs } from "../src/lib/jobs.ts";
import { memoryMailbox } from "../src/lib/mail/index.ts";
import { prisma } from "../src/lib/prisma.ts";
import { settleNotifications } from "../src/modules/notifications/notifications.service.ts";
import { createTestClient } from "./helpers/http.ts";
import { orgHelpers } from "./helpers/orgs.ts";

// Notifications, the inbox, reminders and clean-up jobs (PRD §11.10, AC-NOTIF-01…04).
const client = createTestClient("notify-test.example");
const { post, put } = client;
const { verifiedUser, createOrg, joinedMember, invite } = orgHelpers(client);
type Person = Awaited<ReturnType<typeof verifiedUser>>;

const SLOW = { timeout: 300_000 };
const live: DomainEvent[] = [];
let stop = () => {};
beforeAll(() => {
  stop = onEvent((event) => {
    if (event.name === "notification:new") live.push(event);
  });
});
afterAll(async () => {
  stop();
  await client.cleanup();
  await prisma.$disconnect();
});

interface Item {
  id: string;
  type: string;
  title: string;
  readAt: string | null;
  data: { taskKey?: string; orgSlug?: string };
}

let keyCounter = 0;
async function setup() {
  const owner = await verifiedUser();
  const slug = await createOrg(owner.agent);
  const api = `/orgs/${slug}`;
  const project = await post(owner.agent, `${api}/workspaces/general/projects`, {
    name: "Alerts",
    key: `N${(++keyCounter).toString(36).toUpperCase()}${Date.now() % 1000}`.slice(0, 6),
  }).expect(201);
  const projectId = project.body.data.id as string;
  const member = await joinedMember(owner.agent, slug);
  await post(owner.agent, `${api}/projects/${projectId}/members`, {
    userId: member.userId,
    role: "CONTRIBUTOR",
  }).expect(201);
  const task = (body: object) =>
    post(owner.agent, `${api}/projects/${projectId}/tasks`, { title: "Do it", ...body })
      .expect(201)
      .then((response) => response.body.data as { id: string; key: string });
  return { owner, member, slug, api, projectId, task };
}

/**
 * A person's notifications, without the "X joined" notice the inviter gets
 * when someone accepts an invitation (that happens in every setup()).
 */
async function inbox(person: Person, query = "") {
  await settleNotifications();
  const response = await person.agent.get(`/api/v1/notifications${query}`).expect(200);
  return (response.body.data as Item[]).filter((item) => item.type !== "MEMBER_JOINED");
}

const emailJobsFor = (userId: string) =>
  sentJobs.filter((job) => job.name === "email.notification" && job.data["userId"] === userId);

describe("delivery and preferences (AC-NOTIF-01, FR-NOTIF-07)", SLOW, () => {
  it("notifies the assignee in the app, live and by email, never the actor", async () => {
    const { owner, member, task } = await setup();
    const first = await task({ assigneeIds: [member.userId, owner.userId] });

    const items = await inbox(member);
    expect(items).toHaveLength(2); // added to the project, then assigned
    expect(items[0]).toMatchObject({ type: "TASK_ASSIGNED", data: { taskKey: first.key } });
    expect(items[0]?.title).toContain(first.key);
    expect(await inbox(owner)).toEqual([]);
    expect(live.some((event) => event.userId === member.userId)).toBe(true);
    expect(emailJobsFor(member.userId)).toHaveLength(1);

    // The email job sends one email with a link to the task.
    memoryMailbox.clear();
    await sendNotificationEmail(emailJobsFor(member.userId)[0]?.data ?? {});
    expect(memoryMailbox.sent).toHaveLength(1);
    expect(memoryMailbox.sent[0]).toMatchObject({ to: member.email });
    expect(memoryMailbox.sent[0]?.text).toContain(`/tasks/${first.key}`);

    // With email switched off, the app still shows it but no email is queued.
    const saved = await put(member.agent, "/users/me/notification-preferences", {
      preferences: [{ type: "TASK_ASSIGNED", inApp: true, email: false }],
    }).expect(200);
    expect(saved.body.data).toContainEqual({ type: "TASK_ASSIGNED", inApp: true, email: false });
    await task({ assigneeIds: [member.userId] });
    expect((await inbox(member)).filter((item) => item.type === "TASK_ASSIGNED")).toHaveLength(2);
    expect(emailJobsFor(member.userId)).toHaveLength(1);

    // With the app switched off too, nothing is stored.
    await put(member.agent, "/users/me/notification-preferences", {
      preferences: [{ type: "TASK_ASSIGNED", inApp: false, email: false }],
    }).expect(200);
    await task({ assigneeIds: [member.userId] });
    expect((await inbox(member)).filter((item) => item.type === "TASK_ASSIGNED")).toHaveLength(2);
  });
});

describe("the inbox (AC-NOTIF-03, AC-NOTIF-04)", SLOW, () => {
  it("counts, marks read and unread, and marks all read for one person only", async () => {
    const { owner, member, api, task } = await setup();
    const assigned = await task({ assigneeIds: [member.userId] });
    // The member comments: the owner (the reporter) is told.
    await post(member.agent, `${api}/tasks/${assigned.id}/comments`, {
      body: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "On it" }] }],
      },
    }).expect(201);

    const mine = await inbox(member);
    expect(mine.map((item) => item.type).sort()).toEqual(["PROJECT_ADDED", "TASK_ASSIGNED"]);
    const count = await member.agent.get("/api/v1/notifications/unread-count").expect(200);
    const stored = await prisma.notification.count({
      where: { userId: member.userId, readAt: null },
    });
    expect(count.body.data.total).toBe(stored);
    expect(Object.values(count.body.data.byOrg)).toEqual([stored]);

    const first = mine[0] as Item;
    await post(member.agent, `/notifications/${first.id}/read`).expect(200);
    expect((await inbox(member, "?unread=true")).map((item) => item.id)).not.toContain(first.id);
    await post(member.agent, `/notifications/${first.id}/unread`).expect(200);
    expect((await inbox(member, "?unread=true")).map((item) => item.id)).toContain(first.id);

    // Nobody can touch someone else's notification.
    const ownersItems = await inbox(owner);
    expect(ownersItems.map((item) => item.type)).toEqual(["TASK_COMMENTED"]);
    await post(member.agent, `/notifications/${ownersItems[0]?.id}/read`).expect(404);

    const all = await post(member.agent, "/notifications/read-all").expect(200);
    expect(all.body.data.updated).toBe(2);
    expect(await inbox(member, "?unread=true")).toEqual([]);
    expect(await inbox(owner, "?unread=true")).toHaveLength(1);
    expect((await inbox(owner, "?mentions=true")).length).toBe(0);

    await client.newAgent().get("/api/v1/notifications").expect(401);
  });
});

describe("reminders (AC-NOTIF-02)", SLOW, () => {
  it("sends each due-soon, overdue and milestone reminder exactly once", async () => {
    const { owner, member, api, projectId, task } = await setup();
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date(`${today}T10:00:00Z`); // 10:00 for people in UTC
    const soon = await task({ assigneeIds: [member.userId], dueDate: addDays(today, 1) });
    const late = await task({ assigneeIds: [member.userId], dueDate: addDays(today, -1) });
    await post(owner.agent, `${api}/projects/${projectId}/milestones`, {
      name: "Launch",
      dueDate: addDays(today, 3),
    }).expect(201);

    for (let run = 0; run < 24; run++) await sendDueSoonReminders(now);
    await sendOverdueReminders(now);
    await sendOverdueReminders(now);
    await sendMilestoneReminders(now);
    await settleNotifications();
    await sendMilestoneReminders(now);

    const mine = await inbox(member);
    const of = (type: string) => mine.filter((item) => item.type === type);
    expect(of("TASK_DUE_SOON").map((item) => item.data.taskKey)).toEqual([soon.key]);
    expect(of("TASK_OVERDUE").map((item) => item.data.taskKey)).toEqual([late.key]);
    // The owner manages the project, so the milestone reminder goes to them.
    expect((await inbox(owner)).filter((item) => item.type === "MILESTONE_DUE_SOON")).toHaveLength(
      1,
    );
  });
});

describe("clean-up jobs", SLOW, () => {
  it("removes old notifications, empties old trash and expires invitations", async () => {
    const { owner, member, slug, api, projectId } = await setup();
    await settleNotifications();
    const old = await prisma.notification.create({
      data: {
        userId: member.userId,
        type: "TASK_ASSIGNED",
        title: "Old news",
        createdAt: new Date(Date.now() - 91 * 86_400_000),
      },
    });
    await removeOldNotifications();
    expect(await prisma.notification.findUnique({ where: { id: old.id } })).toBeNull();

    await client.del(owner.agent, `${api}/projects/${projectId}`).expect(200);
    await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date(Date.now() - 31 * 86_400_000) },
    });
    await emptyTrash();
    expect(await prisma.project.findUnique({ where: { id: projectId } })).toBeNull();

    await invite(owner.agent, slug, client.newEmail());
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug } });
    await prisma.invitation.updateMany({
      where: { organizationId: organization.id, status: "PENDING" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await expireInvitations()).toBeGreaterThanOrEqual(1);
    const left = await prisma.invitation.count({
      where: { organizationId: organization.id, status: "PENDING" },
    });
    expect(left).toBe(0);
  });
});
