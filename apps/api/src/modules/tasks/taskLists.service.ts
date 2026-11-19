import {
  BOARD_COLUMN_PAGE,
  dueGroup,
  todayIn,
  type BoardColumn,
  type MyTasksResult,
  type TaskQuery,
} from "@nexusflow/shared";
import type { User, Workspace } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { accessFor, accessibleProjectsWhere, projectInclude } from "../projects/access.ts";
import { statusRef, taskInclude, toTaskSummaries, type Loaded } from "./taskAccess.ts";
import { decodeCursor, encodeCursor, taskOrderBy, taskWhere } from "./taskQueries.ts";

// Lists of tasks: the List view, the board and My Tasks (PRD §11.6.8, §11.6.11, §11.7).

type Filters = Omit<TaskQuery, "limit" | "sort" | "cursor">;

export async function listTasks(user: User, loaded: Loaded, query: TaskQuery) {
  const offset = decodeCursor(query.cursor);
  const rows = await prisma.task.findMany({
    where: taskWhere({ projectId: loaded.project.id }, query, user),
    include: taskInclude,
    orderBy: taskOrderBy(query.sort),
    skip: offset,
    take: query.limit + 1,
  });
  const page = rows.slice(0, query.limit);
  return {
    items: await toTaskSummaries(page),
    nextCursor: rows.length > query.limit ? encodeCursor(offset + query.limit) : null,
  };
}

/**
 * Every column with its first 200 cards and its total (PRD §11.7.1, AC-VIEW-05).
 * The board shows top-level tasks; subtasks appear inside their parent.
 */
export async function boardColumns(
  user: User,
  loaded: Loaded,
  filters: Filters,
): Promise<BoardColumn[]> {
  const projectId = loaded.project.id;
  const where = taskWhere(
    { projectId },
    { ...filters, statusId: undefined, parentTaskId: filters.parentTaskId ?? "null" },
    user,
  );
  const statuses = await prisma.taskStatus.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  const [counts, columns] = await Promise.all([
    prisma.task.groupBy({ by: ["statusId"], where, _count: { _all: true } }),
    Promise.all(
      statuses.map((status) =>
        prisma.task.findMany({
          where: { AND: [where, { statusId: status.id }] },
          include: taskInclude,
          orderBy: [{ position: "asc" }, { number: "asc" }],
          take: BOARD_COLUMN_PAGE,
        }),
      ),
    ),
  ]);
  const totals = new Map(counts.map((row) => [row.statusId, row._count._all]));
  const summaries = new Map((await toTaskSummaries(columns.flat())).map((task) => [task.id, task]));
  return statuses.map((status, index) => {
    const total = totals.get(status.id) ?? 0;
    return {
      statusId: status.id,
      total,
      tasks: (columns[index] ?? []).flatMap((row) => summaries.get(row.id) ?? []),
      nextCursor: total > BOARD_COLUMN_PAGE ? encodeCursor(BOARD_COLUMN_PAGE) : null,
    };
  });
}

/** Open tasks assigned to you in a workspace, grouped by due date (PRD §11.6.11). */
export async function myTasks(
  tenant: Tenant,
  user: User,
  workspace: Workspace,
): Promise<MyTasksResult> {
  const orgRole = tenant.membership.role;
  const projects = (
    await prisma.project.findMany({
      where: {
        AND: [
          accessibleProjectsWhere(tenant.organization.id, user.id, orgRole),
          { workspaceId: workspace.id, status: { not: "ARCHIVED" } },
        ],
      },
      include: projectInclude(user.id),
    })
  ).filter((project) => accessFor(project, orgRole));

  const rows = await prisma.task.findMany({
    where: {
      projectId: { in: projects.map((project) => project.id) },
      deletedAt: null,
      assignees: { some: { userId: user.id } },
      status: { category: { not: "DONE" } },
    },
    include: taskInclude,
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { number: "asc" }],
    take: 500,
  });
  const used = [...new Set(rows.map((row) => row.projectId))];
  const statuses = await prisma.taskStatus.findMany({
    where: { projectId: { in: used } },
    orderBy: { position: "asc" },
    select: { projectId: true, ...statusRef.select },
  });
  const today = todayIn(user.timezone);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const tasks = (await toTaskSummaries(rows)).map((task) => {
    const project = projectById.get(task.projectId);
    return {
      ...task,
      project: { id: task.projectId, key: project?.key ?? "", name: project?.name ?? "" },
      group: dueGroup(task.dueDate, today),
    };
  });
  return {
    today,
    tasks,
    projects: used.map((projectId) => {
      const project = projectById.get(projectId);
      return {
        id: projectId,
        key: project?.key ?? "",
        name: project?.name ?? "",
        statuses: statuses
          .filter((status) => status.projectId === projectId)
          .map(({ projectId: _projectId, ...status }) => status),
      };
    }),
  };
}
