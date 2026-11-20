import {
  addDays,
  granularityFor,
  MAX_RANGE_DAYS,
  PRIORITIES,
  projectHealth,
  rangeDays,
  resolveRange,
  STATUS_CATEGORIES,
  taskKey,
  todayIn,
  WEEKLY_CAPACITY_HOURS,
  type Analytics,
  type Priority,
  type StatusCategory,
} from "@nexusflow/shared";
import { Prisma, type User, type Workspace } from "../../generated/prisma/client.ts";
import { assertWithinPlan } from "../../lib/planGuard.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import {
  accessFor,
  accessibleProjectsWhere,
  projectInclude,
  toDateOnly,
} from "../projects/access.ts";

// Dashboard numbers (PRD §11.12). Everything counts only projects the person
// can open, so a member and an admin see different totals (AC-DASH-03).

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; value: Analytics }>();

const uuids = (ids: string[]) => Prisma.sql`${ids}::uuid[]`;

/** Bucket labels between two dates, so empty days still show as 0. */
function buckets(from: string, to: string, granularity: "day" | "week" | "month") {
  const labels: string[] = [];
  let cursor = from;
  if (granularity === "week") {
    const weekday = (new Date(`${from}T00:00:00Z`).getUTCDay() + 6) % 7;
    cursor = addDays(from, -weekday);
  }
  if (granularity === "month") cursor = `${from.slice(0, 7)}-01`;
  while (cursor <= to) {
    labels.push(cursor);
    if (granularity === "day") cursor = addDays(cursor, 1);
    else if (granularity === "week") cursor = addDays(cursor, 7);
    else {
      const next = new Date(`${cursor}T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      cursor = next.toISOString().slice(0, 10);
    }
  }
  return labels;
}

export async function workspaceAnalytics(
  tenant: Tenant,
  user: User,
  workspace: Workspace,
  query: { from?: string | undefined; to?: string | undefined; projectId?: string | undefined },
): Promise<Analytics> {
  const tz = user.timezone || "UTC";
  const today = todayIn(tz);
  const { from, to } = resolveRange(query, today);
  const days = rangeDays(from, to);
  if (days > MAX_RANGE_DAYS) {
    throw new AppError(400, "VALIDATION_ERROR", "Choose at most 366 days");
  }
  // FREE organizations look back 30 days (AC-DASH-04).
  assertWithinPlan(tenant.subscription, "analyticsHistoryDays", 0, rangeDays(from, today));

  const cacheKey = JSON.stringify([
    user.id,
    tenant.membership.role,
    workspace.id,
    from,
    to,
    query.projectId,
  ]);
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  // The projects this person may see in the workspace (PRD §12.5).
  const orgRole = tenant.membership.role;
  const projects = (
    await prisma.project.findMany({
      where: {
        AND: [
          accessibleProjectsWhere(tenant.organization.id, user.id, orgRole),
          { workspaceId: workspace.id },
          query.projectId ? { id: query.projectId } : {},
        ],
      },
      include: projectInclude(user.id),
    })
  ).filter((project) => accessFor(project, orgRole));
  if (query.projectId && projects.length === 0) {
    throw new AppError(404, "NOT_FOUND", "Project not found");
  }
  const ids = projects.map((project) => project.id);
  const granularity = granularityFor(days);
  const empty = ids.length === 0;

  const taskScope = Prisma.sql`t."projectId" = ANY(${uuids(ids)}) AND t."deletedAt" IS NULL`;
  const [perProject, trendRows, createdRows, categoryRows, priorityRows, workloadRows, mineRows] =
    empty
      ? [[], [], [], [], [], [], []]
      : await Promise.all([
          prisma.$queryRaw<
            { id: string; total: number; done: number; open: number; overdue: number }[]
          >`
            SELECT t."projectId" AS id,
              count(*)::int AS total,
              count(*) FILTER (WHERE s.category = 'DONE')::int AS done,
              count(*) FILTER (WHERE s.category <> 'DONE')::int AS open,
              count(*) FILTER (WHERE s.category <> 'DONE' AND t."dueDate" < ${today}::date)::int AS overdue
            FROM "Task" t JOIN "TaskStatus" s ON s.id = t."statusId"
            WHERE ${taskScope}
            GROUP BY t."projectId"`,
          prisma.$queryRaw<{ bucket: string; count: number }[]>`
            SELECT to_char(date_trunc(${granularity}, (t."completedAt" AT TIME ZONE ${tz})), 'YYYY-MM-DD') AS bucket,
              count(*)::int AS count
            FROM "Task" t JOIN "TaskStatus" s ON s.id = t."statusId"
            WHERE ${taskScope} AND s.category = 'DONE'
              AND (t."completedAt" AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date
            GROUP BY 1`,
          prisma.$queryRaw<{ bucket: string; count: number }[]>`
            SELECT to_char(date_trunc(${granularity}, (t."createdAt" AT TIME ZONE ${tz})), 'YYYY-MM-DD') AS bucket,
              count(*)::int AS count
            FROM "Task" t
            WHERE ${taskScope}
              AND (t."createdAt" AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date
            GROUP BY 1`,
          prisma.$queryRaw<{ category: StatusCategory; count: number }[]>`
            SELECT s.category::text AS category, count(*)::int AS count
            FROM "Task" t JOIN "TaskStatus" s ON s.id = t."statusId"
            WHERE ${taskScope}
            GROUP BY s.category`,
          prisma.$queryRaw<{ priority: Priority; count: number }[]>`
            SELECT t.priority::text AS priority, count(*)::int AS count
            FROM "Task" t JOIN "TaskStatus" s ON s.id = t."statusId"
            WHERE ${taskScope} AND s.category <> 'DONE'
            GROUP BY t.priority`,
          prisma.$queryRaw<
            {
              userId: string;
              openTasks: number;
              estimated: number | null;
              dueSoon: number | null;
            }[]
          >`
            SELECT a."userId" AS "userId", count(*)::int AS "openTasks",
              sum(t."estimatedHours")::float AS estimated,
              (sum(t."estimatedHours") FILTER (
                WHERE t."dueDate" BETWEEN ${today}::date AND ${addDays(today, 7)}::date))::float AS "dueSoon"
            FROM "Task" t
            JOIN "TaskStatus" s ON s.id = t."statusId"
            JOIN "TaskAssignee" a ON a."taskId" = t.id
            WHERE ${taskScope} AND s.category <> 'DONE'
            GROUP BY a."userId"
            ORDER BY count(*) DESC
            LIMIT 20`,
          prisma.$queryRaw<
            {
              completed: number;
              hours: number | null;
              onTime: number;
              withDue: number;
              cycle: number | null;
            }[]
          >`
            SELECT count(*)::int AS completed,
              sum(t."actualHours")::float AS hours,
              count(*) FILTER (WHERE t."dueDate" IS NOT NULL AND (t."completedAt" AT TIME ZONE ${tz})::date <= t."dueDate")::int AS "onTime",
              count(*) FILTER (WHERE t."dueDate" IS NOT NULL)::int AS "withDue",
              (avg(extract(epoch FROM (t."completedAt" - t."createdAt"))) / 86400)::float AS cycle
            FROM "Task" t
            JOIN "TaskStatus" s ON s.id = t."statusId"
            JOIN "TaskAssignee" a ON a."taskId" = t.id AND a."userId" = ${user.id}::uuid
            WHERE ${taskScope} AND s.category = 'DONE'
              AND (t."completedAt" AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date`,
        ]);

  const [upcoming, people, activity] = empty
    ? [[], [], []]
    : await Promise.all([
        prisma.task.findMany({
          where: {
            projectId: { in: ids },
            deletedAt: null,
            status: { category: { not: "DONE" } },
            dueDate: {
              gte: new Date(`${today}T00:00:00Z`),
              lte: new Date(`${addDays(today, 7)}T00:00:00Z`),
            },
          },
          select: {
            id: true,
            number: true,
            title: true,
            dueDate: true,
            priority: true,
            project: { select: { key: true, name: true } },
          },
          orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
          take: 10,
        }),
        prisma.user.findMany({
          where: { id: { in: workloadRows.map((row) => row.userId) } },
          select: { id: true, name: true, avatarUrl: true },
        }),
        prisma.$queryRaw<
          {
            id: string;
            action: string;
            actorId: string | null;
            metadata: unknown;
            createdAt: Date;
          }[]
        >`
          SELECT a.id, a.action, a."actorId", a.metadata, a."createdAt"
          FROM "ActivityLog" a
          WHERE a."organizationId" = ${tenant.organization.id}::uuid AND a.category = 'DOMAIN'
            AND (
              (a."entityType" = 'project' AND a."entityId" = ANY(${uuids(ids)}))
              OR (a."entityType" = 'task' AND EXISTS (
                SELECT 1 FROM "Task" t WHERE t.id = a."entityId" AND t."projectId" = ANY(${uuids(ids)})))
            )
          ORDER BY a."createdAt" DESC
          LIMIT 20`,
      ]);
  const actors = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: activity.flatMap((row) => (row.actorId ? [row.actorId] : [])) } },
        select: { id: true, name: true },
      })
    ).map((actor) => [actor.id, actor.name]),
  );

  const stats = new Map(perProject.map((row) => [row.id, row]));
  const projectRows = projects.map((project) => {
    const row = stats.get(project.id) ?? { total: 0, done: 0, open: 0, overdue: 0 };
    const progress = row.total === 0 ? 0 : Math.round((row.done / row.total) * 100);
    return {
      id: project.id,
      key: project.key,
      name: project.name,
      total: row.total,
      done: row.done,
      open: row.open,
      overdue: row.overdue,
      progress,
      health: projectHealth({
        progress,
        startDate: toDateOnly(project.startDate),
        endDate: toDateOnly(project.endDate),
        openTasks: row.open,
        overdueTasks: row.overdue,
        today,
      }),
    };
  });

  const completedBy = new Map(trendRows.map((row) => [row.bucket, row.count]));
  const createdBy = new Map(createdRows.map((row) => [row.bucket, row.count]));
  const personById = new Map(people.map((person) => [person.id, person]));
  const sum = (key: "total" | "done" | "open" | "overdue") =>
    projectRows.reduce((total, row) => total + row[key], 0);
  const mine = mineRows[0];

  const value: Analytics = {
    range: { from, to, granularity },
    tiles: {
      totalProjects: projects.length,
      activeProjects: projects.filter((project) => project.status === "ACTIVE").length,
      completedProjects: projects.filter((project) => project.status === "COMPLETED").length,
      totalTasks: sum("total"),
      pendingTasks: sum("open"),
      overdueTasks: sum("overdue"),
      completedTasks: sum("done"),
      completedInRange: trendRows.reduce((total, row) => total + row.count, 0),
    },
    trend: buckets(from, to, granularity).map((date) => ({
      date,
      completed: completedBy.get(date) ?? 0,
      created: createdBy.get(date) ?? 0,
    })),
    byCategory: STATUS_CATEGORIES.map((category) => ({
      category,
      count: categoryRows.find((row) => row.category === category)?.count ?? 0,
    })),
    byPriority: PRIORITIES.map((priority) => ({
      priority,
      count: priorityRows.find((row) => row.priority === priority)?.count ?? 0,
    })),
    projects: projectRows.sort((a, b) => a.name.localeCompare(b.name)),
    workload: workloadRows.flatMap((row) => {
      const person = personById.get(row.userId);
      return person
        ? [
            {
              ...person,
              openTasks: row.openTasks,
              estimatedHours: Math.round((row.estimated ?? 0) * 100) / 100,
              utilization: Math.round(((row.dueSoon ?? 0) / WEEKLY_CAPACITY_HOURS) * 100) / 100,
            },
          ]
        : [];
    }),
    upcoming: upcoming.map((task) => ({
      id: task.id,
      key: taskKey(task.project.key, task.number),
      title: task.title,
      dueDate: toDateOnly(task.dueDate) ?? "",
      priority: task.priority,
      projectName: task.project.name,
    })),
    activity: activity.map((row) => ({
      id: row.id,
      action: row.action,
      actorName: row.actorId ? (actors.get(row.actorId) ?? "Unknown") : "System",
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
    })),
    mine: {
      completed: mine?.completed ?? 0,
      actualHours: Math.round((mine?.hours ?? 0) * 100) / 100,
      onTimeRate:
        mine && mine.withDue > 0 ? Math.round((mine.onTime / mine.withDue) * 100) / 100 : null,
      avgCycleDays: mine?.cycle != null ? Math.round(mine.cycle * 10) / 10 : null,
    },
  };
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}
