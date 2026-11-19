import type { WorkspaceSummary } from "@nexusflow/shared";
import { Link } from "react-router";
import { SettingsPage, SettingsSection } from "../../../components/common/SettingsSection";
import { Skeleton } from "../../../components/ui/skeleton";
import type { WorkspaceContext } from "../../../hooks/useWorkspace";
import { useTeams } from "../hooks";

function WorkspaceTeams({ orgSlug, workspace }: { orgSlug: string; workspace: WorkspaceSummary }) {
  const { data, isPending } = useTeams(orgSlug, workspace.slug);
  if (isPending) return <Skeleton className="h-10" />;
  if (!data?.teams.length) return <p className="text-sm text-muted-foreground">No teams.</p>;
  return (
    <ul className="divide-y">
      {data.teams.map((team) => (
        <li key={team.id}>
          <Link
            to={`/${orgSlug}/${workspace.slug}/teams/${team.slug}`}
            className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm hover:text-primary"
          >
            <span className="font-medium">{team.name}</span>
            <span className="text-xs text-muted-foreground">
              {team.leads.map((lead) => lead.name).join(", ") || "No lead"} · {team.memberCount}{" "}
              members · {team.projectCount} projects
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Settings › Teams (PRD §11.17.1): every team in every workspace, for owners and admins.
export function AllTeamsSettings({ context }: { context: WorkspaceContext }) {
  const orgSlug = context.organization.slug;
  return (
    <SettingsPage title="Teams" description="Every team across your workspaces.">
      {context.workspaces.map((workspace) => (
        <SettingsSection
          key={workspace.id}
          title={workspace.name}
          description={workspace.archived ? "Archived workspace" : "Open a team to manage it."}
        >
          <WorkspaceTeams orgSlug={orgSlug} workspace={workspace} />
        </SettingsSection>
      ))}
    </SettingsPage>
  );
}
