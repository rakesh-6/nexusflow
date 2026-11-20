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
import { Link, useMatches, useParams } from "react-router";
import { UserAvatar } from "../components/common/UserAvatar";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { useCurrentUser } from "../features/auth/hooks";
import { useUnreadCount } from "../features/notifications/hooks";
import { useWorkspaceMembers } from "../features/organizations/hooks";
import { useOnline } from "../features/realtime/useRealtime";
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

// The bell opens the Inbox; a dot shows unread notifications of this organization.
function BellButton({ context }: { context: WorkspaceContext }) {
  const { data: unread } = useUnreadCount();
  const count = unread?.byOrg[context.organization.id] ?? 0;
  return (
    <Button variant="ghost" size="icon-sm" asChild className="relative">
      <Link
        to={context.path("inbox")}
        aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
      >
        <Bell />
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive ring-2 ring-card"
          />
        )}
      </Link>
    </Button>
  );
}

// Colleagues who have this workspace open right now (live presence, PRD §11.8.4).
function OnlineNow({ context }: { context: WorkspaceContext }) {
  const online = useOnline(context.workspace.id);
  const { data: me } = useCurrentUser();
  const { data: members = [] } = useWorkspaceMembers(
    context.organization.slug,
    context.workspace.slug,
  );
  const others = online.filter((id) => id !== me?.id);
  if (others.length === 0) return null;
  const people = others.flatMap((id) => members.filter((member) => member.userId === id));
  const label = `Online now: ${people.map((person) => person.name).join(", ") || `${others.length} people`}`;
  return (
    <span className="hidden items-center sm:flex" title={label} aria-label={label}>
      {people.slice(0, 4).map((person) => (
        <UserAvatar
          key={person.userId}
          name={person.name}
          avatarUrl={person.avatarUrl}
          className="-ml-1.5 size-7 ring-2 ring-success first:ml-0"
        />
      ))}
      {others.length > Math.min(people.length, 4) && (
        <span className="ml-1.5 text-xs text-muted-foreground">
          +{others.length - Math.min(people.length, 4)}
        </span>
      )}
    </span>
  );
}

// "New" menu. Each item comes alive in the phase that builds the feature.
function NewMenu({ context }: { context: WorkspaceContext }) {
  // Workspace admins (and org owners/admins) create teams; any member creates projects.
  const canCreateTeam = context.workspace.role === "WORKSPACE_ADMIN";
  // A task needs a project: inside one, "New task" opens its dialog.
  const { projectKey } = useParams();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" aria-label="Create new">
          <Plus /> <span className="hidden sm:inline">New</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {projectKey && (
          <DropdownMenuItem asChild>
            <Link to={`${context.path(`projects/${projectKey}/board`)}?newTask=1`}>
              <SquarePen /> New task
              <span className="ml-auto text-xs text-muted-foreground">C</span>
            </Link>
          </DropdownMenuItem>
        )}
        {!context.workspace.archived && (
          <DropdownMenuItem asChild>
            <Link to={context.path("projects?new=1")}>
              <FolderPlus /> New project
            </Link>
          </DropdownMenuItem>
        )}
        {canCreateTeam && (
          <DropdownMenuItem asChild>
            <Link to={context.path("teams?new=1")}>
              <Users /> New team
            </Link>
          </DropdownMenuItem>
        )}
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
  onOpenPalette,
}: {
  context: WorkspaceContext;
  onOpenMenu: () => void;
  /** Opens the command palette (also Ctrl+K / ⌘K). */
  onOpenPalette: () => void;
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
        <OnlineNow context={context} />
        <Button
          variant="outline"
          size="sm"
          className="text-muted-foreground"
          onClick={onOpenPalette}
          aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
        >
          <Search />
          <span className="hidden lg:inline">Search…</span>
          <kbd className="hidden rounded border bg-surface px-1.5 text-[11px] font-medium lg:inline">
            {isMac ? "⌘" : "Ctrl"} K
          </kbd>
          <span className="sr-only lg:hidden">Search</span>
        </Button>
        <NewMenu context={context} />
        <BellButton context={context} />
      </div>
    </header>
  );
}
