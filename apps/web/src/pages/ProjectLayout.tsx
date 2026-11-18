import {
  CalendarDays,
  ChartGantt,
  LayoutDashboard,
  List,
  Settings,
  SquareKanban,
  type LucideIcon,
} from "lucide-react";
import { NavLink, Outlet, useParams } from "react-router";
import { useWorkspace } from "../hooks/useWorkspace";
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

// Header and view tabs shared by every page of one project. Until projects come
// from the API (Phase 4), the header shows only the key from the address.
export default function ProjectLayout() {
  const { projectKey = "" } = useParams();
  const context = useWorkspace();
  if (!context || !projectKey) return <NotFoundPage />;

  const base = context.path(`projects/${projectKey}`);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card px-4 pt-5 sm:px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Project</h1>
          <span className="rounded-full border bg-surface px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {projectKey}
          </span>
        </div>
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
        <Outlet />
      </div>
    </div>
  );
}
