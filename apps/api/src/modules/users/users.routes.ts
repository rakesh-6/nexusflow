import { avatarConfirmSchema, avatarUploadSchema, updateProfileSchema } from "@nexusflow/shared";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import {
  currentAuth,
  requireAuth,
  requireRecentAuth,
  requireVerified,
} from "../../middleware/auth.ts";
import { AppError } from "../../utils/errors.ts";
import { forgetCachedSessions } from "../auth/session.service.ts";
import { listMyOrganizations } from "../organizations/organizations.service.ts";
import { sendSuccess } from "../../utils/response.ts";
import { validateRequest } from "../../utils/validateRequest.ts";
import { toCurrentUser } from "../auth/auth.service.ts";
import { clearSessionCookie } from "../auth/session.service.ts";
import {
  confirmAvatar,
  deleteAccount,
  removeAvatar,
  startAvatarUpload,
  updateProfile,
} from "./users.service.ts";

// /api/v1/users/... : the signed-in person's own account (PRD §18.5).
export const usersRouter = Router();

// Every organization you belong to, with its workspaces (the switcher, PRD §11.2.3).
usersRouter.get("/me/organizations", requireVerified, async (req, res) => {
  sendSuccess(res, await listMyOrganizations(currentAuth(req).user));
});

// Remembers the workspace you opened last, so "/" can take you back there.
usersRouter.put("/me/last-workspace", requireVerified, async (req, res) => {
  const { body } = validateRequest(req, { body: z.object({ workspaceId: z.uuid() }) });
  const user = currentAuth(req).user;
  const workspace = await prisma.workspace.findFirst({
    where: { id: body.workspaceId, deletedAt: null, organization: { deletedAt: null } },
    include: {
      organization: { include: { members: { where: { userId: user.id, status: "ACTIVE" } } } },
      members: { where: { userId: user.id } },
    },
  });
  const orgRole = workspace?.organization.members[0]?.role;
  const canOpen =
    orgRole === "OWNER" ||
    orgRole === "ADMIN" ||
    (orgRole === "MEMBER" && (workspace?.members.length ?? 0) > 0);
  if (!workspace || !canOpen) throw new AppError(404, "NOT_FOUND", "Workspace not found");
  await prisma.user.update({
    where: { id: user.id },
    data: { lastActiveWorkspaceId: workspace.id },
  });
  forgetCachedSessions({ userId: user.id });
  sendSuccess(res, { saved: true });
});

usersRouter.get("/me", requireAuth, (req, res) => {
  sendSuccess(res, toCurrentUser(currentAuth(req).user));
});

usersRouter.patch("/me", requireAuth, async (req, res) => {
  const { body } = validateRequest(req, { body: updateProfileSchema });
  const user = await updateProfile(currentAuth(req).user, body, req);
  sendSuccess(res, toCurrentUser(user));
});

usersRouter.delete("/me", requireRecentAuth, async (req, res) => {
  await deleteAccount(currentAuth(req).user, req);
  clearSessionCookie(res);
  sendSuccess(res, { deleted: true });
});

usersRouter.post("/me/avatar/sign", requireAuth, (req, res) => {
  // The type and size are checked here; Cloudinary's own answer is checked at confirm.
  validateRequest(req, { body: avatarUploadSchema });
  sendSuccess(res, startAvatarUpload(currentAuth(req).user));
});

usersRouter.post("/me/avatar/confirm", requireAuth, async (req, res) => {
  const { body } = validateRequest(req, { body: avatarConfirmSchema });
  const user = await confirmAvatar(currentAuth(req).user, body.publicId, req);
  sendSuccess(res, toCurrentUser(user));
});

usersRouter.delete("/me/avatar", requireAuth, async (req, res) => {
  const user = await removeAvatar(currentAuth(req).user);
  sendSuccess(res, toCurrentUser(user));
});
