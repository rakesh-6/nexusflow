import {
  bulkTaskSchema,
  createTaskSchema,
  dependencySchema,
  moveTaskSchema,
  PRIORITIES,
  STATUS_CATEGORIES,
  updateTaskSchema,
} from "@nexusflow/shared";
import { z } from "zod";
import { cursorMeta, FORBIDDEN, flag, ok, okPage, type Endpoint } from "./helpers.ts";

// API documentation for Phase 5: tasks, the board, links, bulk changes, My Tasks.

const Person = z.object({ id: z.uuid(), name: z.string(), avatarUrl: z.url().nullable() });
const StatusRef = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string(),
  category: z.enum(STATUS_CATEGORIES),
});

const Task = z.object({
  id: z.uuid(),
  key: z.string().describe('Project key and number, e.g. "NEX-42"'),
  number: z.number().int(),
  projectId: z.uuid(),
  title: z.string(),
  status: StatusRef,
  priority: z.enum(PRIORITIES),
  assignees: z.array(Person),
  labels: z.array(z.object({ id: z.uuid(), name: z.string(), color: z.string() })),
  milestone: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  parentTaskId: z.uuid().nullable(),
  startDate: z.iso.date().nullable(),
  dueDate: z.iso.date().nullable(),
  estimatedHours: z.number().nullable(),
  actualHours: z.number().nullable(),
  position: z.string().describe("Order inside the column; sort as plain text"),
  version: z.number().int().describe("Send it back when changing the task"),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  reporter: Person,
  createdById: z.uuid(),
  subtaskCount: z.number().int(),
  doneSubtaskCount: z.number().int(),
  openBlockerCount: z.number().int(),
  commentCount: z.number().int(),
  attachmentCount: z.number().int(),
});

const TaskLink = z.object({
  dependencyId: z.uuid(),
  id: z.uuid(),
  key: z.string(),
  title: z.string(),
  status: StatusRef,
});

const TaskDetail = Task.extend({
  description: z.unknown().describe("Editor document (Tiptap JSON), or null"),
  project: z.object({ id: z.uuid(), key: z.string(), name: z.string(), workspaceId: z.uuid() }),
  parent: z.object({ id: z.uuid(), key: z.string(), title: z.string() }).nullable(),
  subtasks: z.array(Task),
  blockedBy: z.array(TaskLink),
  blocks: z.array(TaskLink),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});

const BoardColumn = z.object({
  statusId: z.uuid(),
  total: z.number().int(),
  tasks: z.array(Task),
  nextCursor: z.string().nullable(),
});

const Assignable = Person.extend({ role: z.string() });
const TrashedTask = z.object({
  id: z.uuid(),
  key: z.string(),
  title: z.string(),
  deletedAt: z.iso.datetime(),
  purgeAfter: z.iso.datetime(),
});
const Activity = z.object({
  id: z.uuid(),
  action: z.string(),
  actorName: z.string(),
  changes: z.unknown(),
  metadata: z.unknown(),
  createdAt: z.iso.datetime(),
});
const MyTasks = z.object({
  today: z.iso.date(),
  tasks: z.array(
    Task.extend({
      project: z.object({ id: z.uuid(), key: z.string(), name: z.string() }),
      group: z.enum(["OVERDUE", "TODAY", "THIS_WEEK", "LATER", "NO_DATE"]),
    }),
  ),
  projects: z.array(
    z.object({
      id: z.uuid(),
      key: z.string(),
      name: z.string(),
      statuses: z.array(StatusRef),
    }),
  ),
});

const pageMeta = z.object({ nextCursor: z.string().nullable() });
const WS = "/orgs/{orgSlug}/workspaces/{workspaceSlug}";
const P = "/orgs/{orgSlug}/projects/{projectId}";
const T = "/orgs/{orgSlug}/tasks/{taskId}";
const NOT_FOUND = "No such task or project you can open (NOT_FOUND)";
const ARCHIVED = "The project is archived (PROJECT_ARCHIVED)";
const CONFLICT =
  "Someone saved first; error.details.current holds the latest task (VERSION_CONFLICT)";

const endpoint = (
  method: Endpoint["method"],
  path: string,
  summary: string,
  responses: Endpoint["responses"],
  extra: Partial<Endpoint> = {},
): Endpoint => ({ method, path, tag: "Tasks", summary, auth: true, responses, ...extra });

export const TASK_ENDPOINTS: Endpoint[] = [
  endpoint(
    "get",
    `${P}/tasks`,
    "List tasks with filters, sorting and paging (?statusId, category, priority, assigneeId=me|unassigned, labelId, milestoneId, parentTaskId=null, dueFrom, dueTo, hasDueDate, overdue, q, sort=-priority, cursor, limit)",
    {
      "200": ["Tasks", okPage(z.array(Task), pageMeta)],
      "404": [NOT_FOUND],
    },
  ),
  endpoint(
    "post",
    `${P}/tasks`,
    "Create a task (title only is required; it starts in the default column)",
    {
      "201": ["Task created", ok(Task)],
      "400": ["Unknown column, label, milestone or assignee, or subtask too deep (MAX_DEPTH)"],
      "403": [FORBIDDEN],
      "409": [ARCHIVED],
    },
    { body: createTaskSchema },
  ),
  endpoint(
    "get",
    `${P}/board`,
    "Every column with its first 200 cards and its total (same filters as the task list)",
    { "200": ["Columns in board order", ok(z.array(BoardColumn))] },
  ),
  endpoint(
    "get",
    `${P}/assignable`,
    "People who can be assigned tasks (contributors and managers)",
    {
      "200": ["People", ok(z.array(Assignable))],
    },
  ),
  endpoint(
    "post",
    `${P}/tasks/bulk`,
    "Change or delete up to 100 tasks at once, all or nothing",
    {
      "200": ["Done", ok(z.object({ updated: z.number().int() }))],
      "400": ["More than 100 tasks, or nothing to change"],
      "403": [FORBIDDEN],
    },
    { body: bulkTaskSchema },
  ),
  endpoint("get", `${P}/tasks/trash`, "Tasks deleted in the last 30 days", {
    "200": ["Trashed tasks", ok(z.array(TrashedTask))],
  }),
  endpoint("get", `${WS}/tasks/by-key/{taskKey}`, 'One task by its key, e.g. "NEX-42"', {
    "200": ["Task", ok(TaskDetail)],
    "404": [NOT_FOUND],
  }),
  endpoint("get", `${WS}/my-tasks`, "Open tasks assigned to you, grouped by due date", {
    "200": ["Your tasks", ok(MyTasks)],
  }),
  endpoint("get", T, "One task with subtasks, links and your rights", {
    "200": ["Task", ok(TaskDetail)],
    "404": [NOT_FOUND],
  }),
  endpoint(
    "patch",
    T,
    "Change fields of a task (send the version you last saw)",
    {
      "200": ["Updated", ok(TaskDetail)],
      "400": ["Invalid values, e.g. due date before the start date"],
      "403": [FORBIDDEN],
      "409": [CONFLICT],
    },
    { body: updateTaskSchema },
  ),
  endpoint("delete", T, "Move a task and its subtasks to the trash", {
    "200": ["Deleted", ok(flag("deleted"))],
    "403": ["Contributors can delete only tasks they created (FORBIDDEN)"],
  }),
  endpoint(
    "post",
    `${T}/move`,
    "Move a task to a column and a place in it (meta.renumbered: the column's order keys were rewritten)",
    {
      "200": ["Moved", okPage(Task, z.object({ renumbered: z.boolean() }))],
      "400": ["The column or a neighbour is not in this project (STATUS_NOT_IN_PROJECT)"],
      "409": [CONFLICT],
    },
    { body: moveTaskSchema },
  ),
  endpoint("post", `${T}/restore`, "Bring a task back from the trash (within 30 days)", {
    "200": ["Restored", ok(Task)],
    "409": ["Restore its parent first (PARENT_DELETED)"],
  }),
  endpoint(
    "post",
    `${T}/duplicate`,
    "Copy a task with its subtasks and labels (title gets “(copy)”)",
    { "201": ["Copy created", ok(Task)], "403": [FORBIDDEN] },
  ),
  endpoint("get", `${T}/activity`, "The task's history, newest first (?cursor&limit)", {
    "200": ["History", okPage(z.array(Activity), cursorMeta)],
  }),
  endpoint(
    "post",
    `${T}/dependencies`,
    "Link two tasks: this one is blocked by, or blocks, another",
    {
      "201": ["Linked", ok(TaskDetail)],
      "409": ["It would make a loop (DEPENDENCY_CYCLE) or already exists (DEPENDENCY_EXISTS)"],
    },
    { body: dependencySchema },
  ),
  endpoint("delete", `${T}/dependencies/{dependencyId}`, "Remove a link", {
    "200": ["Removed", ok(TaskDetail)],
  }),
];
