import { TEAM_ROLES, type TeamRole, type TeamSummary } from "@nexusflow/shared";
import { Plus } from "lucide-react";
import { useId, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { PageHeader } from "../../../components/common/PageHeader";
import { SettingsSection } from "../../../components/common/SettingsSection";
import { UserAvatar } from "../../../components/common/UserAvatar";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Skeleton } from "../../../components/ui/skeleton";
import { useWorkspace, type WorkspaceContext } from "../../../hooks/useWorkspace";
import { errorMessage } from "../../../lib/api";
import { NotFoundPage } from "../../../pages/NotFoundPage";
import { useWorkspaceMembers } from "../../organizations/hooks";
import {
  useDeleteTeam,
  useProjects,
  useRemoveTeamMember,
  useSetTeamMember,
  useTeamMembers,
  useTeams,
  useUpdateTeam,
} from "../hooks";
import { NewProjectDialog } from "../NewProjectDialog";
import { ProgressBar, ProjectStatusBadge, TEAM_ROLE_LABELS } from "../labels";

function Members({ team, context }: { team: TeamSummary; context: WorkspaceContext }) {
  const slug = context.organization.slug;
  const { data: members, isPending } = useTeamMembers(slug, team.id);
  const { data: people = [] } = useWorkspaceMembers(slug, context.workspace.slug);
  const setMember = useSetTeamMember(slug, team.id);
  const remove = useRemoveTeamMember(slug, team.id);
  const [userId, setUserId] = useState("");
  const addId = useId();
  const error = setMember.error ?? remove.error;
  if (isPending || !members) return <Skeleton className="h-16" />;
  const candidates = people.filter((p) => !members.some((m) => m.userId === p.userId));

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{errorMessage(error)}</Alert>}
      <ul className="divide-y">
        {members.map((member) => (
          <li key={member.userId} className="flex flex-wrap items-center gap-3 py-3">
            <UserAvatar name={member.name} avatarUrl={member.avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{member.name}</p>
              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
            </div>
            {team.canManage ? (
              <>
                <select
                  aria-label={`Team role of ${member.name}`}
                  value={member.role}
                  disabled={setMember.isPending}
                  onChange={(e) =>
                    setMember.mutate({
                      userId: member.userId,
                      role: e.target.value as TeamRole,
                      isNew: false,
                    })
                  }
                  className="h-8 rounded-control border bg-card px-2 text-sm"
                >
                  {TEAM_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {TEAM_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(member.userId)}
                >
                  Remove
                </Button>
              </>
            ) : (
              <span className="rounded-full border bg-surface px-2 py-0.5 text-xs font-medium">
                {TEAM_ROLE_LABELS[member.role]}
              </span>
            )}
          </li>
        ))}
      </ul>
      {team.canManage && candidates.length > 0 && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setMember.mutate(
              { userId, role: "MEMBER", isNew: true },
              { onSuccess: () => setUserId("") },
            );
          }}
        >
          <div className="min-w-48 flex-1 space-y-1.5">
            <label htmlFor={addId} className="block text-sm font-medium">
              Add a workspace member
            </label>
            <select
              id={addId}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="h-10 w-full rounded-control border bg-card px-3 text-sm"
            >
              <option value="">Choose…</option>
              {candidates.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.name} ({p.email})
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={!userId || setMember.isPending}>
            Add
          </Button>
        </form>
      )}
    </div>
  );
}

function Projects({ team, context }: { team: TeamSummary; context: WorkspaceContext }) {
  const projects = useProjects(context.organization.slug, context.workspace.slug, {
    teamId: team.id,
  });
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-3">
      {projects.isPending ? (
        <Skeleton className="h-12" />
      ) : projects.data?.length ? (
        <ul className="divide-y">
          {projects.data.map((project) => (
            <li key={project.id}>
              <Link
                to={context.path(`projects/${project.key}`)}
                className="flex flex-wrap items-center gap-3 py-2.5 hover:text-primary"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {project.name}{" "}
                  <span className="text-xs text-muted-foreground">{project.key}</span>
                </span>
                <ProjectStatusBadge status={project.status} />
                <span className="w-36">
                  <ProgressBar value={project.progress} label={`${project.name} progress`} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No team projects yet.</p>
      )}
      {team.canManage && (
        <>
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus /> New team project
          </Button>
          <NewProjectDialog
            context={context}
            open={creating}
            onOpenChange={setCreating}
            defaultTeamId={team.id}
          />
        </>
      )}
    </div>
  );
}

function EditTeam({ team, context }: { team: TeamSummary; context: WorkspaceContext }) {
  const update = useUpdateTeam(context.organization.slug, team.id);
  const navigate = useNavigate();
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? "");
  const id = useId();
  return (
    <form
      className="max-w-sm space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate(
          { name: name.trim(), description: description.trim() },
          {
            onSuccess: (saved) => navigate(context.path(`teams/${saved.slug}`), { replace: true }),
          },
        );
      }}
    >
      {update.error && <Alert variant="error">{errorMessage(update.error)}</Alert>}
      {update.isSuccess && <Alert variant="success">Saved.</Alert>}
      <div className="space-y-1.5">
        <label htmlFor={`${id}-name`} className="block text-sm font-medium">
          Name
        </label>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${id}-description`} className="block text-sm font-medium">
          Description
        </label>
        <Input
          id={`${id}-description`}
          value={description}
          maxLength={500}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={update.isPending || name.trim().length < 2}>
        Save
      </Button>
    </form>
  );
}

function DeleteTeam({ team, context }: { team: TeamSummary; context: WorkspaceContext }) {
  const remove = useDeleteTeam(context.organization.slug, team.id);
  const navigate = useNavigate();
  const [action, setAction] = useState<"move" | "archive">("move");
  return (
    <div className="space-y-3">
      {remove.error && <Alert variant="error">{errorMessage(remove.error)}</Alert>}
      <fieldset className="space-y-1.5 text-sm">
        <legend className="mb-1 font-medium">Its {team.projectCount} project(s) should</legend>
        <label className="flex items-center gap-2">
          <input type="radio" checked={action === "move"} onChange={() => setAction("move")} /> stay
          in the workspace without a team
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={action === "archive"}
            onChange={() => setAction("archive")}
          />{" "}
          be archived
        </label>
      </fieldset>
      <Button
        variant="destructive"
        disabled={remove.isPending}
        onClick={() => {
          if (!window.confirm(`Delete the ${team.name} team?`)) return;
          remove.mutate(action, {
            onSuccess: () => navigate(context.path("teams"), { replace: true }),
          });
        }}
      >
        Delete team
      </Button>
    </div>
  );
}

// /:org/:ws/teams/:teamSlug (PRD §11.4): members, projects, settings.
export default function TeamPage() {
  const { teamSlug = "" } = useParams();
  const context = useWorkspace();
  const teams = useTeams(context?.organization.slug ?? "", context?.workspace.slug ?? "");
  if (!context) return null;
  if (teams.isPending) return <Skeleton className="m-6 h-40" />;
  const team = teams.data?.teams.find((t) => t.slug === teamSlug);
  if (!team) return <NotFoundPage />;
  const canDelete = teams.data?.canCreate ?? false;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader
        title={team.name}
        description={
          team.description ?? `${team.memberCount} members · ${team.projectCount} projects`
        }
      />
      <SettingsSection
        title="Members"
        description="Team members can contribute to every team project."
      >
        <Members team={team} context={context} />
      </SettingsSection>
      <SettingsSection title="Projects" description="Projects that belong to this team.">
        <Projects team={team} context={context} />
      </SettingsSection>
      {team.canManage && (
        <SettingsSection title="Team settings" description="Name and description.">
          <EditTeam key={team.id} team={team} context={context} />
        </SettingsSection>
      )}
      {canDelete && (
        <SettingsSection title="Delete team" description="Members stay in the workspace." danger>
          <DeleteTeam team={team} context={context} />
        </SettingsSection>
      )}
    </div>
  );
}
