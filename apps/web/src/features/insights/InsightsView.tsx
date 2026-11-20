import {
  addDays,
  type Analytics,
  type ProjectHealth,
  type StatusCategory,
} from "@nexusflow/shared";
import { Link } from "react-router";
import { UserAvatar } from "../../components/common/UserAvatar";
import { Alert } from "../../components/ui/alert";
import { Skeleton } from "../../components/ui/skeleton";
import type { WorkspaceContext } from "../../hooks/useWorkspace";
import { isPlanLimit } from "../../lib/api";
import { cn } from "../../lib/utils";
import { formatDateTime } from "../organizations/labels";
import { CATEGORY_LABELS, PRIORITY_LABELS } from "../projects/labels";
import { formatDay, PriorityIcon, useToday } from "../tasks/taskBits";
import { useAnalytics } from "./hooks";

// The numbers behind the Insights page and a project's Overview tab
// (PRD §11.12). Charts are simple bars drawn with plain HTML and SVG, so
// the page needs no charting library and stays small.

const CATEGORY_COLORS: Record<StatusCategory, string> = {
  BACKLOG: "bg-status-backlog",
  TODO: "bg-status-todo",
  IN_PROGRESS: "bg-status-in-progress",
  IN_REVIEW: "bg-status-in-review",
  BLOCKED: "bg-status-blocked",
  DONE: "bg-status-done",
};

const HEALTH: Record<ProjectHealth, { label: string; className: string }> = {
  ON_TRACK: { label: "On track", className: "bg-success/15 text-success" },
  AT_RISK: { label: "At risk", className: "bg-warning/15 text-warning" },
  OFF_TRACK: { label: "Off track", className: "bg-destructive/15 text-destructive" },
  NOT_SCHEDULED: { label: "No dates", className: "bg-surface text-muted-foreground" },
};

function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-card border bg-card p-4 shadow-sm", className)}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Tile({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-card border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

/** Completed (and created) tasks per day, week or month, as bars. */
function Trend({ data }: { data: Analytics["trend"] }) {
  const max = Math.max(1, ...data.map((point) => Math.max(point.completed, point.created)));
  const width = 100 / Math.max(data.length, 1);
  const label = `Tasks completed per period: ${data.map((p) => `${p.date} ${p.completed}`).join(", ")}`;
  return (
    <div>
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="h-40 w-full"
        role="img"
        aria-label={label}
      >
        {data.map((point, index) => (
          <g key={point.date}>
            <rect
              x={index * width + width * 0.15}
              width={width * 0.32}
              y={40 - (point.created / max) * 38}
              height={(point.created / max) * 38}
              className="fill-status-backlog/60"
            >
              <title>{`${formatDay(point.date)}: ${point.created} created`}</title>
            </rect>
            <rect
              x={index * width + width * 0.5}
              width={width * 0.32}
              y={40 - (point.completed / max) * 38}
              height={(point.completed / max) * 38}
              className="fill-primary"
            >
              <title>{`${formatDay(point.date)}: ${point.completed} completed`}</title>
            </rect>
          </g>
        ))}
      </svg>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{data[0] && formatDay(data[0].date)}</span>
        <span className="flex gap-3">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-sm bg-primary" /> Completed
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-sm bg-status-backlog/60" /> Created
          </span>
        </span>
        <span>{data.at(-1) && formatDay(data.at(-1)?.date ?? "")}</span>
      </div>
    </div>
  );
}

function Bars({
  rows,
}: {
  rows: { label: React.ReactNode; count: number; color: string; key: string }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2 text-sm">
          <span className="truncate">{row.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface">
            <span
              className={cn("block h-full rounded-full", row.color)}
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </span>
          <span className="text-right tabular-nums text-muted-foreground">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

export function InsightsView({
  context,
  range,
  projectId,
}: {
  context: WorkspaceContext;
  range: number;
  projectId?: string;
}) {
  const today = useToday();
  const analytics = useAnalytics(context.organization.slug, context.workspace.slug, {
    from: addDays(today, -(range - 1)),
    to: today,
    ...(projectId ? { projectId } : {}),
  });

  if (analytics.isError) {
    return isPlanLimit(analytics.error) ? (
      <Alert variant="info">
        The Free plan shows the last 30 days.{" "}
        <Link to="/pricing" className="underline">
          See the plans
        </Link>{" "}
        for longer history.
      </Alert>
    ) : (
      <Alert variant="error">The numbers could not be loaded.</Alert>
    );
  }
  if (!analytics.data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
        <Skeleton className="h-56 sm:col-span-2 lg:col-span-4" />
      </div>
    );
  }
  const data = analytics.data;
  const { tiles } = data;
  const taskPath = (key: string) => context.path(`tasks/${key}`);

  return (
    <div className={cn("space-y-4", analytics.isFetching && "opacity-70")}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!projectId && <Tile label="Projects" value={tiles.totalProjects} />}
        <Tile label="Open tasks" value={tiles.pendingTasks} />
        <Tile
          label="Overdue"
          value={tiles.overdueTasks}
          tone={tiles.overdueTasks ? "text-destructive" : undefined}
        />
        <Tile
          label={`Completed in ${range} days`}
          value={tiles.completedInRange}
          tone="text-success"
        />
        {projectId && (
          <Tile
            label="Done overall"
            value={`${tiles.totalTasks ? Math.round((tiles.completedTasks / tiles.totalTasks) * 100) : 0}%`}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Completed and created" className="lg:col-span-2">
          <Trend data={data.trend} />
        </Card>
        <Card title="Tasks by status">
          <Bars
            rows={data.byCategory.map((row) => ({
              key: row.category,
              label: CATEGORY_LABELS[row.category],
              count: row.count,
              color: CATEGORY_COLORS[row.category],
            }))}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {!projectId && (
          <Card title="Projects" className="lg:col-span-2">
            {data.projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Project</th>
                    <th className="pb-2 font-medium">Progress</th>
                    <th className="pb-2 text-right font-medium">Overdue</th>
                    <th className="pb-2 text-right font-medium">Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.projects.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2">
                        <Link
                          to={context.path(`projects/${row.key}/overview`)}
                          className="hover:underline"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="py-2">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface">
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{ width: `${row.progress}%` }}
                            />
                          </span>
                          <span className="tabular-nums text-xs text-muted-foreground">
                            {row.progress}% · {row.done}/{row.total}
                          </span>
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{row.overdue}</td>
                      <td className="py-2 text-right">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            HEALTH[row.health].className,
                          )}
                        >
                          {HEALTH[row.health].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
        <Card title="Open tasks by priority" className={projectId ? "lg:col-span-1" : undefined}>
          <Bars
            rows={data.byPriority.map((row) => ({
              key: row.priority,
              label: (
                <span className="flex items-center gap-1">
                  <PriorityIcon priority={row.priority} /> {PRIORITY_LABELS[row.priority]}
                </span>
              ),
              count: row.count,
              color: "bg-primary",
            }))}
          />
        </Card>
        {projectId && data.projects[0] && (
          <Card title="Health">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-sm font-medium",
                HEALTH[data.projects[0].health].className,
              )}
            >
              {HEALTH[data.projects[0].health].label}
            </span>
            <p className="mt-3 text-sm text-muted-foreground">
              {data.projects[0].progress}% done, {data.projects[0].overdue} of{" "}
              {data.projects[0].open} open tasks overdue. Health compares the time used with the
              work done (PRD §11.12.3).
            </p>
          </Card>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Workload (open tasks)">
          {data.workload.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has open tasks.</p>
          ) : (
            <ul className="space-y-2">
              {data.workload.map((person) => (
                <li key={person.id} className="flex items-center gap-2 text-sm">
                  <UserAvatar name={person.name} avatarUrl={person.avatarUrl} className="size-6" />
                  <span className="min-w-0 flex-1 truncate">{person.name}</span>
                  <span
                    className="tabular-nums text-muted-foreground"
                    title="Open tasks · estimated hours"
                  >
                    {person.openTasks} · {person.estimatedHours} h
                  </span>
                  <span
                    className={cn(
                      "w-12 text-right text-xs tabular-nums",
                      person.utilization > 1 && "font-semibold text-destructive",
                    )}
                    title="Estimated hours due in 7 days ÷ 40 h"
                  >
                    {Math.round(person.utilization * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Due in the next 7 days">
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing due soon.</p>
          ) : (
            <ul className="space-y-2">
              {data.upcoming.map((task) => (
                <li key={task.id} className="flex items-center gap-2 text-sm">
                  <PriorityIcon priority={task.priority} />
                  <Link to={taskPath(task.key)} className="min-w-0 flex-1 truncate hover:underline">
                    <span className="mr-1 text-xs text-muted-foreground">{task.key}</span>
                    {task.title}
                  </Link>
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      task.dueDate === today ? "text-warning" : "text-muted-foreground",
                    )}
                  >
                    {formatDay(task.dueDate, today)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`You, last ${range} days`}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Tasks completed</dt>
              <dd className="text-lg font-semibold tabular-nums">{data.mine.completed}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Hours logged</dt>
              <dd className="text-lg font-semibold tabular-nums">{data.mine.actualHours}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">On time</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {data.mine.onTimeRate === null ? "—" : `${Math.round(data.mine.onTimeRate * 100)}%`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Days from start to done</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {data.mine.avgCycleDays ?? "—"}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card title="Recent activity">
        {data.activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {data.activity.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{entry.actorName}</span>
                <span>{entry.action.replace(/^\w+\./, "").replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">
                  {String(
                    (entry.metadata as { key?: string; name?: string } | null)?.key ??
                      (entry.metadata as { name?: string } | null)?.name ??
                      "",
                  )}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDateTime(entry.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
