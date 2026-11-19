import type { ProjectSummary } from "@nexusflow/shared";
import {
  Archive,
  CalendarDays,
  ChartGantt,
  LayoutDashboard,
  List,
  Lock,
  Settings,
  SquareKanban,
  type LucideIcon,
} from "lucide-react";
import { NavLink, Outlet, useOutletContext, useParams } from "react-router";
import { Alert } from "../components/ui/alert";
import { Skeleton } from "../components/ui/skeleton";
import { useProjectByKey } from "../features/projects/hooks";
import { ProgressBar, ProjectStatusBadge } from "../features/projects/labels";
import { useRoom } from "../features/realtime/useRealtime";
import { TaskPanel } from "../features/tasks/TaskPanel";
import { useWorkspace, type WorkspaceContext } from "../hooks/useWorkspace";
import { ApiError } from "../lib/api";
import { cn } from "../lib/utils";
import { NotFoundPage } from "./NotFoundPage";

// The five views of one project, plus its settings (PRD §10, §14.2).
const TABS: { path: string; label: string; icon: LucideIcon }[] = [
  { path: "board", label: "Board", icon: SquareKanban },
  { path: "list", label: "List", icon: List },
  { path: "calendar", label: "Calendar", icon: CalendarDays },
  { path: "timeline", label: "Timeline", icon: ChartGantt },
  { path: "overview", label: "Overview", icon: LayoutDashboard },
  { path: "settings", label: "Settings", icon: Settings },
];

export interface ProjectOutletContext {
  project: ProjectSummary;
  context: WorkspaceContext;
}

/** The project shown by the surrounding ProjectLayout, for its tab pages. */
export const useProjectOutlet = () => useOutletContext<ProjectOutletContext>();

// Header and view tabs shared by every page of one project.
export default function ProjectLayout() {
  const { projectKey = "" } = useParams();
  const context = useWorkspace();
  const query = useProjectByKey(
    context?.organization.slug ?? "",
    context?.workspace.slug ?? "",
    projectKey,
  );
  // Other people's changes to this project's tasks arrive live.
  useRoom("project", query.data?.id);
  if (!context) return <NotFoundPage />;
  if (query.isPending) {
    return (
      <div className="space-y-3 border-b bg-card px-4 py-5 sm:px-6">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-9 w-96 max-w-full" />
      </div>
    );
  }
  if (query.isError) {
    return query.error instanceof ApiError && query.error.status === 404 ? (
      <NotFoundPage />
    ) : (
      <div className="p-6">
        <Alert variant="error">This project could not be loaded.</Alert>
      </div>
    );
  }

  const project = query.data;
  const base = context.path(`projects/${project.key}`);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card px-4 pt-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            {project.visibility === "PRIVATE" && (
              <Lock className="size-4 text-muted-foreground" aria-label="Private project" />
            )}
            {project.name}
          </h1>
          <span className="rounded-full border bg-surface px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {project.key}
          </span>
          <ProjectStatusBadge status={project.status} />
          <div className="ml-auto hidden w-48 sm:block">
            <ProgressBar value={project.progress} label="Project progress" />
          </div>
        </div>
        {project.status === "ARCHIVED" && (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Archive className="size-4" aria-hidden="true" />
            This project is archived and read-only.
          </p>
        )}
        <nav aria-label="Project views" className="-mb-px mt-4 flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <NavLink
              key={tab.path}
              to={`${base}/${tab.path}`}
              className={({ isActive }) =>
                cn(
                  "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )
              }
            >
              <tab.icon className="size-4" aria-hidden="true" />
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="flex-1">
        <Outlet context={{ project, context } satisfies ProjectOutletContext} />
      </div>
      {/* A task opens here (?task=NEX-42) over the board, list or calendar. */}
      <TaskPanel context={context} />
    </div>
  );
}
