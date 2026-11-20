import { signAttachmentSchema } from "@nexusflow/shared";
import { z } from "zod";
import { FORBIDDEN, flag, ok, type Endpoint } from "./helpers.ts";

// API documentation for Phase 7: file attachments.

const Attachment = z.object({
  id: z.uuid(),
  taskId: z.uuid().nullable(),
  commentId: z.uuid().nullable(),
  originalName: z.string(),
  mimeType: z.string(),
  bytes: z.number().int(),
  kind: z.enum(["IMAGE", "VIDEO", "RAW"]),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  uploader: z.object({ id: z.uuid(), name: z.string(), avatarUrl: z.url().nullable() }),
  createdAt: z.iso.datetime(),
  canDelete: z.boolean(),
});

const O = "/orgs/{orgSlug}";
const NOT_FOUND = "No such file or task you can open (NOT_FOUND)";
const NOT_SET_UP = "Cloudinary keys are missing on this server (STORAGE_NOT_CONFIGURED)";

const endpoint = (
  method: Endpoint["method"],
  path: string,
  summary: string,
  responses: Endpoint["responses"],
  extra: Partial<Endpoint> = {},
): Endpoint => ({ method, path, tag: "Attachments", summary, auth: true, responses, ...extra });

export const ATTACHMENT_ENDPOINTS: Endpoint[] = [
  endpoint(
    "post",
    `${O}/attachments/sign`,
    "Step 1: a one-time signed upload for a file on a task or comment (contributors)",
    {
      "201": [
        "Upload the file to `url` with `fields`, then confirm",
        ok(
          z.object({
            attachmentId: z.uuid(),
            url: z.url(),
            fields: z.record(z.string(), z.string()),
          }),
        ),
      ],
      "400": ["Not an allowed kind of file"],
      "402": ["Too big for the plan, or the organization's storage is full (PLAN_LIMIT_REACHED)"],
      "403": [FORBIDDEN],
      "409": ["The task already has 50 files (TOO_MANY_FILES)"],
      "503": [NOT_SET_UP],
    },
    { body: signAttachmentSchema },
  ),
  endpoint(
    "post",
    `${O}/attachments/{attachmentId}/confirm`,
    "Step 2: the server checks the uploaded file with the storage service; it then counts",
    {
      "200": ["Ready", ok(Attachment)],
      "400": [
        "Too big, or not the kind of file it claims to be; it was destroyed (UPLOAD_INVALID)",
      ],
      "404": [NOT_FOUND],
    },
  ),
  endpoint(
    "get",
    `${O}/attachments/{attachmentId}/url`,
    "A link to the file that works for 15 minutes",
    {
      "200": ["Link", ok(z.object({ url: z.url(), expiresAt: z.iso.datetime() }))],
      "404": [NOT_FOUND],
    },
  ),
  endpoint(
    "delete",
    `${O}/attachments/{attachmentId}`,
    "Remove a file (its uploader or a project manager)",
    {
      "200": ["Removed; the storage service deletes it shortly", ok(flag("deleted"))],
      "403": [FORBIDDEN],
    },
  ),
  endpoint("get", `${O}/tasks/{taskId}/attachments`, "A task's files, oldest first", {
    "200": ["Files", ok(z.array(Attachment))],
    "404": [NOT_FOUND],
  }),
];
