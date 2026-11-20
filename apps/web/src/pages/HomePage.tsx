import { CircleCheck, FolderPlus, Target, UserPlus } from "lucide-react";
import { Link } from "react-router";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { StatusCard } from "../components/StatusCard";
import { Button } from "../components/ui/button";
import { notificationPath } from "@nexusflow/shared";
import { Skeleton } from "../components/ui/skeleton";
import { useCurrentUser } from "../features/auth/hooks";
import { useNotifications } from "../features/notifications/hooks";
import { useMyTasks } from "../features/tasks/hooks";
import { DueDate, PriorityIcon, useToday } from "../features/tasks/taskBits";
import { useSystemStatus } from "../hooks/useSystemStatus";
import { useWorkspace, type WorkspaceContext } from "../hooks/useWorkspace";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// "My focus" (PRD §14.2): what needs you now (overdue, today, this week) and
// your latest mentions.
function MyFocus({ context }: { context: WorkspaceContext }) {
  const my = useMyTasks(context.organization.slug, context.workspace.slug);
  const mentions = useNotifications("mentions", context.organization.id);
  const today = useToday();
  const urgent = (my.data?.tasks ?? [])
    .filter(
      (task) => task.group === "OVERDUE" || task.group === "TODAY" || task.group === "THIS_WEEK",
    )
    .slice(0, 8);
  const latestMentions = (mentions.data?.pages[0]?.items ?? []).slice(0, 5);

  return (
    <section aria-labelledby="focus-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="focus-heading" className="text-lg font-semibold">
          My focus
        </h2>
        <Link to={context.path("my-tasks")} className="text-sm text-primary hover:underline">
          All my tasks
        </Link>
      </div>
      {my.isPending ? (
        <Skeleton className="h-32" />
      ) : urgent.length === 0 && latestMentions.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nothing needs you this week"
          description="Tasks assigned to you that are overdue or due this week, and new mentions, show up here."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <ul className="divide-y rounded-card border bg-card" aria-label="Due soon">
            {urgent.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">Nothing due this week.</li>
            )}
            {urgent.map((task) => (
              <li key={task.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                <PriorityIcon priority={task.priority} />
                <Link
                  to={context.path(`tasks/${task.key}`)}
                  className="min-w-0 flex-1 truncate hover:underline"
                >
                  <span className="mr-1 text-xs text-muted-foreground">{task.key}</span>
                  {task.title}
                </Link>
                {task.dueDate && (
                  <DueDate dueDate={task.dueDate} category={task.status.category} today={today} />
                )}
              </li>
            ))}
          </ul>
          <ul className="divide-y rounded-card border bg-card" aria-label="Mentions">
            {latestMentions.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">No mentions yet.</li>
            )}
            {latestMentions.map((item) => (
              <li key={item.id} className="px-4 py-2.5 text-sm">
                <Link
                  to={notificationPath(item.data) ?? context.path("inbox")}
                  className="hover:underline"
                >
                  {item.title}
                </Link>
                {item.body && <p className="truncate text-xs text-muted-foreground">{item.body}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function HomePage() {
  const context = useWorkspace();
  const { api, database, recheck } = useSystemStatus();
  const { data: user } = useCurrentUser();
  const firstName = user?.name.split(" ")[0] ?? "there";

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={`Here is what is happening in ${context?.workspace.name ?? "your workspace"}.`}
      />

      <section aria-labelledby="start-heading" className="space-y-3">
        <h2 id="start-heading" className="text-lg font-semibold">
          Getting started
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {context && (
            <li>
              <Link
                to={context.path("projects?new=1")}
                className="flex h-full items-start gap-3 rounded-card border bg-card p-4 shadow-sm transition-colors hover:bg-surface"
              >
                <FolderPlus className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">Create a project</p>
                  <p className="text-xs text-muted-foreground">
                    With a board, columns and milestones
                  </p>
                </div>
              </Link>
            </li>
          )}
          {context && (
            <li>
              <Link
                to={context.path("projects")}
                className="flex h-full items-start gap-3 rounded-card border bg-card p-4 shadow-sm transition-colors hover:bg-surface"
              >
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">Add and assign a task</p>
                  <p className="text-xs text-muted-foreground">Open a project, then press C</p>
                </div>
              </Link>
            </li>
          )}
          {context?.can("members:invite") && (
            <li>
              <Link
                to={context.settingsPath("org/invitations")}
                className="flex h-full items-start gap-3 rounded-card border bg-card p-4 shadow-sm transition-colors hover:bg-surface"
              >
                <UserPlus className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">Invite your teammates</p>
                  <p className="text-xs text-muted-foreground">Send email invitations</p>
                </div>
              </Link>
            </li>
          )}
        </ul>
      </section>

      {context && <MyFocus context={context} />}

      <section aria-labelledby="status-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="status-heading" className="text-lg font-semibold">
            System status
          </h2>
          <Button variant="outline" size="sm" onClick={recheck}>
            Check again
          </Button>
        </div>
        <div aria-live="polite" className="grid gap-4 sm:grid-cols-2">
          <StatusCard title="API server" description="Express on port 4000" state={api} />
          <StatusCard
            title="Database"
            description="Neon PostgreSQL. The first check after a pause can take a few seconds."
            state={database}
          />
        </div>
      </section>
    </div>
  );
}
