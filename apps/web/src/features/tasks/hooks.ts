import {
  taskFiltersToQuery,
  type ActivityEntry,
  type AssignablePerson,
  type BoardColumn,
  type BulkTaskInput,
  type CommentSummary,
  type CreateTaskInput,
  type MentionablePerson,
  type MoveTaskInput,
  type MyTasksResult,
  type RichTextDoc,
  type TaskDetail,
  type TaskFilters,
  type TaskSummary,
  type TrashedTask,
  type UpdateTaskInput,
} from "@nexusflow/shared";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import {
  ApiError,
  apiDelete,
  apiGet,
  apiGetPage,
  apiPatch,
  apiPost,
  apiPostPage,
} from "../../lib/api";
import { CURRENT_USER_KEY } from "../auth/hooks";

// Tasks as React hooks (PRD §11.6, §11.7). Everything about one project's
// tasks is cached under ["org", slug, "project", id, "tasks", …], so a change
// can refresh the board, the list and the calendar together.

const org = (orgSlug: string) => `/api/v1/orgs/${encodeURIComponent(orgSlug)}`;
const projectPath = (orgSlug: string, projectId: string) => `${org(orgSlug)}/projects/${projectId}`;
const taskPath = (orgSlug: string, taskId: string) => `${org(orgSlug)}/tasks/${taskId}`;

export const tasksKey = (orgSlug: string, projectId: string) =>
  ["org", orgSlug, "project", projectId, "tasks"] as const;
const taskDetailKey = (orgSlug: string) => ["org", orgSlug, "task"] as const;
const myTasksKey = (orgSlug: string) => ["org", orgSlug, "my-tasks"] as const;

export interface TaskPage {
  items: TaskSummary[];
  nextCursor: string | null;
}

/** After a change: the project's task views, the open task, My Tasks and project progress. */
export function refreshTasks(queryClient: QueryClient, orgSlug: string, projectId: string) {
  void queryClient.invalidateQueries({ queryKey: tasksKey(orgSlug, projectId) });
  void queryClient.invalidateQueries({ queryKey: taskDetailKey(orgSlug) });
  void queryClient.invalidateQueries({ queryKey: ["org", orgSlug, "task-activity"] });
  void queryClient.invalidateQueries({ queryKey: myTasksKey(orgSlug) });
  void queryClient.invalidateQueries({ queryKey: ["org", orgSlug, "projects"] });
}

/** Changes one task wherever it is shown (board, list, calendar) without waiting for the server. */
export function patchTaskEverywhere(
  queryClient: QueryClient,
  orgSlug: string,
  projectId: string,
  taskId: string,
  change: (task: TaskSummary) => TaskSummary,
) {
  const apply = (task: TaskSummary) => (task.id === taskId ? change(task) : task);
  const base = tasksKey(orgSlug, projectId);
  queryClient.setQueriesData<BoardColumn[]>({ queryKey: [...base, "board"] }, (columns) =>
    columns?.map((column) => ({ ...column, tasks: column.tasks.map(apply) })),
  );
  queryClient.setQueriesData<InfiniteData<TaskPage>>({ queryKey: [...base, "list"] }, (data) =>
    data
      ? { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map(apply) })) }
      : data,
  );
  queryClient.setQueriesData<TaskSummary[]>({ queryKey: [...base, "calendar"] }, (tasks) =>
    tasks?.map(apply),
  );
}

/** The latest version of a task the server sent with a 409 VERSION_CONFLICT, if any. */
export function conflictTask(error: unknown): TaskDetail | null {
  if (!(error instanceof ApiError) || error.code !== "VERSION_CONFLICT") return null;
  return (error.details as unknown as { current?: TaskDetail } | undefined)?.current ?? null;
}

// --- Reading -----------------------------------------------------------------------

export function useBoard(orgSlug: string, projectId: string, filters: TaskFilters) {
  return useQuery({
    queryKey: [...tasksKey(orgSlug, projectId), "board", filters],
    queryFn: () =>
      apiGet<BoardColumn[]>(
        `${projectPath(orgSlug, projectId)}/board?${taskFiltersToQuery(filters)}`,
      ),
    staleTime: 30_000,
  });
}

/** One page of tasks; used by "Load more" on a board column. */
export function fetchTaskPage(
  orgSlug: string,
  projectId: string,
  filters: TaskFilters,
  extra: Record<string, string>,
) {
  return apiGetPage<TaskSummary[], { nextCursor: string | null }>(
    `${projectPath(orgSlug, projectId)}/tasks?${taskFiltersToQuery(filters, extra)}`,
  ).then((page) => ({ items: page.data, nextCursor: page.meta.nextCursor ?? null }));
}

export function useTaskList(orgSlug: string, projectId: string, filters: TaskFilters) {
  return useInfiniteQuery({
    queryKey: [...tasksKey(orgSlug, projectId), "list", filters],
    queryFn: ({ pageParam }) =>
      fetchTaskPage(orgSlug, projectId, filters, {
        limit: "100",
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}

/** Every task due between two dates (or without a date), for the calendar. */
export function useCalendarTasks(
  orgSlug: string,
  projectId: string,
  filters: TaskFilters,
  range: { from: string; to: string } | "unscheduled",
) {
  return useQuery({
    queryKey: [...tasksKey(orgSlug, projectId), "calendar", range, filters],
    queryFn: async () => {
      const extra: Record<string, string> =
        range === "unscheduled"
          ? { hasDueDate: "false", limit: "200" }
          : { dueFrom: range.from, dueTo: range.to, limit: "200" };
      const tasks: TaskSummary[] = [];
      let cursor = "";
      // At most 5 pages (1,000 tasks) for one calendar screen.
      for (let page = 0; page < 5; page++) {
        const result = await fetchTaskPage(orgSlug, projectId, filters, {
          ...extra,
          ...(cursor ? { cursor } : {}),
        });
        tasks.push(...result.items);
        if (!result.nextCursor) break;
        cursor = result.nextCursor;
      }
      return tasks;
    },
    staleTime: 30_000,
  });
}

export const taskQueryKey = (orgSlug: string, key: string) =>
  [...taskDetailKey(orgSlug), key.toUpperCase()] as const;

export function useTask(orgSlug: string, workspaceSlug: string, key: string | null) {
  return useQuery({
    queryKey: taskQueryKey(orgSlug, key ?? ""),
    queryFn: () =>
      apiGet<TaskDetail>(
        `${org(orgSlug)}/workspaces/${encodeURIComponent(workspaceSlug)}/tasks/by-key/${encodeURIComponent(key ?? "")}`,
      ),
    enabled: !!key,
    retry: false,
  });
}

export function useTaskActivity(orgSlug: string, taskId: string | undefined) {
  return useQuery({
    queryKey: ["org", orgSlug, "task-activity", taskId],
    queryFn: () => apiGet<ActivityEntry[]>(`${taskPath(orgSlug, taskId ?? "")}/activity?limit=30`),
    enabled: !!taskId,
  });
}

export function useAssignable(orgSlug: string, projectId: string) {
  return useQuery({
    queryKey: ["org", orgSlug, "project", projectId, "assignable"],
    queryFn: () => apiGet<AssignablePerson[]>(`${projectPath(orgSlug, projectId)}/assignable`),
    staleTime: 60_000,
  });
}

export function useTaskTrash(orgSlug: string, projectId: string) {
  return useQuery({
    queryKey: [...tasksKey(orgSlug, projectId), "trash"],
    queryFn: () => apiGet<TrashedTask[]>(`${projectPath(orgSlug, projectId)}/tasks/trash`),
  });
}

export function useMyTasks(orgSlug: string, workspaceSlug: string) {
  return useQuery({
    queryKey: [...myTasksKey(orgSlug), workspaceSlug],
    queryFn: () =>
      apiGet<MyTasksResult>(
        `${org(orgSlug)}/workspaces/${encodeURIComponent(workspaceSlug)}/my-tasks`,
      ),
    staleTime: 30_000,
  });
}

// --- Changing ----------------------------------------------------------------------

export function useCreateTask(orgSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      apiPost<TaskSummary>(`${projectPath(orgSlug, projectId)}/tasks`, input),
    onSuccess: () => refreshTasks(queryClient, orgSlug, projectId),
  });
}

export type TaskChange = Omit<UpdateTaskInput, "version"> & { version: number };

/**
 * Saves changes to a task. Simple fields show at once everywhere; if someone
 * else saved first, the caches get their version and the error says so.
 */
export function useUpdateTask(orgSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, ...change }: TaskChange & { taskId: string }) =>
      apiPatch<TaskDetail>(taskPath(orgSlug, taskId), change),
    onMutate: ({ taskId, priority, title, dueDate }) => {
      patchTaskEverywhere(queryClient, orgSlug, projectId, taskId, (task) => ({
        ...task,
        ...(priority ? { priority } : {}),
        ...(title ? { title } : {}),
        ...(dueDate !== undefined ? { dueDate } : {}),
      }));
    },
    onError: (error, { taskId }) => {
      const current = conflictTask(error);
      if (current) patchTaskEverywhere(queryClient, orgSlug, projectId, taskId, () => current);
    },
    onSettled: () => refreshTasks(queryClient, orgSlug, projectId),
  });
}

/** The board updates its own cache around this call (it knows the neighbours). */
export function useMoveTask(orgSlug: string) {
  return useMutation({
    mutationFn: ({ taskId, ...move }: MoveTaskInput & { taskId: string }) =>
      apiPostPage<TaskSummary, { renumbered: boolean }>(`${taskPath(orgSlug, taskId)}/move`, move),
  });
}

export function useTaskAction(orgSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      action,
    }: {
      taskId: string;
      action: "delete" | "restore" | "duplicate";
    }): Promise<unknown> =>
      action === "delete"
        ? apiDelete(taskPath(orgSlug, taskId))
        : apiPost<TaskSummary>(`${taskPath(orgSlug, taskId)}/${action}`),
    onSuccess: () => refreshTasks(queryClient, orgSlug, projectId),
  });
}

export function useBulkTasks(orgSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkTaskInput) =>
      apiPost<{ updated: number }>(`${projectPath(orgSlug, projectId)}/tasks/bulk`, input),
    onSettled: () => refreshTasks(queryClient, orgSlug, projectId),
  });
}

// --- Comments (PRD §11.9) ------------------------------------------------------------

const commentsKey = (orgSlug: string, taskId: string) =>
  ["org", orgSlug, "task-comments", taskId] as const;

export function useComments(orgSlug: string, taskId: string) {
  return useQuery({
    queryKey: commentsKey(orgSlug, taskId),
    queryFn: () => apiGet<CommentSummary[]>(`${taskPath(orgSlug, taskId)}/comments`),
  });
}

/** People who can be @mentioned: everyone who can open the task's project. */
export function useMentionable(orgSlug: string, taskId: string) {
  return useQuery({
    queryKey: ["org", orgSlug, "task-mentionable", taskId],
    queryFn: () => apiGet<MentionablePerson[]>(`${taskPath(orgSlug, taskId)}/mentionable`),
    staleTime: 60_000,
  });
}

type CommentChange =
  | { kind: "create"; body: RichTextDoc; parentCommentId?: string }
  | { kind: "update"; commentId: string; body: RichTextDoc }
  | { kind: "delete"; commentId: string }
  | { kind: "react"; commentId: string; emoji: string };

/** Flips one reaction in the cached comments, so the click shows at once. */
function flipReaction(
  comments: CommentSummary[],
  commentId: string,
  emoji: string,
  userId: string,
) {
  const flip = (comment: CommentSummary): CommentSummary => {
    if (comment.id !== commentId) return { ...comment, replies: comment.replies.map(flip) };
    const current = comment.reactions.find((reaction) => reaction.emoji === emoji);
    const mine = current?.userIds.includes(userId) ?? false;
    const reactions = current
      ? comment.reactions
          .map((reaction) =>
            reaction.emoji !== emoji
              ? reaction
              : {
                  ...reaction,
                  count: reaction.count + (mine ? -1 : 1),
                  userIds: mine
                    ? reaction.userIds.filter((id) => id !== userId)
                    : [...reaction.userIds, userId],
                },
          )
          .filter((reaction) => reaction.count > 0)
      : [...comment.reactions, { emoji, count: 1, userIds: [userId] }];
    return { ...comment, reactions };
  };
  return comments.map(flip);
}

export function useChangeComments(orgSlug: string, projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  const key = commentsKey(orgSlug, taskId);
  return useMutation({
    mutationFn: async (change: CommentChange): Promise<unknown> => {
      const base = `${taskPath(orgSlug, taskId)}/comments`;
      const comment = `${org(orgSlug)}/comments`;
      switch (change.kind) {
        case "create":
          return apiPost(base, { body: change.body, parentCommentId: change.parentCommentId });
        case "update":
          return apiPatch(`${comment}/${change.commentId}`, { body: change.body });
        case "delete":
          return apiDelete(`${comment}/${change.commentId}`);
        case "react":
          return apiPost(`${comment}/${change.commentId}/reactions`, { emoji: change.emoji });
      }
    },
    onMutate: async (change) => {
      if (change.kind !== "react") return undefined;
      const user = queryClient.getQueryData<{ id: string }>(CURRENT_USER_KEY);
      const previous = queryClient.getQueryData<CommentSummary[]>(key);
      if (user && previous) {
        queryClient.setQueryData(
          key,
          flipReaction(previous, change.commentId, change.emoji, user.id),
        );
      }
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      // Cards show how many comments a task has.
      void queryClient.invalidateQueries({ queryKey: tasksKey(orgSlug, projectId) });
    },
  });
}

type DependencyChange =
  | { kind: "add"; taskId: string; otherTaskId: string; direction: "BLOCKED_BY" | "BLOCKS" }
  | { kind: "remove"; taskId: string; dependencyId: string };

export function useChangeDependencies(orgSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: DependencyChange) =>
      change.kind === "add"
        ? apiPost<TaskDetail>(`${taskPath(orgSlug, change.taskId)}/dependencies`, {
            otherTaskId: change.otherTaskId,
            direction: change.direction,
          })
        : apiDelete<TaskDetail>(
            `${taskPath(orgSlug, change.taskId)}/dependencies/${change.dependencyId}`,
          ),
    onSuccess: () => refreshTasks(queryClient, orgSlug, projectId),
  });
}
