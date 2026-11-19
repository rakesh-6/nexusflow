import {
  isOverdue,
  todayIn,
  type LabelSummary,
  type PersonSummary,
  type Priority,
  type StatusCategory,
} from "@nexusflow/shared";
import { Link2 } from "lucide-react";
import { UserAvatar } from "../../components/common/UserAvatar";
import { cn } from "../../lib/utils";
import { useCurrentUser } from "../auth/hooks";
import { PRIORITY_LABELS } from "../projects/labels";

// Small pieces every task view shows: priority, due date, labels, people.

const PRIORITY_ICONS: Record<Priority, { glyph: string; className: string }> = {
  LOW: { glyph: "▽", className: "text-priority-low" },
  MEDIUM: { glyph: "—", className: "text-priority-medium" },
  HIGH: { glyph: "△", className: "text-priority-high" },
  URGENT: { glyph: "‼", className: "text-priority-urgent" },
};

/** ▽ — △ ‼ in grey, blue, orange, red (PRD §11.6.3). */
export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const icon = PRIORITY_ICONS[priority];
  return (
    <span
      role="img"
      aria-label={`${PRIORITY_LABELS[priority]} priority`}
      title={`${PRIORITY_LABELS[priority]} priority`}
      className={cn(
        "inline-block w-4 text-center text-sm font-bold leading-none",
        icon.className,
        className,
      )}
    >
      {icon.glyph}
    </span>
  );
}

export const PRIORITY_BAR: Record<Priority, string> = {
  LOW: "border-l-priority-low",
  MEDIUM: "border-l-priority-medium",
  HIGH: "border-l-priority-high",
  URGENT: "border-l-priority-urgent",
};

/** "2026-11-18" -> "18 Nov" (or "18 Nov 2027" in another year). Date-only, so no time zone shift. */
export function formatDay(date: string, today?: string) {
  const sameYear = today ? today.slice(0, 4) === date.slice(0, 4) : true;
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

/** Today in the signed-in person's time zone (their profile setting). */
export function useToday() {
  const { data: user } = useCurrentUser();
  return todayIn(user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
}

/** Red when overdue, amber when due today (PRD §11.7.1). */
export function DueDate({
  dueDate,
  category,
  today,
  className,
}: {
  dueDate: string;
  category: StatusCategory;
  today: string;
  className?: string;
}) {
  const overdue = isOverdue(dueDate, category, today);
  const dueToday = dueDate === today && category !== "DONE";
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        overdue
          ? "font-medium text-destructive"
          : dueToday
            ? "font-medium text-warning"
            : "text-muted-foreground",
        className,
      )}
    >
      {overdue ? "Overdue · " : dueToday ? "Today · " : ""}
      {formatDay(dueDate, today)}
    </span>
  );
}

export function LabelChip({ label }: { label: LabelSummary }) {
  return (
    <span className="inline-flex max-w-32 items-center gap-1 rounded-full border bg-surface px-1.5 py-0.5 text-[11px] font-medium">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: label.color }}
        aria-hidden="true"
      />
      <span className="truncate">{label.name}</span>
    </span>
  );
}

/** Up to `max` labels, then "+2". */
export function LabelChips({ labels, max = 3 }: { labels: LabelSummary[]; max?: number }) {
  if (labels.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {labels.slice(0, max).map((label) => (
        <LabelChip key={label.id} label={label} />
      ))}
      {labels.length > max && (
        <span className="text-[11px] text-muted-foreground">+{labels.length - max}</span>
      )}
    </span>
  );
}

/** Overlapping avatars, up to `max`, then "+2" (PRD §11.7.1). */
export function AssigneeStack({ people, max = 3 }: { people: PersonSummary[]; max?: number }) {
  if (people.length === 0) return null;
  const names = people.map((person) => person.name).join(", ");
  return (
    <span className="flex items-center" title={names} aria-label={`Assigned to ${names}`}>
      {people.slice(0, max).map((person) => (
        <UserAvatar
          key={person.id}
          name={person.name}
          avatarUrl={person.avatarUrl}
          className="-ml-1.5 size-6 ring-2 ring-card first:ml-0"
        />
      ))}
      {people.length > max && (
        <span className="ml-1 text-xs text-muted-foreground">+{people.length - max}</span>
      )}
    </span>
  );
}

export function BlockedIcon({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Link2
      className="size-3.5 text-destructive"
      aria-label={`Waiting for ${count} other ${count === 1 ? "task" : "tasks"}`}
    />
  );
}

/** A colored dot for a column (task status). */
export function StatusDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}

export const selectClass = "h-8 rounded-control border bg-card px-2 text-sm disabled:opacity-50";
