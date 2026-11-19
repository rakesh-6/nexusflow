import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  positionBetween,
  type BoardColumn,
  type TaskStatusSummary,
  type TaskSummary,
} from "@nexusflow/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronsLeftRight,
  ChevronsRightLeft,
  ListChecks,
  MessageSquare,
  Plus,
  Settings2,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Skeleton } from "../../../components/ui/skeleton";
import { errorMessage } from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { useProjectOutlet } from "../../../pages/ProjectLayout";
import { useStatuses } from "../../projects/hooks";
import {
  conflictTask,
  fetchTaskPage,
  refreshTasks,
  tasksKey,
  useBoard,
  useCreateTask,
  useMoveTask,
} from "../hooks";
import {
  AssigneeStack,
  BlockedIcon,
  DueDate,
  LabelChips,
  PRIORITY_BAR,
  PriorityIcon,
  StatusDot,
  useToday,
} from "../taskBits";
import { TaskFilterBar } from "../TaskFilterBar";
import { useOpenTask } from "../TaskPanel";
import { useTaskFilters } from "../useTaskFilters";

// The Kanban board (PRD §11.7.1): one column per status, cards you drag with a
// mouse, a finger or the keyboard (Tab to a card, Space to pick it up, arrow
// keys to move, Space to drop, Escape to cancel; Enter opens it).

type Columns = Record<string, TaskSummary[]>;
const COLUMN_PREFIX = "column:";

function findColumn(columns: Columns, id: string) {
  if (id.startsWith(COLUMN_PREFIX)) return id.slice(COLUMN_PREFIX.length);
  return Object.keys(columns).find((statusId) => columns[statusId]?.some((t) => t.id === id));
}

export function TaskCardBody({ task, today }: { task: TaskSummary; today: string }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{task.key}</span>
        <span className="flex items-center gap-1.5">
          <BlockedIcon count={task.openBlockerCount} />
          <PriorityIcon priority={task.priority} />
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium">{task.title}</p>
      {task.labels.length > 0 && (
        <div className="mt-2">
          <LabelChips labels={task.labels} />
        </div>
      )}
      <div className="mt-2 flex min-h-6 items-center gap-3 text-xs text-muted-foreground">
        {task.dueDate && (
          <DueDate dueDate={task.dueDate} category={task.status.category} today={today} />
        )}
        {task.subtaskCount > 0 && (
          <span className="flex items-center gap-1" title="Subtasks done">
            <ListChecks className="size-3.5" aria-hidden="true" />
            {task.doneSubtaskCount}/{task.subtaskCount}
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="flex items-center gap-1" title="Comments">
            <MessageSquare className="size-3.5" aria-hidden="true" />
            {task.commentCount}
          </span>
        )}
        <span className="ml-auto">
          <AssigneeStack people={task.assignees} />
        </span>
      </div>
    </>
  );
}

const cardClass = "rounded-control border border-l-4 bg-card p-2.5 shadow-sm";

function SortableCard({
  task,
  today,
  disabled,
  dragging,
  onOpen,
}: {
  task: TaskSummary;
  today: string;
  disabled: boolean;
  dragging: boolean;
  onOpen: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-label={`${task.key}: ${task.title}`}
      onClick={() => onOpen(task.key)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !dragging) {
          event.preventDefault();
          onOpen(task.key);
          return;
        }
        listeners?.["onKeyDown"]?.(event);
      }}
      className={cn(
        cardClass,
        PRIORITY_BAR[task.priority],
        "cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-2",
        isDragging && "opacity-40",
      )}
    >
      <TaskCardBody task={task} today={today} />
    </li>
  );
}

function QuickAdd({
  orgSlug,
  projectId,
  statusId,
}: {
  orgSlug: string;
  projectId: string;
  statusId: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const create = useCreateTask(orgSlug, projectId);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-control px-2 py-1.5 text-sm text-muted-foreground hover:bg-card hover:text-foreground"
      >
        <Plus className="size-4" aria-hidden="true" /> Add task
      </button>
    );
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    create.mutate({ title: title.trim(), statusId }, { onSuccess: () => setTitle("") });
  };
  return (
    <form onSubmit={submit} className="space-y-1">
      <Input
        autoFocus
        aria-label="New task title"
        placeholder="Title, then Enter"
        value={title}
        maxLength={200}
        disabled={create.isPending}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
        onBlur={() => !title && setOpen(false)}
        className="h-8"
      />
      {create.isError && <p className="text-xs text-destructive">{errorMessage(create.error)}</p>}
    </form>
  );
}

function Column({
  status,
  column,
  tasks,
  today,
  canEdit,
  dragging,
  orgSlug,
  projectId,
  onOpen,
  onLoadMore,
  loadingMore,
}: {
  status: TaskStatusSummary;
  column: BoardColumn | undefined;
  tasks: TaskSummary[];
  today: string;
  canEdit: boolean;
  dragging: boolean;
  orgSlug: string;
  projectId: string;
  onOpen: (key: string) => void;
  onLoadMore: () => void;
  loadingMore: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: `${COLUMN_PREFIX}${status.id}` });
  const total = column?.total ?? tasks.length;
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label={`Expand ${status.name}`}
        className="flex w-11 shrink-0 flex-col items-center gap-2 rounded-card bg-surface py-3 text-sm"
      >
        <ChevronsLeftRight className="size-4 text-muted-foreground" aria-hidden="true" />
        <StatusDot color={status.color} />
        <span className="[writing-mode:vertical-rl]">
          {status.name} · {total}
        </span>
      </button>
    );
  }
  return (
    <section
      aria-label={`${status.name}, ${total} tasks`}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-card bg-surface",
        isOver && "ring-2 ring-primary/40",
      )}
    >
      <header className="flex items-center gap-2 px-3 pb-1 pt-3">
        <StatusDot color={status.color} />
        <h2 className="truncate text-sm font-semibold">{status.name}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{total}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto size-7"
          aria-label={`Collapse ${status.name}`}
          onClick={() => setCollapsed(true)}
        >
          <ChevronsRightLeft />
        </Button>
      </header>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className="flex max-h-[calc(100vh-17rem)] min-h-20 flex-col gap-2 overflow-y-auto p-2"
        >
          {tasks.map((task) => (
            <SortableCard
              key={task.id}
              task={task}
              today={today}
              disabled={!canEdit}
              dragging={dragging}
              onOpen={onOpen}
            />
          ))}
        </ul>
      </SortableContext>
      <div className="space-y-1 px-2 pb-2">
        {column?.nextCursor && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? "Loading…" : `Load more (${total - tasks.length} more)`}
          </Button>
        )}
        {canEdit && <QuickAdd orgSlug={orgSlug} projectId={projectId} statusId={status.id} />}
      </div>
    </section>
  );
}

export default function BoardPage() {
  const { project, context } = useProjectOutlet();
  const orgSlug = context.organization.slug;
  const filterState = useTaskFilters();
  const { filters } = filterState;
  const board = useBoard(orgSlug, project.id, filters);
  const statuses = useStatuses(orgSlug, project.id);
  const move = useMoveTask(orgSlug);
  const queryClient = useQueryClient();
  const openTask = useOpenTask();
  const today = useToday();
  const [drag, setDrag] = useState<{ taskId: string; columns: Columns } | null>(null);
  const [loadingColumn, setLoadingColumn] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

  const boardKey = [...tasksKey(orgSlug, project.id), "board", filters];
  const canEdit = project.access.canContribute && project.status !== "ARCHIVED";
  const saved: Columns = Object.fromEntries((board.data ?? []).map((c) => [c.statusId, c.tasks]));
  const columns = drag?.columns ?? saved;
  const activeTask = drag
    ? Object.values(drag.columns)
        .flat()
        .find((t) => t.id === drag.taskId)
    : null;

  const onDragStart = ({ active }: DragStartEvent) => {
    setProblem(null);
    setDrag({ taskId: String(active.id), columns: saved });
  };

  // Crossing into another column: show the card there straight away.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !drag) return;
    const from = findColumn(drag.columns, String(active.id));
    const to = findColumn(drag.columns, String(over.id));
    if (!from || !to || from === to) return;
    setDrag((current) => {
      if (!current) return current;
      const next = { ...current.columns };
      const card = next[from]?.find((t) => t.id === active.id);
      if (!card) return current;
      next[from] = (next[from] ?? []).filter((t) => t.id !== active.id);
      const target = next[to] ?? [];
      const overIndex = target.findIndex((t) => t.id === over.id);
      const index = overIndex >= 0 ? overIndex : target.length;
      next[to] = [...target.slice(0, index), card, ...target.slice(index)];
      return { ...current, columns: next };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const current = drag;
    setDrag(null);
    if (!current || !over) return;
    const taskId = String(active.id);
    const to = findColumn(current.columns, String(over.id));
    if (!to) return;
    let list = current.columns[to] ?? [];
    const oldIndex = list.findIndex((t) => t.id === taskId);
    const overIndex = String(over.id).startsWith(COLUMN_PREFIX)
      ? list.length - 1
      : list.findIndex((t) => t.id === over.id);
    if (oldIndex >= 0 && overIndex >= 0 && oldIndex !== overIndex) {
      list = arrayMove(list, oldIndex, overIndex);
    }
    const index = list.findIndex((t) => t.id === taskId);
    const task = list[index];
    if (!task) return;
    const after = list[index - 1] ?? null;
    const before = list[index + 1] ?? null;

    // Nothing changed? Then nothing to save.
    const from = findColumn(saved, taskId);
    const original = saved[from ?? ""] ?? [];
    const originalIndex = original.findIndex((t) => t.id === taskId);
    if (
      from === to &&
      original[originalIndex - 1]?.id === after?.id &&
      original[originalIndex + 1]?.id === before?.id
    ) {
      return;
    }

    const status = statuses.data?.find((s) => s.id === to);
    const position =
      positionBetween(after?.position ?? null, before?.position ?? null) ?? task.position;
    const snapshot = queryClient.getQueryData<BoardColumn[]>(boardKey);
    const moved: TaskSummary = {
      ...task,
      position,
      ...(status
        ? {
            status: {
              id: status.id,
              name: status.name,
              color: status.color,
              category: status.category,
            },
          }
        : {}),
    };
    queryClient.setQueryData<BoardColumn[]>(boardKey, (old) =>
      old?.map((column) => {
        if (column.statusId === to) {
          return {
            ...column,
            total: column.total + (from === to ? 0 : 1),
            tasks: list.map((t) => (t.id === taskId ? moved : t)),
          };
        }
        if (column.statusId === from) {
          return {
            ...column,
            total: column.total - 1,
            tasks: column.tasks.filter((t) => t.id !== taskId),
          };
        }
        return column;
      }),
    );
    move.mutate(
      {
        taskId,
        statusId: to,
        afterTaskId: after?.id ?? null,
        beforeTaskId: before?.id ?? null,
        version: task.version,
      },
      {
        onSuccess: ({ data, meta }) => {
          queryClient.setQueryData<BoardColumn[]>(boardKey, (old) =>
            old?.map((column) => ({
              ...column,
              tasks: column.tasks.map((t) => (t.id === taskId ? data : t)),
            })),
          );
          if (meta.renumbered || from !== to) refreshTasks(queryClient, orgSlug, project.id);
        },
        onError: (error) => {
          queryClient.setQueryData(boardKey, snapshot);
          setProblem(
            conflictTask(error)
              ? "Someone else changed this task just now. The board shows the latest version."
              : errorMessage(error),
          );
          refreshTasks(queryClient, orgSlug, project.id);
        },
      },
    );
  };

  const loadMore = async (statusId: string, cursor: string) => {
    setLoadingColumn(statusId);
    try {
      const page = await fetchTaskPage(orgSlug, project.id, filters, {
        statusId,
        parentTaskId: "null",
        sort: "position",
        cursor,
        limit: "200",
      });
      queryClient.setQueryData<BoardColumn[]>(boardKey, (old) =>
        old?.map((column) =>
          column.statusId === statusId
            ? {
                ...column,
                tasks: [
                  ...column.tasks,
                  ...page.items.filter((t) => !column.tasks.some((c) => c.id === t.id)),
                ],
                nextCursor: page.nextCursor,
              }
            : column,
        ),
      );
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setLoadingColumn(null);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 px-4 py-4 sm:px-6">
      <TaskFilterBar
        state={filterState}
        orgSlug={orgSlug}
        workspaceSlug={context.workspace.slug}
        project={project}
        statuses={statuses.data ?? []}
      >
        {project.access.canAdminister && (
          <Button asChild variant="ghost" size="sm">
            <Link to={context.path(`projects/${project.key}/settings`)}>
              <Settings2 /> Columns
            </Link>
          </Button>
        )}
      </TaskFilterBar>
      {problem && <Alert variant="error">{problem}</Alert>}
      {board.isError && <Alert variant="error">The board could not be loaded.</Alert>}
      {board.isPending || statuses.isPending ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-96 w-72 shrink-0" />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDrag(null)}
        >
          <div className="flex flex-1 items-start gap-3 overflow-x-auto pb-2">
            {(statuses.data ?? []).map((status) => (
              <Column
                key={status.id}
                status={status}
                column={board.data?.find((c) => c.statusId === status.id)}
                tasks={columns[status.id] ?? []}
                today={today}
                canEdit={canEdit}
                dragging={!!drag}
                orgSlug={orgSlug}
                projectId={project.id}
                onOpen={openTask}
                loadingMore={loadingColumn === status.id}
                onLoadMore={() => {
                  const cursor = board.data?.find((c) => c.statusId === status.id)?.nextCursor;
                  if (cursor) void loadMore(status.id, cursor);
                }}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask && (
              <div
                className={cn(
                  cardClass,
                  PRIORITY_BAR[activeTask.priority],
                  "w-68 rotate-2 shadow-lg",
                )}
              >
                <TaskCardBody task={activeTask} today={today} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
