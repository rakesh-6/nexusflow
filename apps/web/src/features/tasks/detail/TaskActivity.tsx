import type { ActivityEntry, FieldChange } from "@nexusflow/shared";
import { Skeleton } from "../../../components/ui/skeleton";
import { formatDateTime } from "../../organizations/labels";
import { PRIORITY_LABELS } from "../../projects/labels";
import { useTaskActivity } from "../hooks";
import { formatDay } from "../taskBits";

// The task's history (PRD §11.6.7): who changed what, newest first.

const FIELD_LABELS: Record<string, string> = {
  title: "title",
  status: "status",
  priority: "priority",
  startDate: "start date",
  dueDate: "due date",
  estimatedHours: "estimate",
  actualHours: "actual hours",
  milestone: "milestone",
  assignees: "assignees",
  labels: "labels",
  parentTaskId: "parent task",
};

function show(field: string, value: unknown): string {
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
    return "none";
  }
  if (Array.isArray(value)) return value.join(", ");
  if (field === "priority" && typeof value === "string") {
    return PRIORITY_LABELS[value as keyof typeof PRIORITY_LABELS] ?? value;
  }
  if ((field === "dueDate" || field === "startDate") && typeof value === "string") {
    return formatDay(value);
  }
  if (field === "parentTaskId") return "another task";
  return String(value);
}

function describe(entry: ActivityEntry): string[] {
  const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
  switch (entry.action) {
    case "task.created":
      return [
        metadata["duplicatedFrom"]
          ? `created this task as a copy of ${String(metadata["duplicatedFrom"])}`
          : "created this task",
      ];
    case "task.deleted":
      return ["moved this task to the trash"];
    case "task.restored":
      return ["restored this task from the trash"];
    case "task.dependency_added":
      return [`linked ${String(metadata["blocking"])} → blocks → ${String(metadata["blocked"])}`];
    case "task.dependency_removed":
      return [`removed the link ${String(metadata["blocking"])} → ${String(metadata["blocked"])}`];
    case "task.updated": {
      const changes = (entry.changes ?? []) as FieldChange[];
      return changes.map((change) =>
        change.field === "description"
          ? "changed the description"
          : change.from === null && metadata["bulk"]
            ? `set ${FIELD_LABELS[change.field] ?? change.field} to ${show(change.field, change.to)}`
            : `changed ${FIELD_LABELS[change.field] ?? change.field} from ${show(change.field, change.from)} to ${show(change.field, change.to)}`,
      );
    }
    default:
      return [entry.action];
  }
}

export function TaskActivity({ orgSlug, taskId }: { orgSlug: string; taskId: string }) {
  const activity = useTaskActivity(orgSlug, taskId);
  if (activity.isPending) return <Skeleton className="h-20" />;
  if (activity.isError)
    return <p className="text-sm text-muted-foreground">History could not be loaded.</p>;
  return (
    <ol className="space-y-2">
      {activity.data.map((entry) => (
        <li key={entry.id} className="text-sm">
          {describe(entry).map((line, index) => (
            <p key={index}>
              <span className="font-medium">{entry.actorName}</span> {line}
            </p>
          ))}
          <p className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}
