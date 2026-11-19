import { createCommentSchema, reactionSchema, updateCommentSchema } from "@nexusflow/shared";
import { z } from "zod";
import { FORBIDDEN, flag, ok, type Endpoint } from "./helpers.ts";

// API documentation for Phase 6: comments, mentions and reactions.

const Person = z.object({ id: z.uuid(), name: z.string(), avatarUrl: z.url().nullable() });
const Reaction = z.object({
  emoji: z.string(),
  count: z.number().int(),
  userIds: z.array(z.uuid()),
});

const CommentFields = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  parentCommentId: z.uuid().nullable(),
  author: Person,
  body: z.unknown().describe("Editor document (Tiptap JSON); null for a deleted placeholder"),
  bodyText: z.string(),
  deleted: z.boolean(),
  editedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  reactions: z.array(Reaction),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});
const Comment = CommentFields.extend({ replies: z.array(CommentFields) });

const T = "/orgs/{orgSlug}/tasks/{taskId}";
const C = "/orgs/{orgSlug}/comments/{commentId}";
const NOT_FOUND = "No such task or comment you can open (NOT_FOUND)";

const endpoint = (
  method: Endpoint["method"],
  path: string,
  summary: string,
  responses: Endpoint["responses"],
  extra: Partial<Endpoint> = {},
): Endpoint => ({ method, path, tag: "Comments", summary, auth: true, responses, ...extra });

export const COMMENT_ENDPOINTS: Endpoint[] = [
  endpoint(
    "get",
    `${T}/comments`,
    "A task's comments, oldest first, with replies (a deleted comment stays as a placeholder while it has replies)",
    { "200": ["Comments", ok(z.array(Comment))], "404": [NOT_FOUND] },
  ),
  endpoint(
    "post",
    `${T}/comments`,
    "Comment on a task, or reply to a comment (contributors and managers); mentions of people outside the project become plain text",
    {
      "201": ["Comment created", ok(Comment)],
      "400": ["Empty or invalid text, or a reply to a reply (MAX_DEPTH)"],
      "403": [FORBIDDEN],
      "409": ["The project is archived (PROJECT_ARCHIVED)"],
    },
    { body: createCommentSchema },
  ),
  endpoint("get", `${T}/mentionable`, "People who can be @mentioned on this task", {
    "200": ["People", ok(z.array(Person.extend({ role: z.string() })))],
  }),
  endpoint(
    "patch",
    C,
    "Change your own comment (marks it edited)",
    { "200": ["Updated", ok(Comment)], "403": ["Only the author can edit (FORBIDDEN)"] },
    { body: updateCommentSchema },
  ),
  endpoint("delete", C, "Delete a comment (its author or a project manager)", {
    "200": ["Deleted", ok(flag("deleted"))],
    "403": [FORBIDDEN],
  }),
  endpoint(
    "post",
    `${C}/reactions`,
    "Add an emoji reaction, or take it back if you already gave it",
    {
      "200": ["The comment's reactions", ok(z.array(Reaction))],
      "400": ["Not a single emoji"],
    },
    { body: reactionSchema },
  ),
];
