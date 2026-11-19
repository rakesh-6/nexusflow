import { Trash2 } from "lucide-react";
import { EmptyState } from "../../../components/common/EmptyState";
import { SettingsPage } from "../../../components/common/SettingsSection";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import type { WorkspaceContext } from "../../../hooks/useWorkspace";
import { errorMessage, isPlanLimit } from "../../../lib/api";
import { formatDate } from "../../organizations/labels";
import { useTrash, useUndeleteProject } from "../hooks";

// Settings › Projects (PRD §11.5.6): deleted projects wait here for 30 days.
export function TrashSettings({ context }: { context: WorkspaceContext }) {
  const slug = context.organization.slug;
  const { data: trash, isPending, isError } = useTrash(slug);
  const restore = useUndeleteProject(slug);

  return (
    <SettingsPage
      title="Projects trash"
      description="Deleted projects can be restored for 30 days. After that they are removed for good."
    >
      {isError && <Alert variant="error">The trash could not be loaded.</Alert>}
      {restore.error && (
        <Alert variant="error">
          {errorMessage(restore.error)}
          {isPlanLimit(restore.error) && " Archive a project in that workspace first."}
        </Alert>
      )}
      {isPending ? (
        <Skeleton className="h-16" />
      ) : !trash?.length ? (
        <EmptyState
          icon={Trash2}
          title="The trash is empty"
          description="Deleted projects appear here."
        />
      ) : (
        <ul className="divide-y rounded-card border bg-card px-4 shadow-sm">
          {trash.map((project) => (
            <li key={project.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {project.name}{" "}
                  <span className="text-xs text-muted-foreground">{project.key}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {project.workspace.name} · deleted {formatDate(project.deletedAt)} · restorable
                  until {formatDate(project.purgeAfter)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={restore.isPending}
                onClick={() => restore.mutate(project.id)}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SettingsPage>
  );
}
