import { freshPositions, MAX_POSITION_LENGTH, positionBetween } from "@nexusflow/shared";
import { Prisma } from "../../generated/prisma/client.ts";

// Card order inside a board column (PRD §11.6.6). Each card has a text key;
// a moved card gets a key between its new neighbours, so only that one row
// changes. If keys get too long, or the neighbours are out of order, the whole
// column is renumbered once.

type Db = Prisma.TransactionClient;

interface Column {
  projectId: string;
  statusId: string;
}

/** Writes many positions in one statement (one round trip, even for 500 cards). */
async function writePositions(db: Db, rows: { id: string; position: string }[]) {
  for (let start = 0; start < rows.length; start += 1000) {
    const values = rows
      .slice(start, start + 1000)
      .map((row) => Prisma.sql`(${row.id}::uuid, ${row.position})`);
    await db.$executeRaw`
      UPDATE "Task" AS t SET "position" = v.position
      FROM (VALUES ${Prisma.join(values)}) AS v(id, position)
      WHERE t."id" = v.id`;
  }
}

/**
 * Gives every card in the column a fresh, short key, keeping their order. With
 * `insert`, that task is placed after `afterId` (or before `beforeId`, or last).
 * Returns the new key of every card.
 */
async function renumberColumn(
  db: Db,
  { projectId, statusId }: Column,
  insert?: { taskId: string; afterId?: string | null; beforeId?: string | null },
) {
  const rows = await db.task.findMany({
    where: {
      projectId,
      statusId,
      deletedAt: null,
      ...(insert ? { id: { not: insert.taskId } } : {}),
    },
    orderBy: [{ position: "asc" }, { number: "asc" }],
    select: { id: true },
  });
  const ids = rows.map((row) => row.id);
  if (insert) {
    const afterIndex = insert.afterId ? ids.indexOf(insert.afterId) : -1;
    const beforeIndex = insert.beforeId ? ids.indexOf(insert.beforeId) : -1;
    const index = afterIndex >= 0 ? afterIndex + 1 : beforeIndex >= 0 ? beforeIndex : ids.length;
    ids.splice(index, 0, insert.taskId);
  }
  const keys = freshPositions(ids.length);
  const assigned = ids.map((id, index) => ({ id, position: keys[index] as string }));
  // The inserted task's own row is written by the caller, together with its other changes.
  await writePositions(
    db,
    assigned.filter((row) => row.id !== insert?.taskId),
  );
  return new Map(assigned.map((row) => [row.id, row.position]));
}

const usable = (key: string | null): key is string => !!key && key.length <= MAX_POSITION_LENGTH;

/** A key for a card at the bottom of a column. `taskId`: a card moving there. */
export async function positionAtEnd(db: Db, column: Column, taskId?: string): Promise<string> {
  const last = await db.task.findFirst({
    where: {
      ...column,
      deletedAt: null,
      ...(taskId ? { id: { not: taskId } } : {}),
    },
    orderBy: [{ position: "desc" }, { number: "desc" }],
    select: { position: true },
  });
  const key = positionBetween(last?.position ?? null, null);
  if (usable(key)) return key;
  if (taskId) return (await renumberColumn(db, column, { taskId })).get(taskId) as string;
  const keys = [...(await renumberColumn(db, column)).values()];
  return positionBetween(keys.at(-1) ?? null, null) as string;
}

/** The new key of a card moved between two neighbours (either may be missing). */
export async function positionForMove(
  db: Db,
  column: Column,
  taskId: string,
  after: { id: string; position: string } | null,
  before: { id: string; position: string } | null,
): Promise<{ position: string; renumbered: boolean }> {
  if (!after && !before)
    return { position: await positionAtEnd(db, column, taskId), renumbered: false };
  const key = positionBetween(after?.position ?? null, before?.position ?? null);
  if (usable(key)) return { position: key, renumbered: false };
  const keys = await renumberColumn(db, column, {
    taskId,
    afterId: after?.id ?? null,
    beforeId: before?.id ?? null,
  });
  return { position: keys.get(taskId) as string, renumbered: true };
}
