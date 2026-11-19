import {
  docToText,
  sanitizeMentions,
  type CommentSummary,
  type CreateCommentInput,
  type ReactionSummary,
  type RichTextDoc,
} from "@nexusflow/shared";
import { Prisma, type User } from "../../generated/prisma/client.ts";
import { emitEvent } from "../../lib/events.ts";
import { notify } from "../notifications/notifications.service.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { assertNotArchived } from "../projects/access.ts";
import { assignablePeople, loadTask, type Loaded } from "../tasks/taskAccess.ts";
import { assertCanWrite } from "../tasks/taskRules.ts";

// Comments and reactions on tasks (PRD §11.9).

const person = { select: { id: true, name: true, avatarUrl: true } } as const;
const include = {
  author: person,
  reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.CommentInclude;
type Row = Prisma.CommentGetPayload<{ include: typeof include }>;

const notFound = () => new AppError(404, "NOT_FOUND", "Comment not found");

// ---------------------------------------------------------------------------
// Showing comments
// ---------------------------------------------------------------------------

function reactionSummaries(row: Row): ReactionSummary[] {
  const byEmoji = new Map<string, string[]>();
  for (const reaction of row.reactions) {
    byEmoji.set(reaction.emoji, [...(byEmoji.get(reaction.emoji) ?? []), reaction.userId]);
  }
  return [...byEmoji].map(([emoji, userIds]) => ({ emoji, count: userIds.length, userIds }));
}

function toComment(
  row: Row,
  viewer: { id: string; canManage: boolean; writable: boolean },
  replies: Row[] = [],
): CommentSummary {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    taskId: row.taskId ?? "",
    parentCommentId: row.parentCommentId,
    author: row.author,
    body: deleted ? null : (row.body as unknown as RichTextDoc),
    bodyText: deleted ? "" : row.bodyText,
    deleted,
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    reactions: deleted ? [] : reactionSummaries(row),
    replies: replies.map((reply) => toComment(reply, viewer)),
    canEdit: viewer.writable && !deleted && row.authorId === viewer.id,
    canDelete: viewer.writable && !deleted && (row.authorId === viewer.id || viewer.canManage),
  };
}

/**
 * The task's comments, oldest first, with replies under their comment. A
 * deleted comment stays as a "Comment deleted" line only while it has replies
 * (AC-COMM-03).
 */
export async function listComments(user: User, taskId: string, loaded: Loaded) {
  const rows = await prisma.comment.findMany({
    where: { taskId, organizationId: loaded.project.organizationId },
    include,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 1000,
  });
  const viewer = {
    id: user.id,
    canManage: loaded.access.canManage,
    writable: loaded.access.canContribute && loaded.project.status !== "ARCHIVED",
  };
  const repliesOf = new Map<string, Row[]>();
  for (const row of rows) {
    if (row.parentCommentId && !row.deletedAt) {
      repliesOf.set(row.parentCommentId, [...(repliesOf.get(row.parentCommentId) ?? []), row]);
    }
  }
  return rows
    .filter((row) => !row.parentCommentId)
    .filter((row) => !row.deletedAt || (repliesOf.get(row.id)?.length ?? 0) > 0)
    .map((row) => toComment(row, viewer, repliesOf.get(row.id) ?? []));
}

/** One comment as the API shows it, with its replies. */
async function commentById(user: User, commentId: string, loaded: Loaded) {
  const row = await prisma.comment.findUniqueOrThrow({ where: { id: commentId }, include });
  const replies = await prisma.comment.findMany({
    where: { parentCommentId: commentId, deletedAt: null },
    include,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return toComment(
    row,
    {
      id: user.id,
      canManage: loaded.access.canManage,
      writable: loaded.access.canContribute && loaded.project.status !== "ARCHIVED",
    },
    replies,
  );
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** A comment on a task you can open, with your access to the task's project (else "not found"). */
export async function loadComment(tenant: Tenant, commentId: string, user: User) {
  const comment = await prisma.comment.findFirst({
    where: {
      id: commentId,
      organizationId: tenant.organization.id,
      taskId: { not: null },
      task: { deletedAt: null },
    },
  });
  if (!comment?.taskId) throw notFound();
  try {
    const { loaded } = await loadTask(tenant, comment.taskId, user.id);
    return { comment, loaded };
  } catch {
    throw notFound();
  }
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Mentions of people who cannot open the project become plain text (AC-COMM-01). */
async function cleanBody(tenant: Tenant, loaded: Loaded, body: RichTextDoc) {
  const people = await assignablePeople(tenant, loaded.project, { includeViewers: true });
  const { doc, mentionedIds } = sanitizeMentions(body, new Set(people.map((p) => p.id)));
  const text = docToText(doc);
  if (!text && doc.content?.every((node) => node.type !== "mention")) {
    throw new AppError(400, "VALIDATION_ERROR", "Write something first", [
      { path: "body.body", message: "A comment cannot be empty" },
    ]);
  }
  return { doc, mentionedIds, text };
}

const event = (
  tenant: Tenant,
  user: User,
  loaded: Loaded,
  name: string,
  data: Record<string, unknown>,
) =>
  emitEvent({
    name,
    orgId: tenant.organization.id,
    workspaceId: loaded.project.workspaceId,
    projectId: loaded.project.id,
    actorId: user.id,
    data,
  });

export async function createComment(
  tenant: Tenant,
  user: User,
  task: { id: string; number: number; reporterId: string; title: string },
  loaded: Loaded,
  input: CreateCommentInput,
) {
  assertCanWrite(loaded);
  const { project } = loaded;
  if (input.parentCommentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: input.parentCommentId, taskId: task.id, deletedAt: null },
      select: { parentCommentId: true },
    });
    if (!parent) {
      throw new AppError(400, "VALIDATION_ERROR", "Choose a comment on this task", [
        { path: "body.parentCommentId", message: "That comment does not exist" },
      ]);
    }
    if (parent.parentCommentId) {
      throw new AppError(400, "MAX_DEPTH", "Replies cannot have replies of their own");
    }
  }
  const { doc, mentionedIds, text } = await cleanBody(tenant, loaded, input.body as RichTextDoc);

  const created = await prisma.comment.create({
    data: {
      organizationId: tenant.organization.id,
      taskId: task.id,
      parentCommentId: input.parentCommentId ?? null,
      authorId: user.id,
      body: doc as unknown as Prisma.InputJsonValue,
      bodyText: text,
    },
  });

  // Everyone with a stake in the task hears about it once: people mentioned get
  // MENTIONED, the others (assignees, the reporter, earlier commenters) get
  // TASK_COMMENTED; never the author (AC-COMM-05).
  const [assignees, commenters] = await Promise.all([
    prisma.taskAssignee.findMany({ where: { taskId: task.id }, select: { userId: true } }),
    prisma.comment.findMany({
      where: { taskId: task.id, deletedAt: null },
      select: { authorId: true },
      distinct: ["authorId"],
    }),
  ]);
  const people = new Set(
    (await assignablePeople(tenant, project, { includeViewers: true })).map((p) => p.id),
  );
  const interested = [
    ...assignees.map((a) => a.userId),
    task.reporterId,
    ...commenters.map((c) => c.authorId),
  ].filter((id) => people.has(id) && !mentionedIds.includes(id));
  const base = {
    orgId: tenant.organization.id,
    workspaceId: project.workspaceId,
    projectId: project.id,
    actorId: user.id,
    data: {
      taskId: task.id,
      commentId: created.id,
      taskTitle: task.title,
      excerpt: text.slice(0, 200),
    },
  };
  notify({ ...base, type: "MENTIONED", recipientIds: mentionedIds });
  notify({ ...base, type: "TASK_COMMENTED", recipientIds: interested });

  const comment = await commentById(user, created.id, loaded);
  event(tenant, user, loaded, "comment:created", { taskId: task.id, comment });
  return comment;
}

export async function updateComment(
  tenant: Tenant,
  user: User,
  stored: { id: string; taskId: string | null; authorId: string; deletedAt: Date | null },
  loaded: Loaded,
  body: RichTextDoc,
) {
  assertNotArchived(loaded.project);
  if (stored.deletedAt) throw notFound();
  if (stored.authorId !== user.id) {
    throw new AppError(403, "FORBIDDEN", "Only the author can edit a comment");
  }
  const { doc, text } = await cleanBody(tenant, loaded, body);
  await prisma.comment.update({
    where: { id: stored.id },
    data: {
      body: doc as unknown as Prisma.InputJsonValue,
      bodyText: text,
      editedAt: new Date(),
    },
  });
  const comment = await commentById(user, stored.id, loaded);
  event(tenant, user, loaded, "comment:updated", { taskId: stored.taskId, comment });
  return comment;
}

export async function deleteComment(
  tenant: Tenant,
  user: User,
  stored: { id: string; taskId: string | null; authorId: string; deletedAt: Date | null },
  loaded: Loaded,
) {
  assertNotArchived(loaded.project);
  if (stored.deletedAt) throw notFound();
  if (stored.authorId !== user.id && !loaded.access.canManage) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only the author or a project manager can delete a comment",
    );
  }
  // Comment text and reactions are removed at once; the row stays so replies keep their place.
  await prisma.$transaction([
    prisma.commentReaction.deleteMany({ where: { commentId: stored.id } }),
    prisma.comment.update({
      where: { id: stored.id },
      data: { deletedAt: new Date(), body: { type: "doc" }, bodyText: "" },
    }),
  ]);
  event(tenant, user, loaded, "comment:deleted", { taskId: stored.taskId, commentId: stored.id });
}

/** Reacting with the same emoji again takes the reaction back (AC-COMM-04). */
export async function toggleReaction(
  tenant: Tenant,
  user: User,
  stored: { id: string; taskId: string | null; deletedAt: Date | null },
  loaded: Loaded,
  emoji: string,
) {
  assertNotArchived(loaded.project);
  if (stored.deletedAt) throw notFound();
  const removed = await prisma.commentReaction.deleteMany({
    where: { commentId: stored.id, userId: user.id, emoji },
  });
  if (removed.count === 0) {
    // Two quick clicks may race; the unique key makes the second one harmless.
    await prisma.commentReaction
      .create({ data: { commentId: stored.id, userId: user.id, emoji } })
      .catch((error: { code?: string }) => {
        if (error.code !== "P2002") throw error;
      });
  }
  const row = await prisma.comment.findUniqueOrThrow({ where: { id: stored.id }, include });
  const reactions = reactionSummaries(row);
  event(tenant, user, loaded, "reaction:updated", {
    taskId: stored.taskId,
    commentId: stored.id,
    reactions,
  });
  return reactions;
}

/** Everyone who can be @mentioned in this task's project. */
export const mentionablePeople = (tenant: Tenant, loaded: Loaded) =>
  assignablePeople(tenant, loaded.project, { includeViewers: true });
