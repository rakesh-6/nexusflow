import { notificationListSchema, readAllSchema } from "@nexusflow/shared";
import { Router } from "express";
import { currentAuth, requireVerified } from "../../middleware/auth.ts";
import { sendSuccess } from "../../utils/response.ts";
import { validateRequest } from "../../utils/validateRequest.ts";
import { idParam } from "../organizations/requestContext.ts";
import {
  listNotifications,
  markAllRead,
  markNotification,
  unreadCount,
} from "./notifications.service.ts";

// /api/v1/notifications (PRD §18.7): your own inbox, across your organizations.
export const notificationsRouter = Router();
notificationsRouter.use(requireVerified);

notificationsRouter.get("/", async (req, res) => {
  const { query } = validateRequest(req, { query: notificationListSchema });
  const page = await listNotifications(currentAuth(req).user.id, query);
  sendSuccess(res, page.items, 200, { nextCursor: page.nextCursor });
});

notificationsRouter.get("/unread-count", async (req, res) => {
  sendSuccess(res, await unreadCount(currentAuth(req).user.id));
});

notificationsRouter.post("/read-all", async (req, res) => {
  const { body } = validateRequest(req, { body: readAllSchema });
  sendSuccess(res, await markAllRead(currentAuth(req).user.id, body.orgId));
});

for (const [action, read] of [
  ["read", true],
  ["unread", false],
] as const) {
  notificationsRouter.post(`/:notificationId/${action}`, async (req, res) => {
    await markNotification(currentAuth(req).user.id, idParam(req, "notificationId"), read);
    sendSuccess(res, { [action]: true });
  });
}
