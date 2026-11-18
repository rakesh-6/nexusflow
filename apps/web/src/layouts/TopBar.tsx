import {
  Bell,
  ChevronRight,
  FolderPlus,
  Menu,
  Plus,
  Search,
  SquarePen,
  UserPlus,
  Users,
} from "lucide-react";
import { Fragment } from "react";
import { Link, useMatches } from "react-router";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import type { WorkspaceContext } from "../hooks/useWorkspace";
import { isRouteHandle } from "../lib/routeHandle";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

// "General / Projects / NEX / Board", built from each matched route's crumb label.
function Breadcrumbs({ context }: { context: WorkspaceContext }) {
  const crumbs = useMatches()
    .filter((match) => isRouteHandle(match.handle))
    .map((match) => ({
      label: isRouteHandle(match.handle) ? match.handle.crumb(match.params) : "",
      path: match.pathname,
    }));

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-sm">
        <li className="hidden truncate text-muted-foreground sm:block">{context.workspace.name}</li>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <Fragment key={crumb.path}>
              <li className="hidden text-muted-foreground sm:block" aria-hidden="true">
                <ChevronRight className="size-3.5" />
              </li>
              <li className={isLast ? "truncate font-medium" : "hidden truncate sm:block"}>
                {isLast ? (
                  <span aria-current="page">{crumb.label}</span>
                ) : (
                  <Link to={crumb.path} className="text-muted-foreground hover:text-foreground">
                    {crumb.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

// "New" menu. Each item comes alive in the phase that builds the feature.
function NewMenu({ context }: { context: WorkspaceContext }) {
  const items = [
    { icon: SquarePen, label: "New task", phase: "Phase 5" },
    { icon: FolderPlus, label: "New project", phase: "Phase 4" },
    { icon: Users, label: "New team", phase: "Phase 4" },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" aria-label="Create new">
          <Plus /> <span className="hidden sm:inline">New</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem key={item.label} disabled>
            <item.icon /> {item.label}
            <span className="ml-auto text-xs text-muted-foreground">{item.phase}</span>
          </DropdownMenuItem>
        ))}
        {context.can("members:invite") && (
          <DropdownMenuItem asChild>
            <Link to={context.settingsPath("org/invitations")}>
              <UserPlus /> Invite people
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBar({
  context,
  onOpenMenu,
}: {
  context: WorkspaceContext;
  onOpenMenu: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3 sm:px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={onOpenMenu}
        aria-label="Open menu"
      >
        <Menu />
      </Button>

      <Breadcrumbs context={context} />

      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" asChild className="text-muted-foreground">
          <Link to={context.path("search")}>
            <Search />
            <span className="hidden lg:inline">Search…</span>
            <kbd className="hidden rounded border bg-surface px-1.5 text-[11px] font-medium lg:inline">
              {isMac ? "⌘" : "Ctrl"} K
            </kbd>
            <span className="sr-only lg:hidden">Search</span>
          </Link>
        </Button>
        <NewMenu context={context} />
        {/* The unread dot returns with real notifications in Phase 7. */}
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to={context.path("inbox")} aria-label="Notifications">
            <Bell />
          </Link>
        </Button>
      </div>
    </header>
  );
}
