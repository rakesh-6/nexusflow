import { DEFAULT_TASK_STATUSES } from "@nexusflow/shared";

// Small samples of the design tokens, to check both themes at a glance.
const PRIORITIES = [
  { label: "Low", className: "bg-priority-low" },
  { label: "Medium", className: "bg-priority-medium" },
  { label: "High", className: "bg-priority-high" },
  { label: "Urgent", className: "bg-priority-urgent" },
];

// The status colors come from the same list the API seeds projects with.
const STATUS_CLASSES: Record<string, string> = {
  BACKLOG: "bg-status-backlog",
  TODO: "bg-status-todo",
  IN_PROGRESS: "bg-status-in-progress",
  IN_REVIEW: "bg-status-in-review",
  BLOCKED: "bg-status-blocked",
  DONE: "bg-status-done",
};

function Chip({ label, dotClassName }: { label: string; dotClassName: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-surface px-2.5 py-1 text-xs font-medium">
      <span className={`size-2 rounded-full ${dotClassName}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function TokenPreview() {
  return (
    <div className="space-y-4 rounded-card border bg-card p-5 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold">Task statuses</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {DEFAULT_TASK_STATUSES.map((status) => (
            <Chip
              key={status.category}
              label={status.name}
              dotClassName={STATUS_CLASSES[status.category] ?? ""}
            />
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold">Priorities</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRIORITIES.map((priority) => (
            <Chip key={priority.label} label={priority.label} dotClassName={priority.className} />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-control bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary-hover"
        >
          Primary button
        </button>
        <button
          type="button"
          className="rounded-control border bg-card px-4 py-2 text-sm font-medium transition-colors duration-150 hover:bg-surface"
        >
          Secondary button
        </button>
      </div>
    </div>
  );
}
