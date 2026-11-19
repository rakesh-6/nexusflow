import { DUE_GROUPS, type DueGroup, type MyTask } from "@nexusflow/shared";
import { ListTodo } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { EmptyState } from "../../../components/common/EmptyState";
import { PageHeader } from "../../../components/common/PageHeader";
import { Alert } from "../../../components/ui/alert";
import { Skeleton } from "../../../components/ui/skeleton";
import { useWorkspace } from "../../../hooks/useWorkspace";
import { errorMessage } from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { useMyTasks, useUpdateTask } from "../hooks";
import { DueDate, LabelChips, PriorityIcon, selectClass, useToday } from "../taskBits";
import { TaskPanel, useOpenTask } from "../TaskPanel";

// /:org/:ws/my-tasks (PRD §11.6.11): open tasks assigned to you, by due date.

const GROUP_LABELS: Record<DueGroup, string> = {
  OVERDUE: "Overdue",
  TODAY: "Today",
  THIS_WEEK: "This week",
  LATER: "Later",
  NO_DATE: "No date",
};

export default function MyTasksPage() {
  const context = useWorkspace();
  const orgSlug = context?.organization.slug ?? "";
  const my = useMyTasks(orgSlug, context?.workspace.slug ?? "");
  const update = useUpdateTask(orgSlug, "");
  const openTask = useOpenTask();
  const today = useToday();
  const [notice, setNotice] = useState<string | null>(null);
  if (!context) return null;

  const changeStatus = (task: MyTask, statusId: string) => {
    setNotice(null);
    update.mutate(
      { taskId: task.id, version: task.version, statusId },
      { onError: (error) => setNotice(errorMessage(error)) },
    );
  };

  const statusesOf = (projectId: string) =>
    my.data?.projects.find((p) => p.id === projectId)?.statuses ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader title="My tasks" description="Open tasks assigned to you in this workspace." />
      {notice && <Alert variant="error">{notice}</Alert>}
      {my.isError && <Alert variant="error">Your tasks could not be loaded.</Alert>}
      {!my.data ? (
        my.isPending && <Skeleton className="h-64" />
      ) : my.data.tasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Nothing assigned to you"
          description="Tasks assigned to you show up here, grouped by when they are due."
        />
      ) : (
        DUE_GROUPS.map((group) => {
          const tasks = my.data.tasks.filter((task) => task.group === group);
          if (tasks.length === 0) return null;
          return (
            <section key={group} aria-label={GROUP_LABELS[group]} className="space-y-2">
              <h2
                className={cn("text-sm font-semibold", group === "OVERDUE" && "text-destructive")}
              >
                {GROUP_LABELS[group]}{" "}
                <span className="font-normal text-muted-foreground">· {tasks.length}</span>
              </h2>
              <ul className="divide-y rounded-card border bg-card">
                {tasks.map((task) => (
                  <li key={task.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <PriorityIcon priority={task.priority} />
                    <button
                      type="button"
                      onClick={() => openTask(task.key)}
                      className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                    >
                      <span className="mr-2 text-xs text-muted-foreground">{task.key}</span>
                      {task.title}
                    </button>
                    <LabelChips labels={task.labels} max={2} />
                    <Link
                      to={context.path(`projects/${task.project.key}/board`)}
                      className="hidden text-xs text-muted-foreground hover:underline sm:inline"
                    >
                      {task.project.name}
                    </Link>
                    {task.dueDate && (
                      <DueDate
                        dueDate={task.dueDate}
                        category={task.status.category}
                        today={today}
                      />
                    )}
                    <select
                      aria-label={`Status of ${task.key}`}
                      className={selectClass}
                      value={task.status.id}
                      onChange={(event) => changeStatus(task, event.target.value)}
                    >
                      {statusesOf(task.project.id).map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.name}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
      <TaskPanel context={context} />
    </div>
  );
}
