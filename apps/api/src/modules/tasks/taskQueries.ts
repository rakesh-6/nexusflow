import {
  addDays,
  parseTaskKey,
  todayIn,
  type TaskQuery,
  type TaskSortField,
} from "@nexusflow/shared";
import type { Prisma } from "../../generated/prisma/client.ts";
import { AppError } from "../../utils/errors.ts";

// Task list filters, sorting and paging (PRD §11.6.8).

type Direction = "asc" | "desc";
type Order = Prisma.TaskOrderByWithRelationInput;

const ORDER: Record<TaskSortField, (direction: Direction) => Order[]> = {
  // Board order: column by column, then the cards' own order.
  position: (direction) => [{ status: { position: direction } }, { position: direction }],
  priority: (direction) => [{ priority: direction }],
  dueDate: (direction) => [{ dueDate: { sort: direction, nulls: "last" } }],
  createdAt: (direction) => [{ createdAt: direction }],
  updatedAt: (direction) => [{ updatedAt: direction }],
  title: (direction) => [{ title: direction }],
  estimatedHours: (direction) => [{ estimatedHours: { sort: direction, nulls: "last" } }],
  number: (direction) => [{ number: direction }],
};

export function taskOrderBy(sort: TaskQuery["sort"]): Order[] {
  const orders = (sort?.length ? sort : ["position" as const]).flatMap((value) => {
    const descending = value.startsWith("-");
    const field = (descending ? value.slice(1) : value) as TaskSortField;
    return ORDER[field](descending ? "desc" : "asc");
  });
  // A stable tie-breaker, so pages never repeat or skip a task.
  return [...orders, { number: "asc" }];
}

const date = (value: string) => new Date(`${value}T00:00:00Z`);

/** The Prisma filter for a task list query, inside the given projects. */
export function taskWhere(
  scope: Prisma.TaskWhereInput,
  query: Omit<TaskQuery, "limit" | "sort" | "cursor">,
  user: { id: string; timezone: string },
): Prisma.TaskWhereInput {
  const and: Prisma.TaskWhereInput[] = [{ ...scope, deletedAt: null }];
  const today = date(todayIn(user.timezone));

  if (query.statusId) and.push({ statusId: { in: query.statusId } });
  if (query.category) and.push({ status: { category: { in: query.category } } });
  if (query.priority) and.push({ priority: { in: query.priority } });
  if (query.assigneeId) {
    const ids = query.assigneeId
      .filter((value) => value !== "unassigned")
      .map((value) => (value === "me" ? user.id : value));
    const either: Prisma.TaskWhereInput[] = [];
    if (ids.length > 0) either.push({ assignees: { some: { userId: { in: ids } } } });
    if (query.assigneeId.includes("unassigned")) either.push({ assignees: { none: {} } });
    and.push({ OR: either });
  }
  if (query.labelId) and.push({ labels: { some: { labelId: { in: query.labelId } } } });
  if (query.milestoneId) and.push({ milestoneId: { in: query.milestoneId } });
  if (query.parentTaskId) {
    and.push({ parentTaskId: query.parentTaskId === "null" ? null : query.parentTaskId });
  }
  if (query.dueFrom) and.push({ dueDate: { gte: date(query.dueFrom) } });
  if (query.dueTo) and.push({ dueDate: { lte: date(query.dueTo) } });
  if (query.createdFrom) and.push({ createdAt: { gte: date(query.createdFrom) } });
  if (query.createdTo) and.push({ createdAt: { lt: date(addDays(query.createdTo, 1)) } });
  if (query.hasDueDate !== undefined) {
    and.push({ dueDate: query.hasDueDate ? { not: null } : null });
  }
  if (query.overdue !== undefined) {
    // Overdue: due before today in the person's time zone, and not done (AC-TASK-08).
    and.push(
      query.overdue
        ? { dueDate: { lt: today }, status: { category: { not: "DONE" } } }
        : // Spelled out because NOT(...) would also drop tasks without a due date.
          {
            OR: [{ dueDate: null }, { dueDate: { gte: today } }, { status: { category: "DONE" } }],
          },
    );
  }
  if (query.hasAttachments !== undefined) {
    and.push({
      attachments: query.hasAttachments
        ? { some: { deletedAt: null } }
        : { none: { deletedAt: null } },
    });
  }
  if (query.q) {
    // Title text, or a task number like "42" or "NEX-42". Full search arrives in Phase 8.
    const key = parseTaskKey(query.q);
    const number = key?.number ?? (/^\d{1,9}$/.test(query.q) ? Number(query.q) : null);
    and.push({
      OR: [
        { title: { contains: query.q, mode: "insensitive" } },
        ...(number !== null ? [{ number }] : []),
      ],
    });
  }
  return { AND: and };
}

// Cursors are opaque to clients; inside they hold how many tasks came before.
export const encodeCursor = (offset: number) =>
  Buffer.from(JSON.stringify({ o: offset })).toString("base64url");

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const { o } = JSON.parse(Buffer.from(cursor, "base64url").toString()) as { o: unknown };
    if (typeof o === "number" && Number.isInteger(o) && o >= 0 && o <= 1_000_000) return o;
  } catch {
    // Falls through to the error below.
  }
  throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor", [
    { path: "query.cursor", message: "Use the nextCursor value from the previous page" },
  ]);
}
