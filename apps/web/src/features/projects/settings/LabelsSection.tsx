import { Tag, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { EmptyState } from "../../../components/common/EmptyState";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Skeleton } from "../../../components/ui/skeleton";
import type { WorkspaceContext } from "../../../hooks/useWorkspace";
import { errorMessage } from "../../../lib/api";
import { useChangeLabels, useLabels } from "../hooks";
import { COLOR_CHOICES, ColorSwatch } from "../labels";

const smallSelect = "h-8 rounded-control border bg-card px-2 text-sm";

/** Workspace labels such as "Bug" (PRD §12.3): admins and project managers edit them. */
export function LabelsSection({ context }: { context: WorkspaceContext }) {
  const { organization, workspace } = context;
  const { data, isPending } = useLabels(organization.slug, workspace.slug);
  const change = useChangeLabels(organization.slug, workspace.slug);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_CHOICES[5] ?? "#DC2626");
  const id = useId();

  if (isPending || !data) return <Skeleton className="h-16" />;
  const { labels, canManage } = data;

  return (
    <div className="space-y-4">
      {change.error && <Alert variant="error">{errorMessage(change.error)}</Alert>}
      {labels.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No labels yet"
          description="Labels like “Bug” or “Design” tag tasks in every project here."
        />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {labels.map((label) => (
            <li
              key={label.id}
              className="flex items-center gap-1.5 rounded-full border bg-surface py-1 pl-2.5 pr-1 text-sm"
            >
              <ColorSwatch color={label.color} className="rounded-full" />
              {label.name}
              {canManage && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-6"
                  aria-label={`Delete label ${label.name}`}
                  disabled={change.isPending}
                  onClick={() => change.mutate({ kind: "delete", labelId: label.id })}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            change.mutate(
              { kind: "create", name: name.trim(), color },
              { onSuccess: () => setName("") },
            );
          }}
        >
          <div className="min-w-40 flex-1 space-y-1.5">
            <label htmlFor={id} className="block text-sm font-medium">
              New label
            </label>
            <Input
              id={id}
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bug"
            />
          </div>
          <span className="flex items-center gap-1.5">
            <ColorSwatch color={color} className="rounded-full" />
            <select
              aria-label="Label color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className={smallSelect}
            >
              {COLOR_CHOICES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </span>
          <Button type="submit" size="sm" disabled={change.isPending || !name.trim()}>
            Add
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">
          Workspace admins and project managers manage labels.
        </p>
      )}
    </div>
  );
}
