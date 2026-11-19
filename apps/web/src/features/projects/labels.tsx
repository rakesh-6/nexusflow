import type {
  Priority,
  ProjectRole,
  ProjectStatus,
  StatusCategory,
  TeamRole,
} from "@nexusflow/shared";
import { cn } from "../../lib/utils";

// Words and colors shown for the API's project codes.

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export const PROJECT_STATUS_DOTS: Record<ProjectStatus, string> = {
  PLANNING: "bg-status-todo",
  ACTIVE: "bg-status-in-progress",
  ON_HOLD: "bg-priority-high",
  COMPLETED: "bg-status-done",
  ARCHIVED: "bg-status-backlog",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

const PRIORITY_DOTS: Record<Priority, string> = {
  LOW: "bg-priority-low",
  MEDIUM: "bg-priority-medium",
  HIGH: "bg-priority-high",
  URGENT: "bg-priority-urgent",
};

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  PROJECT_MANAGER: "Project manager",
  CONTRIBUTOR: "Contributor",
  VIEWER: "Viewer",
};

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = { LEAD: "Lead", MEMBER: "Member" };

export const CATEGORY_LABELS: Record<StatusCategory, string> = {
  BACKLOG: "Backlog",
  TODO: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  BLOCKED: "Blocked",
  DONE: "Done",
};

/** Colors offered for new columns and labels (stored as data, picked by people). */
export const COLOR_CHOICES = [
  "#94A3B8",
  "#2563EB",
  "#4F46E5",
  "#7C3AED",
  "#DB2777",
  "#DC2626",
  "#EA580C",
  "#CA8A04",
  "#16A34A",
  "#0D9488",
];

function Badge({ dot, children }: { dot: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-surface px-2 py-0.5 text-xs font-medium">
      <span className={cn("size-2 rounded-full", dot)} aria-hidden="true" />
      {children}
    </span>
  );
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge dot={PROJECT_STATUS_DOTS[status]}>{PROJECT_STATUS_LABELS[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge dot={PRIORITY_DOTS[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}

/** A progress bar with its percentage, e.g. for project cards (PRD §11.5.5). */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{value}%</span>
    </div>
  );
}

/** A small colored square for a column or label color chosen by people. */
export function ColorSwatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-3 shrink-0 rounded-[4px]", className)}
      style={{ backgroundColor: color }}
    />
  );
}
