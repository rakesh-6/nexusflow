import { avatarConfirmSchema, avatarUploadSchema, updateProfileSchema } from "@nexusflow/shared";
import { Router } from "express";
import { currentAuth, requireAuth, requireRecentAuth } from "../../middleware/auth.ts";
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
