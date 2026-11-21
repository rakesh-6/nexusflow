// Realistic sample data (PRD §17.8, §26.8), used by `pnpm db:seed` in
// development and by the online demo (DEMO_MODE), which rebuilds Acme Studio
// every DEMO_RESET_HOURS. Safe to run again: it first deletes its own data.
//
// - "Acme Studio" (slug acme): the demo company. People are named after the
//   personas in PRD §7, one of each role, 2 workspaces, 3 teams, 5 projects.
// - "Globex" (slug globex): a second, separate company used by tests to prove
//   that one organization can never see another's data (PRD §20.4).
import { createHash, randomBytes } from "node:crypto";
import { DEFAULT_TASK_STATUSES, type StatusCategory } from "@nexusflow/shared";
import { prisma } from "../lib/prisma.ts";
import { hashPassword } from "../modules/auth/password.ts";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const startOfToday = () => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
};
// Worked out again on every run, so a long-running server's demo stays current.
let today = startOfToday();

/** A calendar date `days` away from today (negative = in the past). */
const daysFromToday = (days: number) => new Date(today.getTime() + days * DAY_MS);

/** Picks an item by index, wrapping around the end of the list. */
function pick<T>(items: readonly T[], index: number): T {
  const item = items[index % items.length];
  if (item === undefined) throw new Error("pick() needs a non-empty list");
  return item;
}

// Board order keys in the "fractional indexing" format the app will use later:
// "a0", "a1", ... "az" sort correctly as plain text.
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function positionKey(index: number): string {
  if (index >= BASE62.length) throw new Error("Seed columns hold at most 62 tasks");
  return "a" + BASE62.charAt(index);
}

/** The smallest valid rich-text document (Tiptap JSON) holding one paragraph. */
const richText = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

// ---------------------------------------------------------------------------
// Sample data definitions
// ---------------------------------------------------------------------------

type OrgRole = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

const ACME_PEOPLE: { key: string; name: string; role: OrgRole }[] = [
  { key: "aarav", name: "Aarav Shah", role: "OWNER" },
  { key: "meera", name: "Meera Iyer", role: "ADMIN" },
  { key: "rohan", name: "Rohan Gupta", role: "MEMBER" },
  { key: "sana", name: "Sana Khan", role: "MEMBER" },
  { key: "dev", name: "Dev Patel", role: "MEMBER" },
  { key: "kavya", name: "Kavya Reddy", role: "MEMBER" },
  { key: "ishaan", name: "Ishaan Verma", role: "MEMBER" },
  { key: "priya", name: "Priya Nair (client)", role: "GUEST" },
];

const ACME_WORKSPACES = [
  {
    slug: "general",
    name: "General",
    isDefault: true,
    labels: ["Bug", "Feature", "Frontend", "Backend", "Design"],
  },
  {
    slug: "marketing",
    name: "Marketing",
    isDefault: false,
    labels: ["Campaign", "Social", "Content", "Email"],
  },
];

const LABEL_COLORS = ["#DC2626", "#2563EB", "#0891B2", "#7C3AED", "#DB2777", "#16A34A"];

const ACME_TEAMS = [
  {
    slug: "engineering",
    name: "Engineering",
    workspace: "general",
    lead: "sana",
    members: ["rohan", "ishaan"],
  },
  { slug: "design", name: "Design", workspace: "general", lead: "dev", members: ["meera"] },
  { slug: "growth", name: "Growth", workspace: "marketing", lead: "kavya", members: ["rohan"] },
];

type ProjectStatus = "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

interface ProjectSpec {
  key: string;
  name: string;
  workspace: string;
  team: string | null;
  owner: string;
  status: ProjectStatus;
  priority: Priority;
  startOffset: number;
  endOffset: number;
  guests: string[];
  description: string;
  titles: string[];
}

const ACME_PROJECTS: ProjectSpec[] = [
  {
    key: "NEX",
    name: "NexusFlow Web App",
    workspace: "general",
    team: "engineering",
    owner: "sana",
    status: "ACTIVE",
    priority: "HIGH",
    startOffset: -40,
    endOffset: 50,
    guests: [],
    description: "The main product: boards, lists, calendar and real-time collaboration.",
    titles: [
      "Set up authentication flow",
      "Build Kanban board drag and drop",
      "Add task detail side panel",
      "Implement list view with inline editing",
      "Create calendar month view",
      "Add real-time task updates",
      "Write API rate limiting",
      "Add global search with Ctrl+K",
      "Fix avatar upload on Safari",
      "Improve board performance with 500 tasks",
      "Add dark mode tokens",
      "Write integration tests for tasks",
    ],
  },
  {
    key: "MOB",
    name: "Mobile Redesign",
    workspace: "general",
    team: "design",
    owner: "dev",
    status: "ACTIVE",
    priority: "MEDIUM",
    startOffset: -20,
    endOffset: 40,
    guests: ["priya"],
    description: "Responsive redesign of every core screen for phones and tablets.",
    titles: [
      "Audit current mobile screens",
      "Design bottom navigation",
      "Prototype task card swipe actions",
      "Create tablet layout for the board",
      "Design empty states",
      "Usability test with five users",
      "Update typography scale",
      "Design touch-friendly date picker",
      "Review designs with the client",
      "Hand off specs to engineering",
    ],
  },
  {
    key: "API",
    name: "Public API Platform",
    workspace: "general",
    team: "engineering",
    owner: "rohan",
    status: "PLANNING",
    priority: "LOW",
    startOffset: 10,
    endOffset: 90,
    guests: [],
    description: "API keys, webhooks and documentation for third-party integrations.",
    titles: [
      "Write API design document",
      "Choose API key format",
      "Plan webhook retry policy",
      "Draft OpenAPI documentation",
      "Define rate limits per plan",
      "Research SDK generators",
    ],
  },
  {
    key: "LCH",
    name: "Q1 Launch Campaign",
    workspace: "marketing",
    team: "growth",
    owner: "kavya",
    status: "ACTIVE",
    priority: "URGENT",
    startOffset: -15,
    endOffset: 25,
    guests: [],
    description: "Product launch across email, social media and the website.",
    titles: [
      "Write launch announcement blog post",
      "Design social media graphics",
      "Schedule launch emails",
      "Record product demo video",
      "Prepare press kit",
      "Set up launch landing page",
      "Plan launch day social posts",
      "Coordinate with partner newsletters",
    ],
  },
  {
    key: "BRD",
    name: "Brand Refresh",
    workspace: "marketing",
    team: null,
    owner: "meera",
    status: "COMPLETED",
    priority: "MEDIUM",
    startOffset: -120,
    endOffset: -30,
    guests: [],
    description: "New logo, colors and brand guidelines.",
    titles: [
      "Collect brand inspiration",
      "Design logo options",
      "Choose final color palette",
      "Write brand voice guidelines",
      "Update website with new brand",
      "Publish brand guidelines",
    ],
  },
];

const TASKS_PER_PROJECT = 40;

// How tasks spread across columns in an active project, repeated in this order.
const ACTIVE_STATUS_PATTERN: StatusCategory[] = [
  "DONE",
  "IN_PROGRESS",
  "TODO",
  "DONE",
  "BACKLOG",
  "IN_REVIEW",
  "TODO",
  "DONE",
  "BLOCKED",
  "TODO",
];
const PLANNING_STATUS_PATTERN: StatusCategory[] = ["BACKLOG", "BACKLOG", "TODO"];
const PRIORITIES: Priority[] = [
  "MEDIUM",
  "HIGH",
  "LOW",
  "MEDIUM",
  "URGENT",
  "MEDIUM",
  "LOW",
  "HIGH",
];

const COMMENT_LINES = [
  "Started on this, I will share an update by tomorrow.",
  "Looks good to me. One small note: can we keep the spacing consistent with the board?",
  "Blocked until the API changes are merged.",
  "Moved this to review, please take a look when you can.",
  "Added screenshots of the edge case in the attachments.",
  "Great work, this is much faster now.",
];

// ---------------------------------------------------------------------------
// Step 1: remove data from earlier seed runs
// ---------------------------------------------------------------------------

/** Deletes the sample organizations and their people (cascading deletes do the rest). */
export async function removeSampleData(which: ("acme" | "globex")[] = ["acme", "globex"]) {
  await prisma.organization.deleteMany({ where: { slug: { in: which } } });
  await prisma.user.deleteMany({
    where: { OR: which.map((slug) => ({ email: { endsWith: `@${slug}.example` } })) },
  });
}

// ---------------------------------------------------------------------------
// Step 2: build one organization
// ---------------------------------------------------------------------------

// In development every sample person logs in with this password. The online
// demo gives them a random one instead, so the public password opens nothing.
export const DEMO_PASSWORD = "Acme-demo-2026";
let passwordHashFor: Promise<string> | undefined;

/** Which password the sample people get: the public one, or a random one nobody knows. */
export function setSamplePassword(kind: "public" | "random") {
  passwordHashFor = hashPassword(
    kind === "public" ? DEMO_PASSWORD : randomBytes(24).toString("base64url"),
  );
}

async function createUsers(people: { key: string; name: string }[], domain: string) {
  passwordHashFor ??= hashPassword(DEMO_PASSWORD);
  const passwordHash = await passwordHashFor;
  const users = await prisma.user.createManyAndReturn({
    data: people.map((person) => ({
      email: `${person.key}@${domain}`,
      name: person.name,
      timezone: "Asia/Kolkata",
      emailVerifiedAt: new Date(),
      passwordHash,
    })),
  });
  // Look users up by their short key, e.g. byKey.get("sana").
  const byKey = new Map(users.map((user) => [user.email.split("@")[0] ?? "", user]));
  return (key: string) => {
    const user = byKey.get(key);
    if (!user) throw new Error(`Unknown seed user: ${key}`);
    return user;
  };
}

async function createProject(
  orgId: string,
  workspaceId: string,
  teamId: string | null,
  spec: ProjectSpec,
  userId: (key: string) => { id: string },
  contributorKeys: string[],
  labelIds: string[],
) {
  const ownerId = userId(spec.owner).id;
  const project = await prisma.project.create({
    data: {
      organizationId: orgId,
      workspaceId,
      teamId,
      key: spec.key,
      name: spec.name,
      description: richText(spec.description),
      descriptionText: spec.description,
      status: spec.status,
      priority: spec.priority,
      ownerId,
      createdById: ownerId,
      startDate: daysFromToday(spec.startOffset),
      endDate: daysFromToday(spec.endOffset),
      completedAt: spec.status === "COMPLETED" ? daysFromToday(spec.endOffset) : null,
    },
  });

  // Members: the owner manages; contributors and guests can edit tasks.
  await prisma.projectMember.createMany({
    data: [
      {
        organizationId: orgId,
        projectId: project.id,
        userId: ownerId,
        role: "PROJECT_MANAGER" as const,
      },
      ...[...contributorKeys, ...spec.guests]
        .filter((key) => key !== spec.owner)
        .map((key) => ({
          organizationId: orgId,
          projectId: project.id,
          userId: userId(key).id,
          role: "CONTRIBUTOR" as const,
        })),
    ],
  });

  const statuses = await prisma.taskStatus.createManyAndReturn({
    data: DEFAULT_TASK_STATUSES.map((status, position) => ({
      organizationId: orgId,
      projectId: project.id,
      ...status,
      position,
    })),
  });
  const statusFor = (category: StatusCategory) => {
    const status = statuses.find((s) => s.category === category);
    if (!status) throw new Error(`No ${category} status`);
    return status;
  };

  const milestones = await prisma.milestone.createManyAndReturn({
    data: [
      {
        name: "Beta",
        dueDate: daysFromToday(Math.round((spec.startOffset + spec.endOffset) / 2)),
        position: 0,
      },
      { name: "Launch", dueDate: daysFromToday(spec.endOffset), position: 1 },
    ].map((milestone) => ({
      organizationId: orgId,
      projectId: project.id,
      ...milestone,
      status: spec.status === "COMPLETED" ? ("COMPLETED" as const) : ("OPEN" as const),
    })),
  });

  // Every 6th task becomes a subtask of the task before it; the rest are top-level.
  const columnCounters = new Map<string, number>();
  const pattern =
    spec.status === "COMPLETED"
      ? (["DONE"] as StatusCategory[])
      : spec.status === "PLANNING"
        ? PLANNING_STATUS_PATTERN
        : ACTIVE_STATUS_PATTERN;
  const people = [spec.owner, ...contributorKeys, ...spec.guests];

  const taskData = Array.from({ length: TASKS_PER_PROJECT }, (_, i) => {
    const number = i + 1;
    const category = pick(pattern, i);
    const status = statusFor(category);
    const columnIndex = columnCounters.get(status.id) ?? 0;
    columnCounters.set(status.id, columnIndex + 1);

    const dueOffset =
      spec.status === "COMPLETED"
        ? spec.startOffset + ((i * 3) % (spec.endOffset - spec.startOffset))
        : ((i * 7) % 50) - 15;
    const baseTitle = pick(spec.titles, i);
    const round = Math.floor(i / spec.titles.length);
    const title = round === 0 ? baseTitle : `${baseTitle} (part ${round + 1})`;
    const reporter = userId(pick(people, i + 1));

    return {
      organizationId: orgId,
      projectId: project.id,
      number,
      title,
      description: richText(`${title}. Acceptance: works on desktop and mobile, covered by tests.`),
      descriptionText: `${title}. Acceptance: works on desktop and mobile, covered by tests.`,
      statusId: status.id,
      priority: pick(PRIORITIES, i),
      reporterId: reporter.id,
      createdById: reporter.id,
      milestoneId:
        i % 4 === 0 ? pick(milestones, 0).id : i % 4 === 1 ? pick(milestones, 1).id : null,
      startDate: daysFromToday(dueOffset - 2 - (i % 5)),
      dueDate: i % 9 === 8 ? null : daysFromToday(dueOffset),
      estimatedHours: String(1 + (i % 8) * 1.5),
      actualHours: category === "DONE" ? String(1 + (i % 8) * 1.75) : null,
      position: positionKey(columnIndex),
      completedAt:
        category === "DONE"
          ? new Date(daysFromToday(Math.min(dueOffset, -1)).getTime() + 15 * 3_600_000)
          : null,
      isSubtask: i % 6 === 5,
      createdAt: daysFromToday(Math.min(dueOffset - 10, -1)),
    };
  });

  // Create top-level tasks first, then subtasks that point at them.
  const topLevel = await prisma.task.createManyAndReturn({
    data: taskData.filter((t) => !t.isSubtask).map(({ isSubtask: _, ...task }) => task),
  });
  const taskByNumber = new Map(topLevel.map((task) => [task.number, task]));
  const subtasks = await prisma.task.createManyAndReturn({
    data: taskData
      .filter((t) => t.isSubtask)
      .map(({ isSubtask: _, ...task }) => {
        const parent = taskByNumber.get(task.number - 1);
        if (!parent) throw new Error(`Subtask ${task.number} has no parent`);
        return { ...task, parentTaskId: parent.id };
      }),
  });
  const allTasks = [...topLevel, ...subtasks].sort((a, b) => a.number - b.number);

  await prisma.project.update({
    where: { id: project.id },
    data: { taskSequence: TASKS_PER_PROJECT },
  });

  // Assignees: one person per task, sometimes two.
  await prisma.taskAssignee.createMany({
    data: allTasks.flatMap((task, i) => {
      const first = pick(people, i);
      const second = pick(people, i + 2);
      const keys = i % 4 === 0 && second !== first ? [first, second] : [first];
      return keys.map((key) => ({
        organizationId: orgId,
        taskId: task.id,
        userId: userId(key).id,
      }));
    }),
  });

  // Labels: about half the tasks get one or two.
  await prisma.taskLabel.createMany({
    data: allTasks.flatMap((task, i) => {
      const ids = new Set<string>();
      if (i % 2 === 0) ids.add(pick(labelIds, i));
      if (i % 5 === 0) ids.add(pick(labelIds, i + 2));
      return [...ids].map((labelId) => ({ taskId: task.id, labelId }));
    }),
  });

  // Dependencies: a few "this must finish first" links between top-level tasks.
  await prisma.taskDependency.createMany({
    data: topLevel
      .filter((_, i) => i % 8 === 0 && topLevel[i + 1] !== undefined)
      .map((task) => ({
        organizationId: orgId,
        blockingTaskId: task.id,
        blockedTaskId: taskByNumber.get(task.number + 1)?.id ?? task.id,
        createdById: ownerId,
      }))
      .filter((dependency) => dependency.blockingTaskId !== dependency.blockedTaskId),
  });

  // Comments on the first few tasks, with one reply and a few reactions.
  const comments = await prisma.comment.createManyAndReturn({
    data: topLevel.slice(0, 6).map((task, i) => {
      const text = pick(COMMENT_LINES, i + spec.key.length);
      return {
        organizationId: orgId,
        taskId: task.id,
        authorId: userId(pick(people, i + 1)).id,
        body: richText(text),
        bodyText: text,
      };
    }),
  });
  const firstComment = comments[0];
  if (firstComment) {
    const reply = "Thanks, I will pick this up next.";
    await prisma.comment.create({
      data: {
        organizationId: orgId,
        taskId: firstComment.taskId,
        parentCommentId: firstComment.id,
        authorId: ownerId,
        body: richText(reply),
        bodyText: reply,
      },
    });
    await prisma.commentReaction.createMany({
      data: people
        .slice(0, 2)
        .map((key) => ({ commentId: firstComment.id, userId: userId(key).id, emoji: "👍" })),
      skipDuplicates: true,
    });
  }

  // History: one "created" entry for the project and for every task.
  await prisma.activityLog.createMany({
    data: [
      {
        entityType: "project",
        entityId: project.id,
        action: "project.created",
        actorId: ownerId,
        createdAt: daysFromToday(spec.startOffset),
      },
      ...allTasks.map((task) => ({
        entityType: "task",
        entityId: task.id,
        taskId: task.id,
        action: "task.created",
        actorId: task.reporterId,
        createdAt: task.createdAt,
      })),
    ].map((entry) => ({
      organizationId: orgId,
      workspaceId,
      projectId: project.id,
      category: "DOMAIN" as const,
      ...entry,
    })),
  });

  return {
    project,
    taskCount: allTasks.length,
    commentCount: comments.length + (firstComment ? 1 : 0),
  };
}

export async function seedAcme() {
  today = startOfToday();
  const userId = await createUsers(ACME_PEOPLE, "acme.example");
  const owner = userId("aarav");

  const org = await prisma.organization.create({
    data: { name: "Acme Studio", slug: "acme", ownerId: owner.id, settings: { aiEnabled: true } },
  });
  await prisma.organizationMember.createMany({
    data: ACME_PEOPLE.map((person) => ({
      organizationId: org.id,
      userId: userId(person.key).id,
      role: person.role,
    })),
  });
  // Two workspaces need a paid plan; this is a test-mode subscription, no real payment.
  await prisma.subscription.create({
    data: {
      organizationId: org.id,
      planTier: "PRO",
      status: "ACTIVE",
      interval: "MONTHLY",
      currentPeriodStart: daysFromToday(-10),
      currentPeriodEnd: daysFromToday(20),
    },
  });

  const workspaces = new Map<string, { id: string; labelIds: string[] }>();
  for (const spec of ACME_WORKSPACES) {
    const workspace = await prisma.workspace.create({
      data: {
        organizationId: org.id,
        name: spec.name,
        slug: spec.slug,
        isDefault: spec.isDefault,
        createdById: owner.id,
      },
    });
    // Everyone except the guest is a workspace member; the owner and admin are admins.
    await prisma.workspaceMember.createMany({
      data: ACME_PEOPLE.filter((p) => p.role !== "GUEST").map((p) => ({
        organizationId: org.id,
        workspaceId: workspace.id,
        userId: userId(p.key).id,
        role: p.role === "MEMBER" ? ("WORKSPACE_MEMBER" as const) : ("WORKSPACE_ADMIN" as const),
      })),
    });
    const labels = await prisma.label.createManyAndReturn({
      data: spec.labels.map((name, i) => ({
        organizationId: org.id,
        workspaceId: workspace.id,
        name,
        color: pick(LABEL_COLORS, i),
      })),
    });
    workspaces.set(spec.slug, { id: workspace.id, labelIds: labels.map((l) => l.id) });
  }
  const workspace = (slug: string) => {
    const found = workspaces.get(slug);
    if (!found) throw new Error(`Unknown workspace: ${slug}`);
    return found;
  };

  const teams = new Map<string, { id: string; memberKeys: string[] }>();
  for (const spec of ACME_TEAMS) {
    const team = await prisma.team.create({
      data: {
        organizationId: org.id,
        workspaceId: workspace(spec.workspace).id,
        name: spec.name,
        slug: spec.slug,
        description: `${spec.name} team`,
      },
    });
    await prisma.teamMember.createMany({
      data: [
        {
          organizationId: org.id,
          teamId: team.id,
          userId: userId(spec.lead).id,
          role: "LEAD" as const,
        },
        ...spec.members.map((key) => ({
          organizationId: org.id,
          teamId: team.id,
          userId: userId(key).id,
          role: "MEMBER" as const,
        })),
      ],
    });
    teams.set(spec.slug, { id: team.id, memberKeys: [spec.lead, ...spec.members] });
  }

  let tasks = 0;
  let comments = 0;
  for (const spec of ACME_PROJECTS) {
    const team = spec.team ? teams.get(spec.team) : undefined;
    const contributors = team ? team.memberKeys : ["meera", "kavya"];
    const result = await createProject(
      org.id,
      workspace(spec.workspace).id,
      team?.id ?? null,
      spec,
      userId,
      contributors,
      workspace(spec.workspace).labelIds,
    );
    tasks += result.taskCount;
    comments += result.commentCount;
  }

  // A pending invitation, so the admin panel has something to show.
  await prisma.invitation.create({
    data: {
      organizationId: org.id,
      workspaceId: workspace("general").id,
      email: "new.hire@acme.example",
      role: "MEMBER",
      tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
      invitedById: owner.id,
      expiresAt: daysFromToday(7),
    },
  });

  // A few Inbox items for the owner.
  await prisma.notification.createMany({
    data: [
      {
        type: "TASK_ASSIGNED" as const,
        title: "Sana Khan assigned you NEX-3",
        body: "Add task detail side panel",
      },
      {
        type: "MENTIONED" as const,
        title: "Dev Patel mentioned you in MOB-2",
        body: "Can you review the bottom navigation?",
      },
      {
        type: "TASK_DUE_SOON" as const,
        title: "LCH-4 is due tomorrow",
        body: "Record product demo video",
      },
    ].map((n) => ({ organizationId: org.id, userId: owner.id, data: { orgSlug: "acme" }, ...n })),
  });

  return { people: ACME_PEOPLE.length, projects: ACME_PROJECTS.length, tasks, comments };
}

export async function seedGlobex() {
  today = startOfToday();
  const people = [
    { key: "gina", name: "Gina Lopez", role: "OWNER" as const },
    { key: "tom", name: "Tom Becker", role: "MEMBER" as const },
  ];
  const userId = await createUsers(people, "globex.example");
  const owner = userId("gina");

  const org = await prisma.organization.create({
    data: { name: "Globex", slug: "globex", ownerId: owner.id },
  });
  await prisma.organizationMember.createMany({
    data: people.map((p) => ({ organizationId: org.id, userId: userId(p.key).id, role: p.role })),
  });
  await prisma.subscription.create({ data: { organizationId: org.id } });
  const ws = await prisma.workspace.create({
    data: {
      organizationId: org.id,
      name: "General",
      slug: "general",
      isDefault: true,
      createdById: owner.id,
    },
  });
  await prisma.workspaceMember.createMany({
    data: [
      {
        organizationId: org.id,
        workspaceId: ws.id,
        userId: owner.id,
        role: "WORKSPACE_ADMIN" as const,
      },
      {
        organizationId: org.id,
        workspaceId: ws.id,
        userId: userId("tom").id,
        role: "WORKSPACE_MEMBER" as const,
      },
    ],
  });
  const label = await prisma.label.create({
    data: { organizationId: org.id, workspaceId: ws.id, name: "Internal", color: "#475569" },
  });
  const result = await createProject(
    org.id,
    ws.id,
    null,
    {
      key: "GLX",
      name: "Globex Internal",
      workspace: "general",
      team: null,
      owner: "gina",
      status: "ACTIVE",
      priority: "MEDIUM",
      startOffset: -10,
      endOffset: 30,
      guests: [],
      description: "Private Globex project. Acme users must never see this.",
      titles: ["Secret Globex roadmap", "Globex hiring plan", "Globex budget review"],
    },
    userId,
    ["tom"],
    [label.id],
  );
  return {
    people: people.length,
    projects: 1,
    tasks: result.taskCount,
    comments: result.commentCount,
  };
}
