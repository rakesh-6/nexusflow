import { PRIORITIES, type ProjectSummary, type TaskStatusSummary } from "@nexusflow/shared";
import { Filter, Plus, Search, X } from "lucide-react";
import { useCallback, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { cn } from "../../lib/utils";
import { useLabels } from "../projects/hooks";
import { PRIORITY_LABELS } from "../projects/labels";
import { useAssignable } from "./hooks";
import { NewTaskDialog, type NewTaskDefaults } from "./NewTaskDialog";
import { PriorityIcon } from "./taskBits";
import { useShortcut, type TaskFilterState } from "./useTaskFilters";

// The filter bar above the board, list and calendar (PRD §11.7.1): search,
// quick filters, a full filter panel and "New task". Shortcuts: "/" searches,
// "c" creates a task.

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-8 rounded-full border px-3 text-sm transition-colors",
        on ? "border-primary bg-primary/10 font-medium text-primary" : "bg-card hover:bg-surface",
      )}
    >
      {children}
    </button>
  );
}

function CheckRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-[5px] px-2 py-1 text-sm hover:bg-surface">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-4 accent-primary"
      />
      {children}
    </label>
  );
}

const toggleIn = (values: string[], value: string) =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

export function TaskFilterBar({
  state,
  orgSlug,
  workspaceSlug,
  project,
  statuses,
  children,
  newTaskDefaults,
}: {
  state: TaskFilterState;
  orgSlug: string;
  workspaceSlug: string;
  project: ProjectSummary;
  statuses: TaskStatusSummary[];
  /** Extra controls on the right, e.g. the calendar's month switcher. */
  children?: ReactNode;
  newTaskDefaults?: NewTaskDefaults;
}) {
  // The dialog is open while the address has ?newTask=1, so the top bar's "New task" can open it.
  const [params, setParams] = useSearchParams();
  const creating = params.get("newTask") === "1";
  const setCreating = useCallback(
    (open: boolean) =>
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (open) next.set("newTask", "1");
        else next.delete("newTask");
        return next;
      }),
    [setParams],
  );
  const { data: labelData } = useLabels(orgSlug, workspaceSlug);
  const { data: people = [] } = useAssignable(orgSlug, project.id);
  const canCreate = project.access.canContribute && project.status !== "ARCHIVED";
  const openCreate = useCallback(() => setCreating(true), [setCreating]);
  const focusSearch = useCallback(() => document.getElementById("task-search")?.focus(), []);
  useShortcut("c", openCreate, canCreate);
  useShortcut("/", focusSearch);

  const { assignee, priority, label } = state;
  const panelCount =
    priority.length +
    label.length +
    assignee.filter((a) => a !== "me" && a !== "unassigned").length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="task-search"
          type="search"
          aria-label="Search tasks (press / to focus)"
          placeholder="Search tasks or NEX-42"
          value={state.search}
          onChange={(event) => state.setSearch(event.target.value)}
          className="h-8 pl-9"
        />
      </div>
      <Toggle
        on={assignee.includes("me")}
        onClick={() => state.setList("assignee", toggleIn(assignee, "me"))}
      >
        My tasks
      </Toggle>
      <Toggle on={state.overdue} onClick={() => state.setOverdue(!state.overdue)}>
        Overdue
      </Toggle>
      <Toggle
        on={assignee.includes("unassigned")}
        onClick={() => state.setList("assignee", toggleIn(assignee, "unassigned"))}
      >
        Unassigned
      </Toggle>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Filter /> Filters{panelCount > 0 && ` (${panelCount})`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="max-h-[70vh] w-72 overflow-y-auto">
          <p className="px-2 pb-1 text-xs font-semibold uppercase text-muted-foreground">
            Priority
          </p>
          {PRIORITIES.map((value) => (
            <CheckRow
              key={value}
              checked={priority.includes(value)}
              onChange={() => state.setList("priority", toggleIn(priority, value))}
            >
              <PriorityIcon priority={value} /> {PRIORITY_LABELS[value]}
            </CheckRow>
          ))}
          {!!labelData?.labels.length && (
            <>
              <p className="px-2 pb-1 pt-3 text-xs font-semibold uppercase text-muted-foreground">
                Labels
              </p>
              {labelData.labels.map((item) => (
                <CheckRow
                  key={item.id}
                  checked={label.includes(item.id)}
                  onChange={() => state.setList("label", toggleIn(label, item.id))}
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                    aria-hidden="true"
                  />
                  {item.name}
                </CheckRow>
              ))}
            </>
          )}
          {people.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-3 text-xs font-semibold uppercase text-muted-foreground">
                Assignee
              </p>
              {people.map((person) => (
                <CheckRow
                  key={person.id}
                  checked={assignee.includes(person.id)}
                  onChange={() => state.setList("assignee", toggleIn(assignee, person.id))}
                >
                  {person.name}
                </CheckRow>
              ))}
            </>
          )}
        </PopoverContent>
      </Popover>
      {state.active && (
        <Button variant="ghost" size="sm" onClick={state.clear}>
          <X /> Clear
        </Button>
      )}
      <div className="ml-auto flex items-center gap-2">
        {children}
        {canCreate && (
          <Button size="sm" onClick={openCreate} title="New task (C)">
            <Plus /> New task
          </Button>
        )}
      </div>
      {canCreate && (
        <NewTaskDialog
          orgSlug={orgSlug}
          project={project}
          statuses={statuses}
          open={creating}
          onOpenChange={setCreating}
          {...(newTaskDefaults ? { defaults: newTaskDefaults } : {})}
        />
      )}
    </div>
  );
}
