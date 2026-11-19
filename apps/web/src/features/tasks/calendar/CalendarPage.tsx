import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { addDays, addMonths, monthGrid, weekDays, type TaskSummary } from "@nexusflow/shared";
import { ChevronLeft, ChevronRight, Diamond, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { errorMessage } from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { useProjectOutlet } from "../../../pages/ProjectLayout";
import { useMilestones, useStatuses } from "../../projects/hooks";
import { conflictTask, useCalendarTasks, useUpdateTask } from "../hooks";
import { NewTaskDialog } from "../NewTaskDialog";
import { PRIORITY_BAR } from "../taskBits";
import { TaskFilterBar } from "../TaskFilterBar";
import { useOpenTask } from "../TaskPanel";
import { useTaskFilters } from "../useTaskFilters";
import { useToday } from "../taskBits";

// The Calendar view (PRD §11.7.3): tasks on their due dates by month or week,
// milestones as diamonds. Drag a task to another day to reschedule it, drag it
// to "No date" to unschedule it, or click an empty spot on a day to add a task.

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const UNSCHEDULED = "unscheduled";

function Chip({
  task,
  disabled,
  onOpen,
}: {
  task: TaskSummary;
  disabled: boolean;
  onOpen: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(task.key);
      }}
      title={`${task.key} ${task.title}`}
      className={cn(
        "block w-full truncate rounded-[5px] border border-l-4 bg-card px-1.5 py-0.5 text-left text-xs shadow-sm",
        PRIORITY_BAR[task.priority],
        task.status.category === "DONE" && "text-muted-foreground line-through",
        isDragging && "z-20 opacity-70 shadow-lg",
      )}
    >
      <span className="font-medium text-muted-foreground">{task.key}</span> {task.title}
    </button>
  );
}

function Day({
  date,
  dimmed,
  isToday,
  tasks,
  milestones,
  limit,
  canEdit,
  onOpen,
  onCreate,
  onMore,
}: {
  date: string;
  dimmed: boolean;
  isToday: boolean;
  tasks: TaskSummary[];
  milestones: { id: string; name: string }[];
  limit: number;
  canEdit: boolean;
  onOpen: (key: string) => void;
  onCreate: (date: string) => void;
  onMore: (date: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });
  const shown = tasks.slice(0, limit);
  const label = new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-label={`${label}, ${tasks.length} tasks`}
      onClick={() => canEdit && onCreate(date)}
      className={cn(
        "min-h-24 space-y-1 border-b border-r p-1 transition-colors",
        dimmed && "bg-surface/50 text-muted-foreground",
        canEdit && "cursor-cell",
        isOver && "bg-primary/10",
      )}
    >
      <span
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-full text-xs",
          isToday && "bg-primary font-semibold text-primary-foreground",
        )}
      >
        {Number(date.slice(8))}
      </span>
      {milestones.map((milestone) => (
        <p
          key={milestone.id}
          className="flex items-center gap-1 truncate text-xs font-medium text-primary"
        >
          <Diamond className="size-3 shrink-0 fill-current" aria-hidden="true" />
          {milestone.name}
        </p>
      ))}
      {shown.map((task) => (
        <Chip key={task.id} task={task} disabled={!canEdit} onOpen={onOpen} />
      ))}
      {tasks.length > limit && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onMore(date);
          }}
          className="text-xs text-muted-foreground hover:underline"
        >
          +{tasks.length - limit} more
        </button>
      )}
    </div>
  );
}

function Unscheduled({
  tasks,
  canEdit,
  onOpen,
}: {
  tasks: TaskSummary[];
  canEdit: boolean;
  onOpen: (key: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: UNSCHEDULED });
  return (
    <aside
      ref={setNodeRef}
      aria-label="Tasks without a due date"
      className={cn(
        "w-60 shrink-0 space-y-1 overflow-y-auto rounded-card border bg-card p-2",
        isOver && "ring-2 ring-primary/40",
      )}
    >
      <h2 className="px-1 text-sm font-semibold">No date · {tasks.length}</h2>
      <p className="px-1 text-xs text-muted-foreground">Drag a task onto a day to schedule it.</p>
      {tasks.map((task) => (
        <Chip key={task.id} task={task} disabled={!canEdit} onOpen={onOpen} />
      ))}
    </aside>
  );
}

export default function CalendarPage() {
  const { project, context } = useProjectOutlet();
  const orgSlug = context.organization.slug;
  const filterState = useTaskFilters();
  const today = useToday();
  const [mode, setMode] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(today);
  const [showUnscheduled, setShowUnscheduled] = useState(true);
  const [createOn, setCreateOn] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const days = mode === "month" ? monthGrid(anchor) : weekDays(anchor);
  const range = { from: days[0] as string, to: days.at(-1) as string };
  const scheduled = useCalendarTasks(orgSlug, project.id, filterState.filters, range);
  const unscheduled = useCalendarTasks(orgSlug, project.id, filterState.filters, "unscheduled");
  const milestones = useMilestones(orgSlug, project.id);
  const statuses = useStatuses(orgSlug, project.id);
  const update = useUpdateTask(orgSlug, project.id);
  const openTask = useOpenTask();
  const canEdit = project.access.canContribute && project.status !== "ARCHIVED";
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  // Both lists together: a reschedule updates the cache, and the chip moves at once.
  const all = useMemo(() => {
    const byId = new Map<string, TaskSummary>();
    for (const task of [...(unscheduled.data ?? []), ...(scheduled.data ?? [])])
      byId.set(task.id, task);
    return [...byId.values()];
  }, [scheduled.data, unscheduled.data]);
  const byDay = useMemo(() => {
    const map = new Map<string, TaskSummary[]>();
    for (const task of all) {
      if (task.dueDate) map.set(task.dueDate, [...(map.get(task.dueDate) ?? []), task]);
    }
    return map;
  }, [all]);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const task = all.find((t) => t.id === active.id);
    const target = String(over.id);
    const dueDate = target === UNSCHEDULED ? null : target.replace("day:", "");
    if (!task || task.dueDate === dueDate) return;
    setNotice(null);
    update.mutate(
      { taskId: task.id, version: task.version, dueDate },
      {
        onError: (error) =>
          setNotice(
            conflictTask(error)
              ? `Someone else changed ${task.key} just now. The calendar shows their version.`
              : errorMessage(error),
          ),
      },
    );
  };

  const month = anchor.slice(0, 7);
  const title =
    mode === "month"
      ? new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
      : `${new Date(`${range.from}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })} – ${new Date(`${range.to}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
  const step = (direction: 1 | -1) =>
    setAnchor((current) =>
      mode === "month" ? addMonths(current, direction) : addDays(current, 7 * direction),
    );

  return (
    <div className="flex h-full flex-col gap-3 px-4 py-4 sm:px-6">
      <TaskFilterBar
        state={filterState}
        orgSlug={orgSlug}
        workspaceSlug={context.workspace.slug}
        project={project}
        statuses={statuses.data ?? []}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Previous ${mode}`}
          onClick={() => step(-1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Next ${mode}`}
          onClick={() => step(1)}
        >
          <ChevronRight />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAnchor(today)}>
          Today
        </Button>
        <h2 className="text-base font-semibold" aria-live="polite">
          {title}
        </h2>
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Calendar view">
          {(["month", "week"] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={mode === value ? "primary" : "ghost"}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {value === "month" ? "Month" : "Week"}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={showUnscheduled ? "Hide tasks without a date" : "Show tasks without a date"}
            onClick={() => setShowUnscheduled((open) => !open)}
          >
            {showUnscheduled ? <PanelRightClose /> : <PanelRightOpen />}
          </Button>
        </div>
      </div>
      {notice && <Alert variant="error">{notice}</Alert>}
      {(scheduled.isError || unscheduled.isError) && (
        <Alert variant="error">Tasks could not be loaded.</Alert>
      )}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="min-w-0 flex-1 overflow-auto rounded-card border bg-card">
            <div
              role="grid"
              aria-label={title}
              className="grid min-w-[640px] grid-cols-7 border-l border-t"
            >
              <div role="row" className="contents">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    role="columnheader"
                    className="border-b border-r px-2 py-1.5 text-xs font-semibold text-muted-foreground"
                  >
                    {day}
                  </div>
                ))}
              </div>
              <div role="row" className="contents">
                {days.map((date) => (
                  <Day
                    key={date}
                    date={date}
                    dimmed={mode === "month" && date.slice(0, 7) !== month}
                    isToday={date === today}
                    tasks={byDay.get(date) ?? []}
                    milestones={(milestones.data ?? []).filter((m) => m.dueDate === date)}
                    limit={mode === "month" ? 3 : 50}
                    canEdit={canEdit}
                    onOpen={openTask}
                    onCreate={setCreateOn}
                    onMore={(day) => {
                      setAnchor(day);
                      setMode("week");
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          {showUnscheduled && (
            <Unscheduled
              tasks={all.filter((task) => !task.dueDate)}
              canEdit={canEdit}
              onOpen={openTask}
            />
          )}
        </div>
      </DndContext>
      {canEdit && (
        <NewTaskDialog
          orgSlug={orgSlug}
          project={project}
          statuses={statuses.data ?? []}
          open={createOn !== null}
          onOpenChange={(open) => !open && setCreateOn(null)}
          defaults={createOn ? { dueDate: createOn } : {}}
        />
      )}
    </div>
  );
}
