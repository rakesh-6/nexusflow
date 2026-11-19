import { useNavigate } from "react-router";
import { SettingsSection } from "../../../components/common/SettingsSection";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { errorMessage, isPlanLimit } from "../../../lib/api";
import { useProjectOutlet } from "../../../pages/ProjectLayout";
import { formatDateTime } from "../../organizations/labels";
import { useArchiveProject, useDeleteProject, useProjectActivity } from "../hooks";
import { ProjectColumnsSection } from "../settings/ProjectColumnsSection";
import { ProjectDetailsSection } from "../settings/ProjectDetailsSection";
import { ProjectMembersSection } from "../settings/ProjectMembersSection";
import { ProjectMilestonesSection } from "../settings/ProjectMilestonesSection";

const ACTIONS: Record<string, string> = {
  "project.created": "created the project",
  "project.updated": "changed the details",
  "project.archived": "archived the project",
  "project.restored": "restored the project",
  "project.undeleted": "restored the project from the trash",
  "project.member_added": "added a member",
  "project.member_role_changed": "changed a member's role",
  "project.member_removed": "removed a member",
  "project.status_added": "added a column",
  "project.status_changed": "changed a column",
  "project.statuses_reordered": "reordered the columns",
  "project.status_deleted": "deleted a column",
  "project.milestone_added": "added a milestone",
  "project.milestone_changed": "changed a milestone",
  "project.milestone_deleted": "deleted a milestone",
};

/** "Beta" from metadata { name: "Beta" }, shown after the action. */
const subject = (metadata: unknown) =>
  metadata &&
  typeof metadata === "object" &&
  "name" in metadata &&
  typeof metadata.name === "string"
    ? ` “${metadata.name}”`
    : "";

function RecentActivity({ orgSlug, projectId }: { orgSlug: string; projectId: string }) {
  const { data, isPending } = useProjectActivity(orgSlug, projectId);
  if (isPending) return <Skeleton className="h-16" />;
  if (!data?.length) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <ul className="space-y-2">
      {data.map((entry) => (
        <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span>
            <span className="font-medium">{entry.actorName}</span>{" "}
            {ACTIONS[entry.action] ?? entry.action}
            {subject(entry.metadata)}
          </span>
          <time dateTime={entry.createdAt} className="text-xs text-muted-foreground">
            {formatDateTime(entry.createdAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}

// /:org/:ws/projects/:key/settings (PRD §11.5): details, members, columns,
// milestones, archive and delete. Each section shows what your role allows.
export default function ProjectSettingsPage() {
  const { project, context } = useProjectOutlet();
  const slug = context.organization.slug;
  const archive = useArchiveProject(slug, project.id);
  const remove = useDeleteProject(slug, project.id);
  const navigate = useNavigate();
  const archived = project.status === "ARCHIVED";
  const { canManage, canAdminister } = project.access;
  const dangerError = archive.error ?? remove.error;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      {!canManage && (
        <Alert variant="info">
          You can view this project. Project managers can change its settings.
        </Alert>
      )}
      <SettingsSection
        title="Details"
        description="What the project is, who owns it and when it runs."
      >
        <ProjectDetailsSection
          key={`${project.id}-${project.key}`}
          project={project}
          context={context}
        />
      </SettingsSection>
      <SettingsSection title="Members" description="People with an explicit role in this project.">
        <ProjectMembersSection project={project} context={context} />
      </SettingsSection>
      <SettingsSection
        title="Board columns"
        description="The statuses tasks move through, left to right."
      >
        <ProjectColumnsSection project={project} context={context} />
      </SettingsSection>
      <SettingsSection title="Milestones" description="Checkpoints with due dates.">
        <ProjectMilestonesSection project={project} context={context} />
      </SettingsSection>
      <SettingsSection title="Recent activity" description="The latest changes to this project.">
        <RecentActivity orgSlug={slug} projectId={project.id} />
      </SettingsSection>
      {(canManage || canAdminister) && (
        <SettingsSection
          title="Archive or delete"
          description="Archived projects are read-only and do not count against your plan. Deleted ones stay in the trash for 30 days."
          danger
        >
          <div className="space-y-3">
            {dangerError && (
              <Alert variant="error">
                {errorMessage(dangerError)}
                {isPlanLimit(dangerError) && " Archive another project first."}
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              {canManage && (
                <Button
                  variant="outline"
                  disabled={archive.isPending}
                  onClick={() => archive.mutate(!archived)}
                >
                  {archived ? "Restore project" : "Archive project"}
                </Button>
              )}
              {canAdminister && (
                <Button
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (!window.confirm(`Move ${project.name} to the trash?`)) return;
                    remove.mutate(undefined, {
                      onSuccess: () => navigate(context.path("projects"), { replace: true }),
                    });
                  }}
                >
                  Delete project
                </Button>
              )}
            </div>
          </div>
        </SettingsSection>
      )}
    </div>
  );
}
