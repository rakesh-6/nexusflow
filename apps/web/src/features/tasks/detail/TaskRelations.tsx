import type { TaskDetail, TaskLink, TaskStatusSummary } from "@nexusflow/shared";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useDeferredValue, useState, type FormEvent } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { errorMessage } from "../../../lib/api";
import {
  fetchTaskPage,
  tasksKey,
  useChangeDependencies,
  useCreateTask,
  useUpdateTask,
} from "../hooks";
import { StatusDot, selectClass } from "../taskBits";

// Subtasks (PRD §11.6.4) and "blocked by / blocks" links (PRD §11.6.5).

export function SubtaskList({
  orgSlug,
  task,
  statuses,
  canEdit,
  onOpen,
}: {
  orgSlug: string;
  task: TaskDetail;
  statuses: TaskStatusSummary[];
  canEdit: boolean;
  onOpen: (key: string) => void;
}) {
  const [title, setTitle] = useState("");
  const create = useCreateTask(orgSlug, task.projectId);
  const update = useUpdateTask(orgSlug, task.projectId);
  const doneStatus = statuses.find((s) => s.category === "DONE");
  const openStatus =
    statuses.find((s) => s.isDefault) ?? statuses.find((s) => s.category !== "DONE");

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim(), parentTaskId: task.id },
      { onSuccess: () => setTitle("") },
    );
  };

  return (
    <div className="space-y-2">
      {task.subtasks.length > 0 && (
        <ul className="divide-y rounded-control border">
          {task.subtasks.map((subtask) => {
            const done = subtask.status.category === "DONE";
            const target = done ? openStatus : doneStatus;
            return (
              <li key={subtask.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={done}
                  disabled={!canEdit || !target || update.isPending}
                  aria-label={`${subtask.key} done`}
                  onChange={() =>
                    target &&
                    update.mutate({
                      taskId: subtask.id,
                      version: subtask.version,
                      statusId: target.id,
                    })
                  }
                />
                <button
                  type="button"
                  onClick={() => onOpen(subtask.key)}
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                >
                  <span className="mr-2 text-xs text-muted-foreground">{subtask.key}</span>
                  <span className={done ? "text-muted-foreground line-through" : ""}>
                    {subtask.title}
                  </span>
                </button>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <StatusDot color={subtask.status.color} /> {subtask.status.name}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && (
        <form onSubmit={add} className="flex gap-2">
          <Input
            aria-label="New subtask title"
            placeholder="Add a subtask"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            className="h-8"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={!title.trim() || create.isPending}
          >
            <Plus /> Add
          </Button>
        </form>
      )}
      {(create.isError || update.isError) && (
        <p className="text-xs text-destructive">{errorMessage(create.error ?? update.error)}</p>
      )}
    </div>
  );
}

function LinkRows({
  links,
  canEdit,
  onOpen,
  onRemove,
}: {
  links: TaskLink[];
  canEdit: boolean;
  onOpen: (key: string) => void;
  onRemove: (dependencyId: string) => void;
}) {
  return (
    <ul className="space-y-1">
      {links.map((link) => (
        <li key={link.dependencyId} className="flex items-center gap-2 text-sm">
          <StatusDot color={link.status.color} />
          <button
            type="button"
            onClick={() => onOpen(link.key)}
            className="min-w-0 flex-1 truncate text-left hover:underline"
          >
            <span className="mr-2 text-xs text-muted-foreground">{link.key}</span>
            <span
              className={
                link.status.category === "DONE" ? "text-muted-foreground line-through" : ""
              }
            >
              {link.title}
            </span>
          </button>
          {canEdit && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7"
              aria-label={`Remove link to ${link.key}`}
              onClick={() => onRemove(link.dependencyId)}
            >
              <X />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function DependencyList({
  orgSlug,
  task,
  canEdit,
  onOpen,
}: {
  orgSlug: string;
  task: TaskDetail;
  canEdit: boolean;
  onOpen: (key: string) => void;
}) {
  const change = useChangeDependencies(orgSlug, task.projectId);
  const [direction, setDirection] = useState<"BLOCKED_BY" | "BLOCKS">("BLOCKED_BY");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const linked = new Set([
    task.id,
    ...task.blockedBy.map((l) => l.id),
    ...task.blocks.map((l) => l.id),
  ]);
  const results = useQuery({
    queryKey: [...tasksKey(orgSlug, task.projectId), "search", q],
    queryFn: () =>
      fetchTaskPage(orgSlug, task.projectId, { q }, { limit: "8", sort: "-updatedAt" }),
    enabled: q.length > 0,
  });
  const remove = (dependencyId: string) =>
    change.mutate({ kind: "remove", taskId: task.id, dependencyId });

  return (
    <div className="space-y-3">
      {task.blockedBy.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Blocked by</p>
          <LinkRows links={task.blockedBy} canEdit={canEdit} onOpen={onOpen} onRemove={remove} />
        </div>
      )}
      {task.blocks.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Blocks</p>
          <LinkRows links={task.blocks} canEdit={canEdit} onOpen={onOpen} onRemove={remove} />
        </div>
      )}
      {canEdit && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <select
              aria-label="Link type"
              className={selectClass}
              value={direction}
              onChange={(event) => setDirection(event.target.value as "BLOCKED_BY" | "BLOCKS")}
            >
              <option value="BLOCKED_BY">Blocked by</option>
              <option value="BLOCKS">Blocks</option>
            </select>
            <Input
              aria-label="Find a task to link"
              placeholder="Find a task by title or key"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8"
            />
          </div>
          {q && (
            <ul className="rounded-control border">
              {results.isPending && (
                <li className="px-2 py-1.5 text-sm text-muted-foreground">Searching…</li>
              )}
              {results.data?.items
                .filter((item) => !linked.has(item.id))
                .map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-surface"
                      onClick={() =>
                        change.mutate(
                          { kind: "add", taskId: task.id, otherTaskId: item.id, direction },
                          { onSuccess: () => setSearch("") },
                        )
                      }
                    >
                      <span className="text-xs text-muted-foreground">{item.key}</span>
                      <span className="truncate">{item.title}</span>
                    </button>
                  </li>
                ))}
              {results.data &&
                results.data.items.filter((item) => !linked.has(item.id)).length === 0 && (
                  <li className="px-2 py-1.5 text-sm text-muted-foreground">
                    No other matching tasks
                  </li>
                )}
            </ul>
          )}
        </div>
      )}
      {change.isError && <p className="text-xs text-destructive">{errorMessage(change.error)}</p>}
      {!canEdit && task.blockedBy.length === 0 && task.blocks.length === 0 && (
        <p className="text-sm text-muted-foreground">No links.</p>
      )}
    </div>
  );
}
