import { randomUUID } from "node:crypto";
import {
  ATTACHMENT_URL_MINUTES,
  attachmentType,
  extensionOf,
  MAX_ATTACHMENTS_PER_TASK,
  sanitizeFileName,
  type AttachmentSummary,
  type AttachmentUpload,
  type AttachmentUrl,
  type signAttachmentSchema,
} from "@nexusflow/shared";
import type { z } from "zod";
import { env } from "../../config/env.ts";
import type { Attachment, Prisma, User } from "../../generated/prisma/client.ts";
import { emitEvent } from "../../lib/events.ts";
import { enqueue } from "../../lib/jobs.ts";
import { logger } from "../../lib/logger.ts";
import { assertWithinPlan, limitsFor } from "../../lib/planGuard.ts";
import { prisma } from "../../lib/prisma.ts";
import { fileStorage } from "../../lib/storage/files.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { loadComment } from "../comments/comments.service.ts";
import { assertNotArchived } from "../projects/access.ts";
import { loadTask, type Loaded } from "../tasks/taskAccess.ts";
import { assertCanWrite } from "../tasks/taskRules.ts";

// File attachments on tasks and comments (PRD §11.11). The browser uploads
// straight to the storage service with a one-time signature; afterwards the
// server asks the service what really arrived before the file counts.

type SignInput = z.output<typeof signAttachmentSchema>;

const notFound = () => new AppError(404, "NOT_FOUND", "File not found");
const person = { select: { id: true, name: true, avatarUrl: true } } as const;

function assertStorageReady() {
  if (!fileStorage.configured) {
    throw new AppError(
      503,
      "STORAGE_NOT_CONFIGURED",
      "File uploads are not set up on this server yet (Cloudinary keys are missing)",
    );
  }
}

export function toAttachmentSummary(
  row: Attachment & { uploader: { id: string; name: string; avatarUrl: string | null } },
  canDelete: boolean,
): AttachmentSummary {
  return {
    id: row.id,
    taskId: row.taskId,
    commentId: row.commentId,
    originalName: row.originalName,
    mimeType: row.mimeType,
    bytes: Number(row.bytes),
    kind: row.resourceType,
    width: row.width,
    height: row.height,
    uploader: row.uploader,
    createdAt: row.createdAt.toISOString(),
    canDelete,
  };
}

const mayDelete = (row: { uploaderId: string }, user: User, loaded: Loaded) =>
  loaded.project.status !== "ARCHIVED" && (row.uploaderId === user.id || loaded.access.canManage);

/** Step 1: checks rights, type and plan limits, then signs one upload (AC-FILE-01). */
export async function signAttachment(
  tenant: Tenant,
  user: User,
  input: SignInput,
): Promise<AttachmentUpload> {
  assertStorageReady();
  const target = input.commentId
    ? await loadComment(tenant, input.commentId, user).then(({ comment, loaded }) => ({
        taskId: comment.taskId as string,
        commentId: comment.id,
        loaded,
      }))
    : await loadTask(tenant, input.taskId as string, user.id).then(({ task, loaded }) => ({
        taskId: task.id,
        commentId: null,
        loaded,
      }));
  assertCanWrite(target.loaded);
  const type = attachmentType(input.fileName, input.mimeType);
  if (!type) throw new AppError(400, "VALIDATION_ERROR", "This kind of file cannot be attached");

  assertWithinPlan(tenant.subscription, "maxFileBytes", 0, input.sizeBytes);
  assertWithinPlan(
    tenant.subscription,
    "maxStorageBytes",
    Number(tenant.organization.storageUsedBytes),
    input.sizeBytes,
  );
  const existing = await prisma.attachment.count({
    where: { taskId: target.taskId, deletedAt: null, status: "READY" },
  });
  if (existing >= MAX_ATTACHMENTS_PER_TASK) {
    throw new AppError(409, "TOO_MANY_FILES", "A task can have at most 50 files");
  }

  const id = randomUUID();
  const name = sanitizeFileName(input.fileName);
  // Plain files keep their extension, so downloads open with the right program.
  const publicId = `${env.CLOUDINARY_FOLDER_PREFIX}/orgs/${tenant.organization.id}/files/${id}${
    type.kind === "RAW" ? `.${extensionOf(name)}` : ""
  }`;
  await prisma.attachment.create({
    data: {
      id,
      organizationId: tenant.organization.id,
      taskId: target.taskId,
      commentId: target.commentId,
      projectId: target.loaded.project.id,
      uploaderId: user.id,
      originalName: name,
      mimeType: input.mimeType.toLowerCase(),
      bytes: input.sizeBytes,
      resourceType: type.kind,
      publicId,
      status: "PENDING",
    },
  });
  return { attachmentId: id, ...fileStorage.signUpload(publicId, type.kind) };
}

/** Loads a file of a task you can open (404 otherwise). */
async function loadAttachment(
  tenant: Tenant,
  user: User,
  id: string,
  where: Prisma.AttachmentWhereInput = { status: "READY", deletedAt: null },
) {
  const row = await prisma.attachment.findFirst({
    where: { id, organizationId: tenant.organization.id, taskId: { not: null }, ...where },
    include: { uploader: person },
  });
  if (!row?.taskId) throw notFound();
  try {
    const { loaded } = await loadTask(tenant, row.taskId, user.id);
    return { row, loaded };
  } catch {
    throw notFound();
  }
}

/**
 * Step 2: asks the storage service what was uploaded. Too big, or not the
 * kind of file it claims to be: the file is destroyed and refused
 * (AC-FILE-02, AC-FILE-05). Otherwise it counts towards the storage used.
 */
export async function confirmAttachment(tenant: Tenant, user: User, id: string) {
  assertStorageReady();
  const { row, loaded } = await loadAttachment(tenant, user, id, {
    status: "PENDING",
    uploaderId: user.id,
  });
  const stored = await fileStorage.fetch(row.publicId, row.resourceType);
  const type = attachmentType(row.originalName, row.mimeType);
  const limits = limitsFor(tenant.subscription);
  const used = Number(tenant.organization.storageUsedBytes);
  const valid =
    !!stored &&
    !!type &&
    stored.bytes <= limits.maxFileBytes &&
    (limits.maxStorageBytes === null || used + stored.bytes <= limits.maxStorageBytes) &&
    type.formats.includes(stored.format.toLowerCase());
  if (!stored || !valid) {
    if (stored) {
      await fileStorage
        .destroy(row.publicId, row.resourceType)
        .catch((error: unknown) =>
          logger.warn({ err: error }, "Could not destroy a refused upload"),
        );
    }
    await prisma.attachment.delete({ where: { id: row.id } });
    throw new AppError(
      400,
      "UPLOAD_INVALID",
      stored
        ? "The uploaded file is too big or not the kind of file it claims to be"
        : "No file was uploaded",
    );
  }

  const [ready] = await prisma.$transaction([
    prisma.attachment.update({
      where: { id: row.id },
      data: {
        status: "READY",
        readyAt: new Date(),
        bytes: stored.bytes,
        format: stored.format || null,
        width: stored.width,
        height: stored.height,
        cloudinaryVersion: stored.version,
      },
      include: { uploader: person },
    }),
    prisma.organization.update({
      where: { id: tenant.organization.id },
      data: { storageUsedBytes: { increment: stored.bytes } },
    }),
  ]);
  const summary = toAttachmentSummary(ready, mayDelete(ready, user, loaded));
  emitEvent({
    name: "attachment:created",
    orgId: tenant.organization.id,
    workspaceId: loaded.project.workspaceId,
    projectId: loaded.project.id,
    actorId: user.id,
    data: { taskId: row.taskId, attachment: summary },
  });
  return summary;
}

export async function listAttachments(user: User, taskId: string, loaded: Loaded) {
  const rows = await prisma.attachment.findMany({
    where: { taskId, status: "READY", deletedAt: null },
    include: { uploader: person },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => toAttachmentSummary(row, mayDelete(row, user, loaded)));
}

/** A link to the file that works for 15 minutes (PRD §11.11.2, AC-FILE-03). */
export async function attachmentUrl(
  tenant: Tenant,
  user: User,
  id: string,
): Promise<AttachmentUrl> {
  assertStorageReady();
  const { row } = await loadAttachment(tenant, user, id);
  const expiresAt = new Date(Date.now() + ATTACHMENT_URL_MINUTES * 60_000);
  // Plain files (and SVG) are always downloaded, never shown inside the page.
  const download = row.resourceType === "RAW";
  return {
    url: fileStorage.signedUrl(
      row.publicId,
      row.resourceType,
      row.format ?? "",
      expiresAt,
      download,
    ),
    expiresAt: expiresAt.toISOString(),
  };
}

/** The uploader or a project manager removes a file (AC-FILE-04). */
export async function deleteAttachment(tenant: Tenant, user: User, id: string) {
  const { row, loaded } = await loadAttachment(tenant, user, id);
  assertNotArchived(loaded.project);
  if (!mayDelete(row, user, loaded)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only the person who added it or a project manager can remove this file",
    );
  }
  await prisma.$transaction([
    prisma.attachment.update({
      where: { id: row.id },
      data: { status: "DELETED", deletedAt: new Date() },
    }),
    prisma.organization.update({
      where: { id: tenant.organization.id },
      data: { storageUsedBytes: { decrement: row.bytes } },
    }),
  ]);
  await enqueue("storage.destroy", { publicId: row.publicId, kind: row.resourceType });
  emitEvent({
    name: "attachment:deleted",
    orgId: tenant.organization.id,
    workspaceId: loaded.project.workspaceId,
    projectId: loaded.project.id,
    actorId: user.id,
    data: { taskId: row.taskId, attachmentId: row.id },
  });
}
