import {
  ChartColumn,
  FolderKanban,
  House,
  Inbox,
  ListTodo,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router";
import { Button } from "../components/ui/button";
import { Tooltip } from "../components/ui/tooltip";
import { useProjects } from "../features/projects/hooks";
import { PROJECT_STATUS_DOTS } from "../features/projects/labels";
import type { WorkspaceContext } from "../hooks/useWorkspace";
import { cn } from "../lib/utils";
import { UserMenu } from "./UserMenu";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

interface NavItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  collapsed: boolean;
  badge?: number;
}

// One sidebar link. NavLink marks the current page (styling plus
// aria-current="page" for screen readers). Folded down, only the icon shows
// and the label moves into a tooltip.
function NavItem({ to, icon: Icon, label, collapsed, badge }: NavItemProps) {
  const link = (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "relative flex h-9 items-center gap-3 rounded-control px-2.5 text-sm font-medium transition-colors duration-150",
          isActive
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
          collapsed && "justify-center px-0",
        )
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className={collapsed ? "sr-only" : "truncate"}>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={cn(
            "rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums",
            collapsed ? "absolute right-1.5 top-1.5 size-2" : "ml-auto px-1.5",
          )}
        >
          <span className={collapsed ? "sr-only" : undefined}>{badge}</span>
          <span className="sr-only"> unread</span>
        </span>
      )}
    </NavLink>
  );
  return collapsed ? <Tooltip content={label}>{link}</Tooltip> : link;
}

const MAX_SHORTCUTS = 8;

// Your open projects in this workspace, for quick access (PRD §14.1).
function ProjectShortcuts({ context }: { context: WorkspaceContext }) {
  const { data: projects = [] } = useProjects(context.organization.slug, context.workspace.slug);
  if (projects.length === 0) return null;
  return (
    <nav aria-label="Projects" className="flex min-h-0 flex-col gap-0.5">
      <h2 className="px-2.5 pb-1 text-xs font-semibold text-muted-foreground">Projects</h2>
      <div className="flex flex-col gap-0.5 overflow-y-auto">
        {projects.slice(0, MAX_SHORTCUTS).map((project) => (
          <NavLink
            key={project.id}
            to={context.path(`projects/${project.key}`)}
            className={({ isActive }) =>
              cn(
                "flex h-8 items-center gap-2.5 rounded-control px-2.5 text-sm transition-colors duration-150",
                isActive
                  ? "bg-card font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
              )
            }
          >
            <span
              className={cn("size-2.5 shrink-0 rounded-[3px]", PROJECT_STATUS_DOTS[project.status])}
              aria-hidden="true"
            />
            <span className="truncate">{project.name}</span>
          </NavLink>
        ))}
        {projects.length > MAX_SHORTCUTS && (
          <NavLink
            to={context.path("projects")}
            className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            All {projects.length} projects
          </NavLink>
        )}
      </div>
    </nav>
  );
}

interface SidebarContentProps {
  context: WorkspaceContext;
  collapsed: boolean;
  /** Desktop only: fold or unfold the sidebar. Absent in the phone drawer. */
  onToggleCollapse?: () => void;
}

// Everything inside the sidebar. Used by the desktop sidebar and the phone drawer.
export function SidebarContent({ context, collapsed, onToggleCollapse }: SidebarContentProps) {
  const { path, settingsPath } = context;

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <WorkspaceSwitcher context={context} collapsed={collapsed} />

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        <NavItem to={path("home")} icon={House} label="Home" collapsed={collapsed} />
        <NavItem to={path("my-tasks")} icon={ListTodo} label="My tasks" collapsed={collapsed} />
        <NavItem to={path("inbox")} icon={Inbox} label="Inbox" collapsed={collapsed} />
        <NavItem to={path("projects")} icon={FolderKanban} label="Projects" collapsed={collapsed} />
        <NavItem to={path("teams")} icon={Users} label="Teams" collapsed={collapsed} />
        <NavItem to={path("insights")} icon={ChartColumn} label="Insights" collapsed={collapsed} />
      </nav>

      {!collapsed && <ProjectShortcuts context={context} />}

      <div className="mt-auto flex flex-col gap-0.5">
        <NavItem to={settingsPath()} icon={Settings} label="Settings" collapsed={collapsed} />
        {onToggleCollapse && (
          <Tooltip content={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn("justify-start gap-3 px-2.5", collapsed && "justify-center px-0")}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
              {!collapsed && "Collapse"}
            </Button>
          </Tooltip>
        )}
        <div className="mt-2 border-t pt-2">
          <UserMenu settingsPath={settingsPath()} collapsed={collapsed} />
        </div>
      </div>
    </div>
  );
}
