import {
  addDays,
  deadlineOutputSchema,
  insightsOutputSchema,
  meetingNotesOutputSchema,
  projectPlanOutputSchema,
  projectSummaryOutputSchema,
  taskBreakdownOutputSchema,
  taskDescriptionOutputSchema,
  todayIn,
  type RichTextDoc,
  type TaskDescriptionOutput,
} from "@nexusflow/shared";
import type { User } from "../../generated/prisma/client.ts";
import type { AiProvider } from "../../lib/ai/provider.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { workspaceAnalytics } from "../analytics/analytics.service.ts";
import { loadWorkspace } from "../organizations/workspaces.service.ts";
import { assertProjectRight, loadProject, toDateOnly } from "../projects/access.ts";
import { loadTask } from "../tasks/taskAccess.ts";
import { askAi } from "./ai.guard.ts";
import { data, PROMPTS } from "./prompts.ts";

// The AI features (PRD §11.16.2, §24.2). Each one checks access like the
// matching non-AI screen, sends only the fields it needs (PRD §24.1 "minimal
// data") and returns a suggestion; nothing is saved here.

interface Ctx {
  tenant: Tenant;
  user: User;
  provider: AiProvider;
}

const ask = <F extends keyof typeof PROMPTS>(ctx: Ctx, feature: F, prompt: string) => ({
  feature,
  system: PROMPTS[feature].system,
  maxTokens: PROMPTS[feature].maxTokens,
  prompt,
});

const projectFacts = (project: { name: string; descriptionText: string | null }) => ({
  project: project.name,
  projectDescription: project.descriptionText?.slice(0, 2_000) ?? null,
});

/** The description as a document the task editor can show (paragraphs and lists only). */
function descriptionDoc(output: TaskDescriptionOutput): RichTextDoc {
  const text = (value: string) => [{ type: "text", text: value }];
  const list = (items: string[]) => ({
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [{ type: "paragraph", content: text(item) }],
    })),
  });
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: text(output.goal) },
      ...(output.details.length ? [list(output.details)] : []),
      { type: "heading", attrs: { level: 3 }, content: text("Acceptance criteria") },
      list(output.acceptanceCriteria),
    ],
  };
}

export async function taskDescription(
  ctx: Ctx,
  input: { projectId: string; title: string; taskId?: string | undefined },
) {
  const { project, access } = await loadProject(ctx.tenant, input.projectId, ctx.user.id);
  assertProjectRight(access, "canContribute");
  const existing = input.taskId
    ? (await loadTask(ctx.tenant, input.taskId, ctx.user.id)).task.descriptionText
    : null;
  const output = await askAi(ctx.tenant, ctx.user, ctx.provider, {
    ...ask(
      ctx,
      "TASK_DESCRIPTION",
      data({
        ...projectFacts(project),
        taskTitle: input.title,
        currentDescription: existing?.slice(0, 2_000) ?? null,
      }),
    ),
    schema: taskDescriptionOutputSchema,
  });
  return { ...output, description: descriptionDoc(output) };
}

export async function taskBreakdown(ctx: Ctx, taskId: string) {
  const { task, loaded } = await loadTask(ctx.tenant, taskId, ctx.user.id);
  assertProjectRight(loaded.access, "canContribute");
  return askAi(ctx.tenant, ctx.user, ctx.provider, {
    ...ask(
      ctx,
      "TASK_BREAKDOWN",
      data({
        ...projectFacts(loaded.project),
        taskTitle: task.title,
        taskDescription: task.descriptionText?.slice(0, 4_000) ?? null,
        estimatedHours: task.estimatedHours === null ? null : Number(task.estimatedHours),
      }),
    ),
    schema: taskBreakdownOutputSchema,
  });
}

export async function projectPlan(ctx: Ctx, projectId: string) {
  const { project, access } = await loadProject(ctx.tenant, projectId, ctx.user.id);
  assertProjectRight(access, "canManage");
  return askAi(ctx.tenant, ctx.user, ctx.provider, {
    ...ask(
      ctx,
      "PROJECT_PLAN",
      data({
        ...projectFacts(project),
        startDate: toDateOnly(project.startDate),
        endDate: toDateOnly(project.endDate),
        today: todayIn(ctx.user.timezone || "UTC"),
      }),
    ),
    schema: projectPlanOutputSchema,
  });
}

export async function projectSummary(ctx: Ctx, projectId: string) {
  const { project } = await loadProject(ctx.tenant, projectId, ctx.user.id);
  const today = todayIn(ctx.user.timezone || "UTC");
  const since = new Date(Date.now() - 14 * 86_400_000);
  const [tasks, milestones, recentChanges] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, deletedAt: null, parentTaskId: null },
      select: {
        title: true,
        priority: true,
        dueDate: true,
        completedAt: true,
        status: { select: { name: true, category: true } },
        _count: { select: { assignees: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 150,
    }),
    prisma.milestone.findMany({
      where: { projectId },
      select: { name: true, dueDate: true, status: true },
      take: 20,
    }),
    prisma.task.count({ where: { projectId, deletedAt: null, updatedAt: { gte: since } } }),
  ]);
  const facts = {
    ...projectFacts(project),
    status: project.status,
    today,
    endDate: toDateOnly(project.endDate),
    tasksChangedInLast14Days: recentChanges,
    milestones: milestones.map((m) => ({
      name: m.name,
      dueDate: toDateOnly(m.dueDate),
      status: m.status,
    })),
    tasks: tasks.map((t) => ({
      title: t.title.slice(0, 120),
      status: t.status.category,
      priority: t.priority,
      dueDate: toDateOnly(t.dueDate),
      overdue: !!t.dueDate && !t.completedAt && (toDateOnly(t.dueDate) ?? "") < today,
      assigned: t._count.assignees > 0,
    })),
  };
  return askAi(ctx.tenant, ctx.user, ctx.provider, {
    ...ask(ctx, "PROJECT_SUMMARY", data(facts)),
    schema: projectSummaryOutputSchema,
  });
}

export async function meetingNotes(
  ctx: Ctx,
  input: { text: string; projectId?: string | undefined },
) {
  const project = input.projectId
    ? (await loadProject(ctx.tenant, input.projectId, ctx.user.id)).project
    : null;
  return askAi(ctx.tenant, ctx.user, ctx.provider, {
    ...ask(
      ctx,
      "MEETING_NOTES",
      `${project ? `Project: ${project.name}\n` : ""}${data(input.text)}`,
    ),
    schema: meetingNotesOutputSchema,
  });
}

export async function insights(ctx: Ctx, workspaceId: string) {
  const found = await prisma.workspace.findFirst({
    where: { id: workspaceId, organizationId: ctx.tenant.organization.id, deletedAt: null },
    select: { slug: true },
  });
  if (!found) throw new AppError(404, "NOT_FOUND", "Workspace not found");
  const { workspace } = await loadWorkspace(ctx.tenant, found.slug, ctx.user.id);
  const numbers = await workspaceAnalytics(ctx.tenant, ctx.user, workspace, {});
  // Numbers only: no activity text, no people's names.
  const facts = {
    range: numbers.range,
    tiles: numbers.tiles,
    trend: numbers.trend,
    byCategory: numbers.byCategory,
    byPriority: numbers.byPriority,
    projects: numbers.projects.map((p) => ({
      name: p.name,
      open: p.open,
      overdue: p.overdue,
      progress: p.progress,
      health: p.health,
    })),
    // Workload without names: just how loaded each person is.
    workload: numbers.workload.map((w) => ({ openTasks: w.openTasks, utilization: w.utilization })),
  };
  return askAi(ctx.tenant, ctx.user, ctx.provider, {
    ...ask(ctx, "INSIGHTS", data(facts)),
    schema: insightsOutputSchema,
  });
}

export async function deadlineSuggestion(ctx: Ctx, taskId: string) {
  const { task, loaded } = await loadTask(ctx.tenant, taskId, ctx.user.id);
  assertProjectRight(loaded.access, "canContribute");
  const today = todayIn(ctx.user.timezone || "UTC");
  const assigneeIds = task.assignees.map((a) => a.user.id);
  const [openBlockers, workload] = await Promise.all([
    prisma.taskDependency.count({
      where: {
        blockedTaskId: task.id,
        blockingTask: { deletedAt: null, status: { category: { not: "DONE" } } },
      },
    }),
    Promise.all(
      assigneeIds.map(async (userId) => {
        const open = await prisma.task.aggregate({
          where: {
            organizationId: ctx.tenant.organization.id,
            deletedAt: null,
            assignees: { some: { userId } },
            status: { category: { not: "DONE" } },
            dueDate: { lte: new Date(`${addDays(today, 14)}T00:00:00.000Z`) },
          },
          _count: { _all: true },
          _sum: { estimatedHours: true },
        });
        return {
          openTasksDueIn14Days: open._count._all,
          estimatedHours: Number(open._sum.estimatedHours ?? 0),
        };
      }),
    ),
  ]);
  const output = await askAi(ctx.tenant, ctx.user, ctx.provider, {
    ...ask(
      ctx,
      "DEADLINE_SUGGESTION",
      data({
        today,
        taskTitle: task.title,
        estimatedHours: task.estimatedHours === null ? null : Number(task.estimatedHours),
        currentDueDate: toDateOnly(task.dueDate),
        openBlockers,
        assigneeWorkload: workload,
        projectEndDate: toDateOnly(loaded.project.endDate),
      }),
    ),
    schema: deadlineOutputSchema,
  });
  // Never suggest a day in the past.
  return output.suggestedDueDate < today ? { ...output, suggestedDueDate: today } : output;
}
