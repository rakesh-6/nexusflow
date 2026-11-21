import { PRIORITIES, type Priority, type TaskDetail, type TaskSummary } from "@nexusflow/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Trash2, X } from "lucide-react";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { UserAvatar } from "../../../components/common/UserAvatar";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Skeleton } from "../../../components/ui/skeleton";
import type { WorkspaceContext } from "../../../hooks/useWorkspace";
import { ApiError, errorMessage } from "../../../lib/api";
import { formatDateTime } from "../../organizations/labels";
import { useLabels, useMilestones, useStatuses } from "../../projects/hooks";
import { PRIORITY_LABELS } from "../../projects/labels";
import { useCurrentUser } from "../../auth/hooks";
import { useTaskPresence } from "../../realtime/useRealtime";
import {
  conflictTask,
  taskQueryKey,
  useAssignable,
  useMentionable,
  useTask,
  useTaskAction,
  useUpdateTask,
  type TaskChange,
} from "../hooks";
import { LabelPicker, PeoplePicker } from "../pickers";
import { selectClass } from "../taskBits";
import { useOpenTask } from "../TaskPanel";
import { AttachmentsSection } from "./AttachmentsSection";
import { CommentsSection } from "./CommentsSection";
import { TaskActivity } from "./TaskActivity";
import { AiTaskTools } from "../../ai/AiTaskTools";
import { DependencyList, SubtaskList } from "./TaskRelations";

// Everything about one task (PRD §11.6): shown in the side panel and on the
// task's own page. Each property saves on its own, with the task's version, so
// two people editing at once never overwrite each other silently.

const DescriptionEditor = lazy(() => import("./DescriptionEditor"));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="py-1.5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

export default function TaskDetailView({
  taskKey,
  context,
  onClose,
  variant = "panel",
}: {
  taskKey: string;
  context: WorkspaceContext;
  onClose?: () => void;
  variant?: "panel" | "page";
}) {
  const query = useTask(context.organization.slug, context.workspace.slug, taskKey);
  if (query.isPending) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="space-y-4 p-6">
        <Alert variant={missing ? "info" : "error"}>
          {missing
            ? `Task ${taskKey} does not exist, or you cannot open it.`
            : "This task could not be loaded."}
        </Alert>
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    );
  }
  return (
    <Detail
      key={query.data.id}
      task={query.data}
      context={context}
      variant={variant}
      {...(onClose ? { onClose } : {})}
    />
  );
}

function Detail({
  task,
  context,
  onClose,
  variant,
}: {
  task: TaskDetail;
  context: WorkspaceContext;
  onClose?: () => void;
  variant: "panel" | "page";
}) {
  const orgSlug = context.organization.slug;
  const projectId = task.projectId;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const openInPanel = useOpenTask();
  const open =
    variant === "page" ? (key: string) => navigate(context.path(`tasks/${key}`)) : openInPanel;
  const statuses = useStatuses(orgSlug, projectId);
  const milestones = useMilestones(orgSlug, projectId);
  const { data: labelData } = useLabels(orgSlug, context.workspace.slug);
  const { data: people = [] } = useAssignable(orgSlug, projectId);
  const update = useUpdateTask(orgSlug, projectId);
  const action = useTaskAction(orgSlug, projectId);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canEdit = task.canEdit;
  const busy = update.isPending;
  // Who else has this task open right now, and who is typing a comment (PRD §11.8.4).
  const presence = useTaskPresence(task.id);
  const { data: mentionable = [] } = useMentionable(orgSlug, task.id);
  const { data: me } = useCurrentUser();
  const alsoHere = presence.viewers
    .filter((id) => id !== me?.id)
    .flatMap((id) => mentionable.filter((person) => person.id === id));

  const save = (change: Omit<TaskChange, "version">) => {
    setNotice(null);
    update.mutate(
      { taskId: task.id, version: task.version, ...change },
      {
        onSuccess: (detail) => queryClient.setQueryData(taskQueryKey(orgSlug, task.key), detail),
        onError: (error) => {
          const current = conflictTask(error);
          if (current) {
            queryClient.setQueryData(taskQueryKey(orgSlug, task.key), current);
            setNotice(
              "Someone else changed this task just now. You see their version; make your change again if needed.",
            );
          } else {
            setNotice(errorMessage(error));
          }
        },
      },
    );
  };

  const duplicate = () =>
    action.mutate(
      { taskId: task.id, action: "duplicate" },
      { onSuccess: (copy) => open((copy as TaskSummary).key) },
    );
  const remove = () =>
    action.mutate(
      { taskId: task.id, action: "delete" },
      {
        onSuccess: () =>
          onClose ? onClose() : navigate(context.path(`projects/${task.project.key}/board`)),
      },
    );
  // Fields below are uncontrolled and keyed by version, so they show fresh values after each save.
  const fieldKey = (name: string) => `${name}-${task.version}`;
  const hours = (value: string) => (value === "" ? null : Number(value));

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
        <Link
          to={context.path(`tasks/${task.key}`)}
          className="text-sm font-semibold hover:underline"
        >
          {task.key}
        </Link>
        <Link
          to={context.path(`projects/${task.project.key}/board`)}
          className="truncate text-sm text-muted-foreground hover:underline"
        >
          {task.project.name}
        </Link>
        <div className="ml-auto flex items-center gap-1">
          {alsoHere.length > 0 && (
            <span
              className="mr-2 flex items-center"
              title={`Also viewing: ${alsoHere.map((person) => person.name).join(", ")}`}
              aria-label={`Also viewing: ${alsoHere.map((person) => person.name).join(", ")}`}
            >
              {alsoHere.slice(0, 3).map((person) => (
                <UserAvatar
                  key={person.id}
                  name={person.name}
                  avatarUrl={person.avatarUrl}
                  className="-ml-1.5 size-6 ring-2 ring-success first:ml-0"
                />
              ))}
            </span>
          )}
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={duplicate} disabled={action.isPending}>
              <Copy /> Duplicate
            </Button>
          )}
          {task.canDelete && !confirmDelete && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="icon-sm" aria-label="Close task" onClick={onClose}>
              <X />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-6 px-5 py-5">
        {confirmDelete && (
          <Alert variant="error">
            <span className="flex flex-wrap items-center gap-2">
              Move {task.key}
              {task.subtaskCount > 0 && ` and its ${task.subtaskCount} subtasks`} to the trash? You
              can restore it for 30 days.
              <Button size="sm" variant="destructive" onClick={remove} disabled={action.isPending}>
                Delete
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </span>
          </Alert>
        )}
        {notice && <Alert variant="error">{notice}</Alert>}
        {action.isError && <Alert variant="error">{errorMessage(action.error)}</Alert>}
        {task.parent && (
          <p className="text-sm text-muted-foreground">
            Subtask of{" "}
            <button
              type="button"
              className="font-medium text-foreground hover:underline"
              onClick={() => open(task.parent?.key ?? "")}
            >
              {task.parent.key} {task.parent.title}
            </button>
          </p>
        )}

        <input
          key={fieldKey("title")}
          aria-label="Title"
          defaultValue={task.title}
          readOnly={!canEdit}
          maxLength={200}
          className="w-full rounded-control border border-transparent bg-transparent px-1 text-xl font-semibold hover:border-border focus-visible:border-ring read-only:hover:border-transparent"
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") event.currentTarget.value = task.title;
          }}
          onBlur={(event) => {
            const title = event.target.value.trim();
            if (title && title !== task.title) save({ title });
            else event.target.value = task.title;
          }}
        />

        <dl className="grid grid-cols-[7.5rem_1fr] items-start gap-x-3 gap-y-1 text-sm">
          <Property label="Status">
            <select
              aria-label="Status"
              className={selectClass}
              value={task.status.id}
              disabled={!canEdit || busy}
              onChange={(event) => save({ statusId: event.target.value })}
            >
              {(statuses.data ?? [task.status]).map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          </Property>
          <Property label="Priority">
            <select
              aria-label="Priority"
              className={selectClass}
              value={task.priority}
              disabled={!canEdit || busy}
              onChange={(event) => save({ priority: event.target.value as Priority })}
            >
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
                </option>
              ))}
            </select>
          </Property>
          <Property label="Assignees">
            <PeoplePicker
              people={people}
              selected={task.assignees}
              disabled={!canEdit || busy}
              onChange={(assigneeIds) => save({ assigneeIds })}
            />
          </Property>
          <Property label="Labels">
            <LabelPicker
              labels={labelData?.labels ?? []}
              selected={task.labels}
              disabled={!canEdit || busy}
              onChange={(labelIds) => save({ labelIds })}
            />
          </Property>
          <Property label="Milestone">
            <select
              aria-label="Milestone"
              className={selectClass}
              value={task.milestone?.id ?? ""}
              disabled={!canEdit || busy}
              onChange={(event) => save({ milestoneId: event.target.value || null })}
            >
              <option value="">None</option>
              {(milestones.data ?? []).map((milestone) => (
                <option key={milestone.id} value={milestone.id}>
                  {milestone.name}
                </option>
              ))}
            </select>
          </Property>
          <Property label="Start date">
            <Input
              key={fieldKey("start")}
              type="date"
              aria-label="Start date"
              className="h-8 w-44"
              defaultValue={task.startDate ?? ""}
              disabled={!canEdit || busy}
              onChange={(event) => save({ startDate: event.target.value || null })}
            />
          </Property>
          <Property label="Due date">
            <Input
              key={fieldKey("due")}
              type="date"
              aria-label="Due date"
              className="h-8 w-44"
              defaultValue={task.dueDate ?? ""}
              disabled={!canEdit || busy}
              onChange={(event) => save({ dueDate: event.target.value || null })}
            />
          </Property>
          <Property label="Estimate (h)">
            <Input
              key={fieldKey("estimate")}
              type="number"
              aria-label="Estimated hours"
              min={0}
              max={9999}
              step={0.25}
              className="h-8 w-28"
              defaultValue={task.estimatedHours ?? ""}
              disabled={!canEdit || busy}
              onBlur={(event) => {
                const value = hours(event.target.value);
                if (value !== task.estimatedHours) save({ estimatedHours: value });
              }}
            />
          </Property>
          <Property label="Actual (h)">
            <Input
              key={fieldKey("actual")}
              type="number"
              aria-label="Actual hours"
              min={0}
              max={9999}
              step={0.25}
              className="h-8 w-28"
              defaultValue={task.actualHours ?? ""}
              disabled={!canEdit || busy}
              onBlur={(event) => {
                const value = hours(event.target.value);
                if (value !== task.actualHours) save({ actualHours: value });
              }}
            />
          </Property>
          <Property label="Reporter">
            <span className="flex items-center gap-2 py-1">
              <UserAvatar
                name={task.reporter.name}
                avatarUrl={task.reporter.avatarUrl}
                className="size-5"
              />
              {task.reporter.name}
              <span className="text-xs text-muted-foreground">
                · {formatDateTime(task.createdAt)}
              </span>
            </span>
          </Property>
        </dl>

        <AiTaskTools orgSlug={orgSlug} task={task} onSave={(change) => save(change)} />

        <Section title="Description">
          <Suspense fallback={<Skeleton className="h-24" />}>
            <DescriptionEditor
              key={task.id}
              value={task.description}
              editable={canEdit}
              saving={busy}
              onSave={(description) => save({ description })}
            />
          </Suspense>
        </Section>

        {!task.parentTaskId && (
          <Section
            title={`Subtasks${task.subtaskCount ? ` · ${task.doneSubtaskCount}/${task.subtaskCount} done` : ""}`}
          >
            <SubtaskList
              orgSlug={orgSlug}
              task={task}
              statuses={statuses.data ?? []}
              canEdit={canEdit}
              onOpen={open}
            />
          </Section>
        )}

        <Section title={`Files${task.attachmentCount ? ` · ${task.attachmentCount}` : ""}`}>
          <AttachmentsSection orgSlug={orgSlug} task={task} />
        </Section>

        <Section title="Links">
          <DependencyList orgSlug={orgSlug} task={task} canEdit={canEdit} onOpen={open} />
        </Section>

        <Section title={`Comments${task.commentCount ? ` · ${task.commentCount}` : ""}`}>
          <CommentsSection orgSlug={orgSlug} task={task} typing={presence.typing} />
        </Section>

        <Section title="History">
          <TaskActivity orgSlug={orgSlug} taskId={task.id} />
        </Section>
      </div>
    </div>
  );
}
