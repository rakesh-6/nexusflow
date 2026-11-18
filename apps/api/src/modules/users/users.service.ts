import { AVATAR_MAX_BYTES, type UpdateProfileInput } from "@nexusflow/shared";
import type { Request } from "express";
import { env } from "../../config/env.ts";
import type { User } from "../../generated/prisma/client.ts";
import { randomToken } from "../../lib/crypto.ts";
import { logger } from "../../lib/logger.ts";
import { prisma } from "../../lib/prisma.ts";
import { logSecurityEvent } from "../../lib/securityLog.ts";
import {
  cloudinaryConfigured,
  createSignedImageUpload,
  destroyImage,
  fetchImage,
  imageUrl,
} from "../../lib/storage/cloudinary.ts";
import { AppError } from "../../utils/errors.ts";
import { forgetCachedSessions } from "../auth/session.service.ts";

// ---------------------------------------------------------------------------
// Profile (PRD §11.1.6)
// ---------------------------------------------------------------------------

export async function updateProfile(user: User, input: UpdateProfileInput, req: Request) {
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    },
  });
  forgetCachedSessions({ userId: user.id });
  await logSecurityEvent("user.profile_updated", {
    userId: user.id,
    req,
    metadata: { fields: Object.keys(input) },
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Profile photo: signed direct upload to Cloudinary, then a server-side check
// ---------------------------------------------------------------------------

const AVATAR_FORMATS = ["jpg", "png", "webp"];
// Stored as a 256 x 256 square centered on the face, so photos stay small.
const AVATAR_TRANSFORMATION = "c_fill,g_face,h_256,w_256";

const avatarFolder = (userId: string) => `${env.CLOUDINARY_FOLDER_PREFIX}/avatars/${userId}`;

function assertStorageConfigured() {
  if (!cloudinaryConfigured) {
    throw new AppError(
      503,
      "STORAGE_NOT_CONFIGURED",
      "Photo upload is not set up on this server yet",
    );
  }
}

/** Step 1: returns a one-time signed upload for a new photo in this user's own folder. */
export function startAvatarUpload(user: User) {
  assertStorageConfigured();
  // A random name: photos cannot be guessed, and a new photo never overwrites an old one.
  const publicId = `${avatarFolder(user.id)}/${randomToken().slice(0, 16)}`;
  return createSignedImageUpload({
    publicId,
    allowedFormats: AVATAR_FORMATS,
    transformation: AVATAR_TRANSFORMATION,
  });
}

/** Step 2: checks with Cloudinary what was really uploaded, then saves it as the photo. */
export async function confirmAvatar(user: User, publicId: string, req: Request) {
  assertStorageConfigured();
  if (!publicId.startsWith(`${avatarFolder(user.id)}/`)) {
    throw new AppError(400, "UPLOAD_INVALID", "This upload does not belong to you");
  }
  const image = await fetchImage(publicId);
  const valid =
    image !== null &&
    image.resource_type === "image" &&
    AVATAR_FORMATS.includes(image.format) &&
    image.bytes <= AVATAR_MAX_BYTES;
  if (!valid) {
    if (image) await removeImageQuietly(publicId);
    throw new AppError(400, "UPLOAD_INVALID", "The uploaded file is not a valid photo");
  }

  const previous = user.avatarPublicId;
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { avatarUrl: imageUrl(image), avatarPublicId: image.public_id },
  });
  forgetCachedSessions({ userId: user.id });
  if (previous) await removeImageQuietly(previous);
  await logSecurityEvent("user.profile_updated", {
    userId: user.id,
    req,
    metadata: { fields: ["avatar"] },
  });
  return updated;
}

export async function removeAvatar(user: User) {
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { avatarUrl: null, avatarPublicId: null },
  });
  forgetCachedSessions({ userId: user.id });
  if (user.avatarPublicId) await removeImageQuietly(user.avatarPublicId);
  return updated;
}

/** Deleting old photos must never break the request; failures are only logged. */
async function removeImageQuietly(publicId: string) {
  if (!cloudinaryConfigured) return;
  try {
    await destroyImage(publicId);
  } catch (error) {
    logger.warn({ err: error, publicId }, "Could not delete old image from Cloudinary");
  }
}

// ---------------------------------------------------------------------------
// Account deletion (PRD §11.1.7)
// ---------------------------------------------------------------------------

/**
 * Deletes the account: personal data is removed, memberships end, and every
 * session is signed out. Tasks and comments the person wrote stay, shown as
 * "Deleted User", so teammates keep their history.
 */
export async function deleteAccount(user: User, req: Request) {
  // Each organization has exactly one owner; it cannot be left without one.
  const owned = await prisma.organization.findMany({
    where: { ownerId: user.id, deletedAt: null },
    select: { name: true, slug: true },
  });
  if (owned.length > 0) {
    throw new AppError(
      409,
      "SOLE_OWNER",
      "You own an organization. Transfer ownership or delete it before deleting your account.",
      owned,
    );
  }

  const userId = user.id;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        email: `deleted+${userId}@deleted.invalid`,
        name: "Deleted User",
        passwordHash: null,
        emailVerifiedAt: null,
        avatarUrl: null,
        avatarPublicId: null,
        lastActiveWorkspaceId: null,
      },
    }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.oAuthAccount.deleteMany({ where: { userId } }),
    prisma.verificationToken.deleteMany({ where: { userId } }),
    prisma.notificationPreference.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.taskAssignee.deleteMany({ where: { userId } }),
    prisma.projectMember.deleteMany({ where: { userId } }),
    prisma.teamMember.deleteMany({ where: { userId } }),
    prisma.workspaceMember.deleteMany({ where: { userId } }),
    prisma.organizationMember.deleteMany({ where: { userId } }),
  ]);
  forgetCachedSessions({ userId });
  if (user.avatarPublicId) await removeImageQuietly(user.avatarPublicId);
  await logSecurityEvent("user.deleted", { userId, req });
}
