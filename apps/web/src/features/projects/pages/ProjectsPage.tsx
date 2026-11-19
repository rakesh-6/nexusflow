import { PROJECT_STATUSES, type ProjectStatus, type ProjectSummary } from "@nexusflow/shared";
import { FolderKanban, Lock, Plus, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { EmptyState } from "../../../components/common/EmptyState";
import { PageHeader } from "../../../components/common/PageHeader";
import { UserAvatar } from "../../../components/common/UserAvatar";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Skeleton } from "../../../components/ui/skeleton";
import { useWorkspace, type WorkspaceContext } from "../../../hooks/useWorkspace";
import { formatDate } from "../../organizations/labels";
import { useProjects, useTeams } from "../hooks";
import { NewProjectDialog } from "../NewProjectDialog";
import { PriorityBadge, ProgressBar, PROJECT_STATUS_LABELS, ProjectStatusBadge } from "../labels";

function ProjectCard({ project, context }: { project: ProjectSummary; context: WorkspaceContext }) {
  return (
    <li>
      <Link
        to={context.path(`projects/${project.key}`)}
        className="flex h-full flex-col gap-3 rounded-card border bg-card p-4 shadow-sm transition-colors hover:bg-surface"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium">
              {project.visibility === "PRIVATE" && (
                <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Private" />
              )}
              {project.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {project.key}
              {project.team && ` · ${project.team.name}`}
            </p>
          </div>
          <UserAvatar
            name={project.owner.name}
            avatarUrl={project.owner.avatarUrl}
            className="size-7"
          />
        </div>
        {project.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <ProjectStatusBadge status={project.status} />
          <PriorityBadge priority={project.priority} />
        </div>
        <div className="mt-auto space-y-1.5">
          <ProgressBar value={project.progress} label={`${project.name} progress`} />
          <p className="text-xs text-muted-foreground">
            {project.doneTaskCount}/{project.taskCount} tasks done
            {project.endDate && ` · due ${formatDate(project.endDate)}`}
          </p>
        </div>
      </Link>
    </li>
  );
}

const selectClass = "h-9 rounded-control border bg-card px-3 text-sm";

// /:org/:ws/projects (PRD §14.2): every project you can open, with filters.
export default function ProjectsPage() {
  const context = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim());
  const [status, setStatus] = useState<ProjectStatus | "">("");
  const [teamId, setTeamId] = useState("");
  const creating = params.get("new") === "1";
  const setCreating = (open: boolean) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (open) next.set("new", "1");
      else next.delete("new");
      return next;
    });

  const orgSlug = context?.organization.slug ?? "";
  const workspaceSlug = context?.workspace.slug ?? "";
  const projects = useProjects(orgSlug, workspaceSlug, {
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
    ...(teamId ? { teamId } : {}),
  });
  const { data: teamData } = useTeams(orgSlug, workspaceSlug);
  if (!context) return null;

  const canCreate = context.role !== "GUEST" && !context.workspace.archived;
  const filtered = Boolean(q || status || teamId);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader
        title="Projects"
        description={`Every project you can open in ${context.workspace.name}.`}
        actions={
          canCreate && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New project
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search projects"
            placeholder="Search by name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 pl-9"
          />
        </div>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => setStatus(event.target.value as ProjectStatus | "")}
          className={selectClass}
        >
          <option value="">All except archived</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {!!teamData?.teams.length && (
          <select
            aria-label="Filter by team"
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            className={selectClass}
          >
            <option value="">All teams</option>
            {teamData.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {projects.isError && <Alert variant="error">Projects could not be loaded.</Alert>}
      {projects.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : projects.data?.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.data.map((project) => (
            <ProjectCard key={project.id} project={project} context={context} />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={FolderKanban}
          title={filtered ? "No matching projects" : "No projects yet"}
          description={
            filtered
              ? "Try another search or filter."
              : "Projects hold your tasks, board and timeline. Create the first one."
          }
          action={
            !filtered &&
            canCreate && (
              <Button onClick={() => setCreating(true)}>
                <Plus /> New project
              </Button>
            )
          }
        />
      )}
      {canCreate && (
        <NewProjectDialog context={context} open={creating} onOpenChange={setCreating} />
      )}
    </div>
  );
}
