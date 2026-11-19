import { PROJECT_ROLES, type ProjectRole, type ProjectSummary } from "@nexusflow/shared";
import { useId, useState } from "react";
import { UserAvatar } from "../../../components/common/UserAvatar";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import type { WorkspaceContext } from "../../../hooks/useWorkspace";
import { errorMessage } from "../../../lib/api";
import { useMembers, useWorkspaceMembers } from "../../organizations/hooks";
import { useProjectMembers, useRemoveProjectMember, useSetProjectMember } from "../hooks";
import { PROJECT_ROLE_LABELS } from "../labels";

const selectClass = "h-8 rounded-control border bg-card px-2 text-sm";

/** People who could join: workspace members and the organization's guests. */
function useCandidates(context: WorkspaceContext) {
  const slug = context.organization.slug;
  const workspaceMembers = useWorkspaceMembers(slug, context.workspace.slug);
  const guests = useMembers(slug, { role: "GUEST" });
  return [
    ...(workspaceMembers.data ?? []).map((m) => ({
      userId: m.userId,
      name: m.name,
      email: m.email,
      guest: false,
    })),
    ...(guests.data?.members ?? []).map((m) => ({
      userId: m.userId,
      name: m.name,
      email: m.email,
      guest: true,
    })),
  ];
}

function AddMember({
  project,
  context,
  existing,
}: {
  project: ProjectSummary;
  context: WorkspaceContext;
  existing: Set<string>;
}) {
  const add = useSetProjectMember(context.organization.slug, project.id);
  const candidates = useCandidates(context).filter((c) => !existing.has(c.userId));
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<ProjectRole>("CONTRIBUTOR");
  const id = useId();
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Everyone in this workspace is already a member.
      </p>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate({ userId, role, isNew: true }, { onSuccess: () => setUserId("") });
      }}
    >
      <div className="min-w-48 flex-1 space-y-1.5">
        <label htmlFor={id} className="block text-sm font-medium">
          Add a person
        </label>
        <select
          id={id}
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          className="h-10 w-full rounded-control border bg-card px-3 text-sm"
        >
          <option value="">Choose…</option>
          {candidates.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.name} ({c.email}){c.guest ? " · guest" : ""}
            </option>
          ))}
        </select>
      </div>
      <select
        aria-label="Role for the new member"
        value={role}
        onChange={(event) => setRole(event.target.value as ProjectRole)}
        className="h-10 rounded-control border bg-card px-3 text-sm"
      >
        {PROJECT_ROLES.map((r) => (
          <option key={r} value={r}>
            {PROJECT_ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={!userId || add.isPending}>
        Add
      </Button>
      {add.error && (
        <p className="w-full text-xs font-medium text-destructive">{errorMessage(add.error)}</p>
      )}
    </form>
  );
}

/** Explicit project members and their roles (PRD §11.5.3). */
export function ProjectMembersSection({
  project,
  context,
}: {
  project: ProjectSummary;
  context: WorkspaceContext;
}) {
  const slug = context.organization.slug;
  const { data: members, isPending } = useProjectMembers(slug, project.id);
  const setRole = useSetProjectMember(slug, project.id);
  const remove = useRemoveProjectMember(slug, project.id);
  const editable = project.access.canManage && project.status !== "ARCHIVED";
  const error = setRole.error ?? remove.error;

  if (isPending) return <Skeleton className="h-12" />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {project.visibility === "WORKSPACE"
          ? "Everyone in the workspace can view this project. Members below can do more."
          : "Only the people below can open this project."}
        {project.team && ` Everyone in the ${project.team.name} team can contribute.`}
      </p>
      {error && <Alert variant="error">{errorMessage(error)}</Alert>}
      <ul className="divide-y">
        {members?.map((member) => (
          <li key={member.userId} className="flex flex-wrap items-center gap-3 py-3">
            <UserAvatar name={member.name} avatarUrl={member.avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {member.name}{" "}
                {member.isOwner && <span className="text-muted-foreground">(owner)</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
            </div>
            {editable && !member.isOwner ? (
              <>
                <select
                  aria-label={`Project role of ${member.name}`}
                  value={member.role}
                  disabled={setRole.isPending}
                  onChange={(event) =>
                    setRole.mutate({
                      userId: member.userId,
                      role: event.target.value as ProjectRole,
                      isNew: false,
                    })
                  }
                  className={selectClass}
                >
                  {PROJECT_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {PROJECT_ROLE_LABELS[r]}
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
                {PROJECT_ROLE_LABELS[member.role]}
              </span>
            )}
          </li>
        ))}
      </ul>
      {editable && members && (
        <AddMember
          project={project}
          context={context}
          existing={new Set(members.map((m) => m.userId))}
        />
      )}
    </div>
  );
}
