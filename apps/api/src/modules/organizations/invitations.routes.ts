import { Router } from "express";
import { z } from "zod";
import { currentAuth, requireAuth, requireVerified } from "../../middleware/auth.ts";
import { authLimiter } from "../../middleware/rateLimit.ts";
import { sendSuccess } from "../../utils/response.ts";
import { validateRequest } from "../../utils/validateRequest.ts";
import { acceptInvitation, declineInvitation, previewInvitation } from "./invitations.service.ts";

// /api/v1/invitations/:token — the invitee's side of an invitation (PRD §11.3).
// The preview is public, so someone without an account can see who invited them.
export const invitationsRouter = Router();

const tokenParams = z.object({ token: z.string().min(20).max(200) });

invitationsRouter.get("/:token", authLimiter, async (req, res) => {
  const { params } = validateRequest(req, { params: tokenParams });
  sendSuccess(res, await previewInvitation(params.token));
});

invitationsRouter.post("/:token/accept", requireVerified, async (req, res) => {
  const { params } = validateRequest(req, { params: tokenParams });
  sendSuccess(res, await acceptInvitation(params.token, currentAuth(req).user, req));
});

invitationsRouter.post("/:token/decline", requireAuth, async (req, res) => {
  const { params } = validateRequest(req, { params: tokenParams });
  await declineInvitation(params.token, currentAuth(req).user);
  sendSuccess(res, { declined: true });
});
