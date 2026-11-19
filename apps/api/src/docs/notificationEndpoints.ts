import {
  NOTIFICATION_TYPES,
  notificationPreferencesSchema,
  readAllSchema,
} from "@nexusflow/shared";
import { z } from "zod";
import { cursorMeta, ok, okPage, type Endpoint } from "./helpers.ts";

// API documentation for Phase 7: notifications and their settings.

const Notification = z.object({
  id: z.uuid(),
  organizationId: z.uuid().nullable(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  body: z.string().nullable(),
  data: z
    .object({
      orgSlug: z.string().optional(),
      workspaceSlug: z.string().optional(),
      projectKey: z.string().optional(),
      taskKey: z.string().optional(),
      taskId: z.uuid().optional(),
      commentId: z.uuid().optional(),
    })
    .describe("Where clicking it leads"),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
const Preference = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  inApp: z.boolean(),
  email: z.boolean(),
});

const endpoint = (
  method: Endpoint["method"],
  path: string,
  summary: string,
  responses: Endpoint["responses"],
  extra: Partial<Endpoint> = {},
): Endpoint => ({ method, path, tag: "Notifications", summary, auth: true, responses, ...extra });

export const NOTIFICATION_ENDPOINTS: Endpoint[] = [
  endpoint(
    "get",
    "/notifications",
    "Your notifications, newest first (?unread=true&mentions=true&orgId&cursor&limit)",
    { "200": ["One page", okPage(z.array(Notification), cursorMeta)] },
  ),
  endpoint(
    "get",
    "/notifications/unread-count",
    "How many are unread, in total and per organization",
    {
      "200": [
        "Counts",
        ok(z.object({ total: z.number().int(), byOrg: z.record(z.string(), z.number().int()) })),
      ],
    },
  ),
  endpoint(
    "post",
    "/notifications/read-all",
    "Mark all your unread notifications as read (optionally in one organization)",
    { "200": ["Done", ok(z.object({ updated: z.number().int() }))] },
    { body: readAllSchema, optionalBody: true },
  ),
  endpoint("post", "/notifications/{notificationId}/read", "Mark one as read", {
    "200": ["Done", ok(z.object({ read: z.literal(true) }))],
    "404": ["Not your notification (NOT_FOUND)"],
  }),
  endpoint("post", "/notifications/{notificationId}/unread", "Mark one as unread", {
    "200": ["Done", ok(z.object({ unread: z.literal(true) }))],
    "404": ["Not your notification (NOT_FOUND)"],
  }),
  endpoint(
    "get",
    "/users/me/notification-preferences",
    "Your in-app and email choice for every notification type",
    { "200": ["Preferences", ok(z.array(Preference))] },
  ),
  endpoint(
    "put",
    "/users/me/notification-preferences",
    "Change some of your choices; answers the full list",
    { "200": ["Saved", ok(z.array(Preference))] },
    { body: notificationPreferencesSchema },
  ),
];
