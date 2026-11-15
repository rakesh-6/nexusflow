import { ChevronsUpDown, Plus } from "lucide-react";
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
import type { WorkspaceContext } from "../hooks/useWorkspace";
import { SAMPLE_ORGANIZATIONS } from "../lib/sampleData";
import { cn } from "../lib/utils";

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
  const { organization, workspace } = context;
  const current = `${organization.slug}/${workspace.slug}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-control p-1.5 text-left transition-colors hover:bg-card",
          collapsed && "justify-center",
        )}
        aria-label={`Current workspace: ${organization.name}, ${workspace.name}. Switch workspace`}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-primary text-sm font-bold text-primary-foreground">
          {organization.name.charAt(0)}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{organization.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {workspace.name} · {organization.plan}
              </span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(value) => navigate(`/${value}/home`)}
        >
          {SAMPLE_ORGANIZATIONS.map((org) => (
            <div key={org.slug}>
              <DropdownMenuLabel>{org.name}</DropdownMenuLabel>
              {org.workspaces.map((ws) => (
                <DropdownMenuRadioItem key={ws.slug} value={`${org.slug}/${ws.slug}`}>
                  {ws.name}
                </DropdownMenuRadioItem>
              ))}
            </div>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <Plus /> New workspace
          <span className="ml-auto text-xs text-muted-foreground">Phase 3</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Plus /> New organization
          <span className="ml-auto text-xs text-muted-foreground">Phase 3</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
