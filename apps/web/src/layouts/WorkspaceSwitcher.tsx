import { ChevronsUpDown, Plus } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useNavigate } from "react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { useMyOrganizations } from "../features/organizations/hooks";
import type { WorkspaceContext } from "../hooks/useWorkspace";
import { cn } from "../lib/utils";

// Loaded on first open: it brings the form libraries, which the shell does not need.
const NewWorkspaceDialog = lazy(() =>
  import("../features/organizations/NewWorkspaceDialog").then((module) => ({
    default: module.NewWorkspaceDialog,
  })),
);

// The menu at the top of the sidebar: shows where you are and lets you jump to
// any workspace of any organization you belong to (PRD §11.2.3).
export function WorkspaceSwitcher({
  context,
  collapsed,
}: {
  context: WorkspaceContext;
  collapsed: boolean;
}) {
  const navigate = useNavigate();
  const { data: organizations = [] } = useMyOrganizations();
  const [creating, setCreating] = useState(false);
  const { organization, workspace } = context;
  const current = `${organization.slug}/${workspace.slug}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex w-full items-center gap-2.5 rounded-control p-1.5 text-left transition-colors hover:bg-card",
            collapsed && "justify-center",
          )}
          aria-label={`Current workspace: ${organization.name}, ${workspace.name}. Switch workspace`}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-primary text-sm font-bold text-primary-foreground">
            {organization.name.charAt(0).toUpperCase()}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{organization.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {workspace.name} · {organization.planTier}
                </span>
              </span>
              <ChevronsUpDown
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="max-h-[70vh] w-64 overflow-y-auto">
          <DropdownMenuRadioGroup
            value={current}
            onValueChange={(value) => navigate(`/${value}/home`)}
          >
            {organizations.map((org) => (
              <div key={org.slug}>
                <DropdownMenuLabel>{org.name}</DropdownMenuLabel>
                {org.workspaces.length === 0 && (
                  <DropdownMenuItem disabled>No workspaces (guest)</DropdownMenuItem>
                )}
                {org.workspaces.map((ws) => (
                  <DropdownMenuRadioItem key={ws.slug} value={`${org.slug}/${ws.slug}`}>
                    {ws.name}
                  </DropdownMenuRadioItem>
                ))}
              </div>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          {context.can("workspace:create") && (
            <DropdownMenuItem onSelect={() => setCreating(true)}>
              <Plus /> New workspace
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => navigate("/onboarding")}>
            <Plus /> New organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {creating && (
        <Suspense fallback={null}>
          <NewWorkspaceDialog
            orgSlug={organization.slug}
            open={creating}
            onOpenChange={setCreating}
          />
        </Suspense>
      )}
    </>
  );
}
