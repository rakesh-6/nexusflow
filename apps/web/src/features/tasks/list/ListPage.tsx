import { PRIORITIES, type Priority, type TaskSort, type TaskSummary } from "@nexusflow/shared";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, Columns3, ListTodo, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { EmptyState } from "../../../components/common/EmptyState";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Skeleton } from "../../../components/ui/skeleton";
import { errorMessage } from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { useProjectOutlet } from "../../../pages/ProjectLayout";
import { useLabels, useStatuses } from "../../projects/hooks";
import { PRIORITY_LABELS } from "../../projects/labels";
import {
  conflictTask,
  useAssignable,
  useBulkTasks,
  useTaskList,
  useUpdateTask,
  type TaskChange,
} from "../hooks";
import { LabelPicker, PeoplePicker } from "../pickers";
import {
  AssigneeStack,
  DueDate,
  LabelChips,
  PriorityIcon,
  selectClass,
  useToday,
} from "../taskBits";
import { TaskFilterBar } from "../TaskFilterBar";
import { useOpenTask } from "../TaskPanel";
import { useTaskFilters } from "../useTaskFilters";

// The List view (PRD §11.7.2): a table of every task with inline editing,
// sorting (Shift+click a header to sort by several columns), column choices
// remembered per project, a bulk-action bar and smooth scrolling for
// thousands of rows (only the visible rows are drawn).

const SORT_FIELDS: Record<string, string> = {
  key: "number",
  title: "title",
  status: "position",
  priority: "priority",
  dueDate: "dueDate",
  estimate: "estimatedHours",
  updated: "updatedAt",
};

const COLUMN_NAMES: Record<string, string> = {
  status: "Status",
  priority: "Priority",
  assignees: "Assignees",
  dueDate: "Due date",
  labels: "Labels",
  estimate: "Estimate",
  updated: "Updated",
};

const ROW_HEIGHT = 44;

function readColumns(projectId: string): VisibilityState {
  try {
    return JSON.parse(
      localStorage.getItem(`nf-list-columns-${projectId}`) ?? "{}",
    ) as VisibilityState;
  } catch {
    return {};
  }
}

export default function ListPage() {
  const { project, context } = useProjectOutlet();
  const orgSlug = context.organization.slug;
  const filterState = useTaskFilters();
  const [sorting, setSorting] = useState<SortingState>([]);
  const sort = sorting.map(
    (entry) => `${entry.desc ? "-" : ""}${SORT_FIELDS[entry.id] ?? "position"}` as TaskSort,
  );
  const list = useTaskList(orgSlug, project.id, {
    ...filterState.filters,
    ...(sort.length ? { sort } : {}),
  });
  const statuses = useStatuses(orgSlug, project.id);
  const { data: people = [] } = useAssignable(orgSlug, project.id);
  const { data: labelData } = useLabels(orgSlug, context.workspace.slug);
  const update = useUpdateTask(orgSlug, project.id);
  const bulk = useBulkTasks(orgSlug, project.id);
  const openTask = useOpenTask();
  const today = useToday();
  const [notice, setNotice] = useState<string | null>(null);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [visibility, setVisibility] = useState<VisibilityState>(() => readColumns(project.id));
  const canEdit = project.access.canContribute && project.status !== "ARCHIVED";

  useEffect(() => {
    try {
      localStorage.setItem(`nf-list-columns-${project.id}`, JSON.stringify(visibility));
    } catch {
      // Storage can be blocked (private windows); the choice then lasts for this visit only.
    }
  }, [project.id, visibility]);

  const save = useRef<(task: TaskSummary, change: Omit<TaskChange, "version">) => void>(() => {});
  save.current = (task, change) => {
    setNotice(null);
    update.mutate(
      { taskId: task.id, version: task.version, ...change },
      {
        onError: (error) =>
          setNotice(
            conflictTask(error)
              ? `Someone else changed ${task.key} just now. The list shows their version.`
              : errorMessage(error),
          ),
      },
    );
  };

  const rows = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const columns = useMemo<ColumnDef<TaskSummary>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        enableHiding: false,
        size: 40,
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Select all loaded tasks"
            className="size-4 accent-primary"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            disabled={!canEdit}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Select ${row.original.key}`}
            className="size-4 accent-primary"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            disabled={!canEdit}
          />
        ),
      },
      {
        id: "key",
        header: "Key",
        enableHiding: false,
        size: 90,
        cell: ({ row }) => (
          <button
            type="button"
            className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => openTask(row.original.key)}
          >
            {row.original.key}
          </button>
        ),
      },
      {
        id: "title",
        header: "Title",
        enableHiding: false,
        size: 360,
        cell: ({ row }) => (
          <input
            key={`${row.original.id}-${row.original.version}`}
            aria-label={`Title of ${row.original.key}`}
            defaultValue={row.original.title}
            readOnly={!canEdit}
            maxLength={200}
            className="h-8 w-full truncate rounded-control border border-transparent bg-transparent px-1.5 text-sm hover:border-border focus-visible:border-ring read-only:hover:border-transparent"
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") event.currentTarget.value = row.original.title;
            }}
            onBlur={(event) => {
              const title = event.target.value.trim();
              if (title && title !== row.original.title) save.current(row.original, { title });
              else event.target.value = row.original.title;
            }}
          />
        ),
      },
      {
        id: "status",
        header: "Status",
        size: 150,
        cell: ({ row }) => (
          <select
            aria-label={`Status of ${row.original.key}`}
            className={cn(selectClass, "w-full")}
            value={row.original.status.id}
            disabled={!canEdit}
            onChange={(event) => save.current(row.original, { statusId: event.target.value })}
          >
            {(statuses.data ?? [row.original.status]).map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
        ),
      },
      {
        id: "priority",
        header: "Priority",
        size: 130,
        cell: ({ row }) => (
          <span className="flex items-center gap-1">
            <PriorityIcon priority={row.original.priority} />
            <select
              aria-label={`Priority of ${row.original.key}`}
              className={cn(selectClass, "w-full")}
              value={row.original.priority}
              disabled={!canEdit}
              onChange={(event) =>
                save.current(row.original, { priority: event.target.value as Priority })
              }
            >
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
                </option>
              ))}
            </select>
          </span>
        ),
      },
      {
        id: "assignees",
        header: "Assignees",
        enableSorting: false,
        size: 150,
        cell: ({ row }) => (
          <PeoplePicker
            label={`Assignees of ${row.original.key}`}
            people={people}
            selected={row.original.assignees}
            disabled={!canEdit}
            onChange={(assigneeIds) => save.current(row.original, { assigneeIds })}
            trigger={
              row.original.assignees.length ? (
                <AssigneeStack people={row.original.assignees} />
              ) : (
                <span className="text-xs text-muted-foreground">Nobody</span>
              )
            }
          />
        ),
      },
      {
        id: "dueDate",
        header: "Due date",
        size: 160,
        cell: ({ row }) =>
          canEdit ? (
            <Input
              key={`${row.original.id}-${row.original.version}`}
              type="date"
              aria-label={`Due date of ${row.original.key}`}
              className={cn(
                "h-8 px-1.5",
                row.original.dueDate &&
                  row.original.dueDate < today &&
                  row.original.status.category !== "DONE" &&
                  "text-destructive",
              )}
              defaultValue={row.original.dueDate ?? ""}
              onChange={(event) =>
                save.current(row.original, { dueDate: event.target.value || null })
              }
            />
          ) : row.original.dueDate ? (
            <DueDate
              dueDate={row.original.dueDate}
              category={row.original.status.category}
              today={today}
            />
          ) : null,
      },
      {
        id: "labels",
        header: "Labels",
        enableSorting: false,
        size: 180,
        cell: ({ row }) => (
          <LabelPicker
            labels={labelData?.labels ?? []}
            selected={row.original.labels}
            disabled={!canEdit}
            onChange={(labelIds) => save.current(row.original, { labelIds })}
            trigger={
              row.original.labels.length ? (
                <LabelChips labels={row.original.labels} max={2} />
              ) : (
                <span className="text-xs text-muted-foreground">None</span>
              )
            }
          />
        ),
      },
      {
        id: "estimate",
        header: "Estimate",
        size: 90,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {row.original.estimatedHours !== null ? `${row.original.estimatedHours} h` : ""}
          </span>
        ),
      },
      {
        id: "updated",
        header: "Updated",
        size: 110,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.updatedAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
            })}
          </span>
        ),
      },
    ],
    [canEdit, labelData, openTask, people, statuses.data, today],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (task) => task.id,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableMultiSort: true,
    isMultiSortEvent: (event) => (event as MouseEvent).shiftKey,
    state: { sorting, rowSelection: selection, columnVisibility: visibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    onColumnVisibilityChange: setVisibility,
    enableRowSelection: canEdit,
  });

  const scroller = useRef<HTMLDivElement>(null);
  const tableRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    // A first guess of the visible area, so rows show before the real size is measured.
    initialRect: { width: 1100, height: 640 },
  });
  const items = virtualizer.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? 0;

  // Load the next page shortly before the end is reached.
  useEffect(() => {
    if (lastIndex >= tableRows.length - 20 && list.hasNextPage && !list.isFetchingNextPage) {
      void list.fetchNextPage();
    }
  }, [lastIndex, tableRows.length, list]);

  const selectedIds = Object.keys(selection).filter((id) => selection[id]);
  const runBulk = (input: Parameters<typeof bulk.mutate>[0]) =>
    bulk.mutate(input, {
      onSuccess: () => setSelection({}),
      onError: (error) => setNotice(errorMessage(error)),
    });

  // Arrow keys move between rows, Enter opens, Space selects (PRD §11.7.2).
  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, index: number) => {
    if (event.target !== event.currentTarget) return;
    const task = tableRows[index]?.original;
    if (!task) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = index + (event.key === "ArrowDown" ? 1 : -1);
      if (next < 0 || next >= tableRows.length) return;
      virtualizer.scrollToIndex(next);
      requestAnimationFrame(() =>
        scroller.current?.querySelector<HTMLElement>(`tr[data-index="${next}"]`)?.focus(),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      openTask(task.key);
    } else if (event.key === " " && canEdit) {
      event.preventDefault();
      tableRows[index]?.toggleSelected();
    }
  };

  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);
  const visibleColumns = table.getVisibleLeafColumns().length;

  return (
    <div className="flex h-full flex-col gap-3 px-4 py-4 sm:px-6">
      <TaskFilterBar
        state={filterState}
        orgSlug={orgSlug}
        workspaceSlug={context.workspace.slug}
        project={project}
        statuses={statuses.data ?? []}
      >
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm">
              <Columns3 /> Columns
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52">
            {table
              .getAllLeafColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <label
                  key={column.id}
                  className="flex items-center gap-2 rounded-[5px] px-2 py-1 text-sm hover:bg-surface"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={column.getIsVisible()}
                    onChange={column.getToggleVisibilityHandler()}
                  />
                  {COLUMN_NAMES[column.id] ?? column.id}
                </label>
              ))}
          </PopoverContent>
        </Popover>
      </TaskFilterBar>
      {notice && <Alert variant="error">{notice}</Alert>}
      {list.isError && <Alert variant="error">Tasks could not be loaded.</Alert>}

      {list.isPending ? (
        <Skeleton className="h-96" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title={filterState.active ? "No matching tasks" : "No tasks yet"}
          description={
            filterState.active
              ? "Try another search or filter."
              : "Create a task with “New task” or press C."
          }
        />
      ) : (
        <div ref={scroller} className="min-h-0 flex-1 overflow-auto rounded-card border bg-card">
          <table
            className="w-full min-w-[900px] table-fixed border-collapse text-sm"
            aria-rowcount={rows.length}
          >
            <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--color-border)]">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        style={{ width: header.getSize() }}
                        aria-sort={
                          sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : undefined
                        }
                        className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground"
                      >
                        {header.column.getCanSort() ? (
                          <button
                            type="button"
                            className="flex items-center gap-1 hover:text-foreground"
                            onClick={header.column.getToggleSortingHandler()}
                            title="Click to sort, Shift+click to add to the sort"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === "asc" && <ArrowUp className="size-3" aria-hidden="true" />}
                            {sorted === "desc" && (
                              <ArrowDown className="size-3" aria-hidden="true" />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {paddingTop > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={visibleColumns} style={{ height: paddingTop }} />
                </tr>
              )}
              {items.map((item) => {
                const row = tableRows[item.index];
                if (!row) return null;
                return (
                  <tr
                    key={row.id}
                    data-index={item.index}
                    tabIndex={0}
                    aria-selected={row.getIsSelected()}
                    onKeyDown={(event) => onRowKeyDown(event, item.index)}
                    style={{ height: ROW_HEIGHT }}
                    className={cn(
                      "border-t hover:bg-surface/60 focus-visible:outline-2 focus-visible:-outline-offset-2",
                      row.getIsSelected() && "bg-primary/5",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="truncate px-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {paddingBottom > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={visibleColumns} style={{ height: paddingBottom }} />
                </tr>
              )}
            </tbody>
          </table>
          {list.isFetchingNextPage && (
            <p className="p-3 text-center text-sm text-muted-foreground">Loading more…</p>
          )}
        </div>
      )}

      {selectedIds.length > 0 && (
        <div
          role="toolbar"
          aria-label="Change selected tasks"
          className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-card border bg-card p-2 shadow-xl"
        >
          <span className="px-2 text-sm font-medium">{selectedIds.length} selected</span>
          <select
            aria-label="Set status"
            className={selectClass}
            value=""
            disabled={bulk.isPending}
            onChange={(event) =>
              runBulk({ taskIds: selectedIds, set: { statusId: event.target.value } })
            }
          >
            <option value="">Status…</option>
            {(statuses.data ?? []).map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Set priority"
            className={selectClass}
            value=""
            disabled={bulk.isPending}
            onChange={(event) =>
              runBulk({ taskIds: selectedIds, set: { priority: event.target.value as Priority } })
            }
          >
            <option value="">Priority…</option>
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
          <select
            aria-label="Assign to"
            className={selectClass}
            value=""
            disabled={bulk.isPending}
            onChange={(event) =>
              runBulk({ taskIds: selectedIds, set: { addAssigneeIds: [event.target.value] } })
            }
          >
            <option value="">Assign…</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <Input
            type="date"
            aria-label="Set due date"
            className="h-8 w-40"
            disabled={bulk.isPending}
            onChange={(event) =>
              event.target.value &&
              runBulk({ taskIds: selectedIds, set: { dueDate: event.target.value } })
            }
          />
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={bulk.isPending}
            onClick={() => runBulk({ taskIds: selectedIds, action: "delete" })}
          >
            <Trash2 /> Delete
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            aria-label="Clear selection"
            onClick={() => setSelection({})}
          >
            <X />
          </Button>
        </div>
      )}
    </div>
  );
}
