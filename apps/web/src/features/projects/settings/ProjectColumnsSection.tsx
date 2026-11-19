import {
  STATUS_CATEGORIES,
  type ProjectSummary,
  type StatusCategory,
  type TaskStatusSummary,
} from "@nexusflow/shared";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Skeleton } from "../../../components/ui/skeleton";
import type { WorkspaceContext } from "../../../hooks/useWorkspace";
import { errorMessage } from "../../../lib/api";
import { useChangeStatuses, useStatuses } from "../hooks";
import { CATEGORY_LABELS, COLOR_CHOICES, ColorSwatch } from "../labels";

const smallSelect = "h-8 rounded-control border bg-card px-2 text-sm";

function ColorSelect({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (color: string) => void;
  label: string;
}) {
  const choices = COLOR_CHOICES.includes(value) ? COLOR_CHOICES : [value, ...COLOR_CHOICES];
  return (
    <span className="flex items-center gap-1.5">
      <ColorSwatch color={value} />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={smallSelect}
      >
        {choices.map((color) => (
          <option key={color} value={color}>
            {color}
          </option>
        ))}
      </select>
    </span>
  );
}

function DeleteColumn({
  status,
  others,
  onDelete,
  busy,
}: {
  status: TaskStatusSummary;
  others: TaskStatusSummary[];
  onDelete: (targetStatusId: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(others[0]?.id ?? "");
  if (!open) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${status.name}`}
        disabled={others.length === 0}
        onClick={() => setOpen(true)}
      >
        <Trash2 />
      </Button>
    );
  }
  return (
    <span className="flex w-full flex-wrap items-center gap-2 rounded-control bg-surface p-2 text-sm">
      Move its {status.taskCount} task{status.taskCount === 1 ? "" : "s"} to
      <select
        aria-label="Move tasks to"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className={smallSelect}
      >
        {others.map((other) => (
          <option key={other.id} value={other.id}>
            {other.name}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="destructive"
        disabled={busy || !target}
        onClick={() => onDelete(target)}
      >
        Delete column
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </span>
  );
}

function AddColumn({
  onAdd,
  busy,
}: {
  onAdd: (input: { name: string; color: string; category: StatusCategory }) => Promise<unknown>;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_CHOICES[1] ?? "#2563EB");
  const [category, setCategory] = useState<StatusCategory>("TODO");
  const id = useId();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void onAdd({ name: name.trim(), color, category }).then(() => setName(""));
      }}
    >
      <div className="min-w-40 flex-1 space-y-1.5">
        <label htmlFor={id} className="block text-sm font-medium">
          New column
        </label>
        <Input
          id={id}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          placeholder="QA"
        />
      </div>
      <ColorSelect value={color} onChange={setColor} label="Color of the new column" />
      <select
        aria-label="Category of the new column"
        value={category}
        onChange={(e) => setCategory(e.target.value as StatusCategory)}
        className={smallSelect}
      >
        {STATUS_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={busy || !name.trim()}>
        Add
      </Button>
    </form>
  );
}

/**
 * Board columns (PRD §11.6.2): rename, recolor, reorder, choose the default,
 * add, and delete after moving their tasks. Every column keeps a category, so
 * reports work however columns are named.
 */
export function ProjectColumnsSection({
  project,
  context,
}: {
  project: ProjectSummary;
  context: WorkspaceContext;
}) {
  const slug = context.organization.slug;
  const { data: statuses, isPending } = useStatuses(slug, project.id);
  const change = useChangeStatuses(slug, project.id);
  const editable = project.access.canAdminister && project.status !== "ARCHIVED";
  const busy = change.isPending;

  if (isPending || !statuses) return <Skeleton className="h-40" />;

  const move = (index: number, by: -1 | 1) => {
    const ids = statuses.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    if (!moved) return;
    ids.splice(index + by, 0, moved);
    change.mutate({ kind: "reorder", statusIds: ids });
  };

  return (
    <div className="space-y-4">
      {change.error && <Alert variant="error">{errorMessage(change.error)}</Alert>}
      <ol className="divide-y rounded-control border">
        {statuses.map((status, index) => (
          <li key={status.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            {editable ? (
              <>
                <span className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-5"
                    aria-label={`Move ${status.name} left`}
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-5"
                    aria-label={`Move ${status.name} right`}
                    disabled={busy || index === statuses.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                </span>
                <Input
                  aria-label={`Name of column ${index + 1}`}
                  defaultValue={status.name}
                  maxLength={40}
                  className="h-8 w-40"
                  onBlur={(event) => {
                    const name = event.target.value.trim();
                    if (name && name !== status.name)
                      change.mutate({ kind: "update", statusId: status.id, name });
                  }}
                />
                <ColorSelect
                  value={status.color}
                  label={`Color of ${status.name}`}
                  onChange={(color) =>
                    change.mutate({ kind: "update", statusId: status.id, color })
                  }
                />
                <select
                  aria-label={`Category of ${status.name}`}
                  value={status.category}
                  disabled={busy}
                  onChange={(e) =>
                    change.mutate({
                      kind: "update",
                      statusId: status.id,
                      category: e.target.value as StatusCategory,
                    })
                  }
                  className={smallSelect}
                >
                  {STATUS_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="radio"
                    name={`default-${project.id}`}
                    checked={status.isDefault}
                    disabled={busy}
                    onChange={() =>
                      change.mutate({ kind: "update", statusId: status.id, isDefault: true })
                    }
                  />
                  New tasks start here
                </label>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {status.taskCount} task{status.taskCount === 1 ? "" : "s"}
                </span>
                <DeleteColumn
                  status={status}
                  others={statuses.filter((s) => s.id !== status.id)}
                  busy={busy}
                  onDelete={(targetStatusId) =>
                    change.mutate({ kind: "delete", statusId: status.id, targetStatusId })
                  }
                />
              </>
            ) : (
              <>
                <ColorSwatch color={status.color} />
                <span className="text-sm font-medium">{status.name}</span>
                <span className="text-xs text-muted-foreground">
                  {CATEGORY_LABELS[status.category]}
                </span>
                {status.isDefault && (
                  <span className="text-xs text-muted-foreground">· default</span>
                )}
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {status.taskCount} tasks
                </span>
              </>
            )}
          </li>
        ))}
      </ol>
      {editable && (
        <AddColumn
          busy={busy}
          onAdd={(input) => change.mutateAsync({ kind: "create", ...input })}
        />
      )}
    </div>
  );
}
