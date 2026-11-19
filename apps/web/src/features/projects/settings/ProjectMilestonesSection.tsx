import type { ProjectSummary } from "@nexusflow/shared";
import { Flag, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { EmptyState } from "../../../components/common/EmptyState";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Skeleton } from "../../../components/ui/skeleton";
import type { WorkspaceContext } from "../../../hooks/useWorkspace";
import { errorMessage } from "../../../lib/api";
import { formatDate } from "../../organizations/labels";
import { useChangeMilestones, useMilestones } from "../hooks";
import { ProgressBar } from "../labels";

function AddMilestone({
  onAdd,
  busy,
}: {
  onAdd: (name: string, dueDate: string | null) => Promise<unknown>;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const id = useId();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void onAdd(name.trim(), dueDate || null).then(() => {
          setName("");
          setDueDate("");
        });
      }}
    >
      <div className="min-w-40 flex-1 space-y-1.5">
        <label htmlFor={id} className="block text-sm font-medium">
          New milestone
        </label>
        <Input
          id={id}
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          placeholder="Beta launch"
        />
      </div>
      <Input
        type="date"
        aria-label="Due date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="w-40"
      />
      <Button type="submit" size="sm" disabled={busy || !name.trim()}>
        Add
      </Button>
    </form>
  );
}

/** Milestones with progress and overdue warnings (PRD §11.5.4). */
export function ProjectMilestonesSection({
  project,
  context,
}: {
  project: ProjectSummary;
  context: WorkspaceContext;
}) {
  const slug = context.organization.slug;
  const { data: milestones, isPending } = useMilestones(slug, project.id);
  const change = useChangeMilestones(slug, project.id);
  const editable = project.access.canAdminister && project.status !== "ARCHIVED";

  if (isPending || !milestones) return <Skeleton className="h-24" />;
  return (
    <div className="space-y-4">
      {change.error && <Alert variant="error">{errorMessage(change.error)}</Alert>}
      {milestones.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="No milestones"
          description="Checkpoints like “Beta launch” that tasks can be linked to."
        />
      ) : (
        <ul className="divide-y rounded-control border">
          {milestones.map((milestone) => {
            const percent =
              milestone.taskCount === 0
                ? 0
                : Math.round((milestone.doneTaskCount / milestone.taskCount) * 100);
            const completed = milestone.status === "COMPLETED";
            return (
              <li key={milestone.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={completed}
                    disabled={!editable || change.isPending}
                    onChange={() =>
                      change.mutate({
                        kind: "update",
                        milestoneId: milestone.id,
                        status: completed ? "OPEN" : "COMPLETED",
                      })
                    }
                    aria-label={`${milestone.name} completed`}
                  />
                  <span
                    className={
                      completed
                        ? "truncate text-sm line-through text-muted-foreground"
                        : "truncate text-sm font-medium"
                    }
                  >
                    {milestone.name}
                  </span>
                </label>
                <span
                  className={
                    milestone.overdue
                      ? "text-xs font-medium text-destructive"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {milestone.dueDate
                    ? `${milestone.overdue ? "Overdue · " : "Due "}${formatDate(milestone.dueDate)}`
                    : "No date"}
                </span>
                <div className="w-36">
                  <ProgressBar value={percent} label={`${milestone.name} progress`} />
                </div>
                {editable && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${milestone.name}`}
                    disabled={change.isPending}
                    onClick={() => change.mutate({ kind: "delete", milestoneId: milestone.id })}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editable && (
        <AddMilestone
          busy={change.isPending}
          onAdd={(name, dueDate) => change.mutateAsync({ kind: "create", name, dueDate })}
        />
      )}
    </div>
  );
}
