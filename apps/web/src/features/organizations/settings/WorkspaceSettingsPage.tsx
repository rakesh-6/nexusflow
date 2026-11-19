import { zodResolver } from "@hookform/resolvers/zod";
import {
  createWorkspaceSchema,
  WORKSPACE_ROLES,
  type WorkspaceMember,
  type WorkspaceRole,
} from "@nexusflow/shared";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { FormField, showServerErrors } from "../../../components/common/FormField";
import { SettingsPage, SettingsSection } from "../../../components/common/SettingsSection";
import { UserAvatar } from "../../../components/common/UserAvatar";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { useWorkspace, type WorkspaceContext } from "../../../hooks/useWorkspace";
import { errorMessage, isPlanLimit } from "../../../lib/api";
import { useCurrentUser } from "../../auth/hooks";
import { LabelsSection } from "../../projects/settings/LabelsSection";
import {
  useArchiveWorkspace,
  useDeleteWorkspace,
  useMembers,
  useRemoveWorkspaceMember,
  useSetWorkspaceMember,
  useUpdateWorkspace,
  useWorkspaceMembers,
} from "../hooks";
import { WORKSPACE_ROLE_LABELS } from "../labels";

function DetailsForm({ context }: { context: WorkspaceContext }) {
  const { organization, workspace } = context;
  const update = useUpdateWorkspace(organization.slug, workspace.slug);
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: {
      name: workspace.name,
      slug: workspace.slug,
      description: workspace.description ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await update.mutateAsync(values);
      reset({ name: saved.name, slug: saved.slug, description: saved.description ?? "" });
      if (saved.slug !== workspace.slug) {
        navigate(`/${organization.slug}/${saved.slug}/settings`, { replace: true });
      }
    } catch (error) {
      setFormError(showServerErrors(error, setError, ["name", "slug", "description"]));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-sm space-y-4">
      {update.isSuccess && !isDirty && <Alert variant="success">Saved.</Alert>}
      {formError && <Alert variant="error">{formError}</Alert>}
      <FormField name="name" label="Name" register={register} error={errors.name?.message} />
      <FormField name="slug" label="Address" register={register} error={errors.slug?.message} />
      <FormField
        name="description"
        label="Description"
        register={register}
        error={errors.description?.message}
      />
      <Button type="submit" disabled={isSubmitting || !isDirty}>
        {isSubmitting ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

function AddMember({
  context,
  current,
}: {
  context: WorkspaceContext;
  current: WorkspaceMember[];
}) {
  const { organization, workspace } = context;
  const { data } = useMembers(organization.slug);
  const add = useSetWorkspaceMember(organization.slug, workspace.slug);
  const [userId, setUserId] = useState("");
  const selectId = useId();
  // Guests never join whole workspaces (PRD §12.1).
  const candidates = (data?.members ?? []).filter(
    (member) => member.role !== "GUEST" && !current.some((m) => m.userId === member.userId),
  );
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Everyone in the organization is already here. Invite more people from the organization
        settings.
      </p>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate(
          { userId, role: "WORKSPACE_MEMBER", isNew: true },
          { onSuccess: () => setUserId("") },
        );
      }}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <label htmlFor={selectId} className="block text-sm font-medium">
          Add someone from {organization.name}
        </label>
        <select
          id={selectId}
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          className="h-10 w-full rounded-control border bg-card px-3 text-sm"
        >
          <option value="">Choose a person…</option>
          {candidates.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name} ({member.email})
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={!userId || add.isPending}>
        {add.isPending ? "Adding…" : "Add"}
      </Button>
      {add.error && (
        <p className="w-full text-xs font-medium text-destructive">{errorMessage(add.error)}</p>
      )}
    </form>
  );
}

function MembersSection({ context, canManage }: { context: WorkspaceContext; canManage: boolean }) {
  const { organization, workspace } = context;
  const { data: members, isPending } = useWorkspaceMembers(organization.slug, workspace.slug);
  const setRole = useSetWorkspaceMember(organization.slug, workspace.slug);
  const remove = useRemoveWorkspaceMember(organization.slug, workspace.slug);
  const { data: me } = useCurrentUser();
  const error = setRole.error ?? remove.error;

  if (isPending) return <Skeleton className="h-12" />;
  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{errorMessage(error)}</Alert>}
      <ul className="divide-y">
        {members?.map((member) => (
          <li key={member.userId} className="flex flex-wrap items-center gap-3 py-3">
            <UserAvatar name={member.name} avatarUrl={member.avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {member.name}{" "}
                {member.userId === me?.id && <span className="text-muted-foreground">(you)</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
            </div>
            {canManage && member.userId !== me?.id ? (
              <>
                <select
                  aria-label={`Workspace role of ${member.name}`}
                  value={member.role}
                  disabled={setRole.isPending}
                  onChange={(event) =>
                    setRole.mutate({
                      userId: member.userId,
                      role: event.target.value as WorkspaceRole,
                      isNew: false,
                    })
                  }
                  className="h-8 rounded-control border bg-card px-2 text-sm"
                >
                  {WORKSPACE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {WORKSPACE_ROLE_LABELS[role]}
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
                {WORKSPACE_ROLE_LABELS[member.role]}
              </span>
            )}
          </li>
        ))}
      </ul>
      {canManage && members && <AddMember context={context} current={members} />}
    </div>
  );
}

function DangerZone({ context }: { context: WorkspaceContext }) {
  const { organization, workspace } = context;
  const archive = useArchiveWorkspace(organization.slug, workspace.slug);
  const remove = useDeleteWorkspace(organization.slug, workspace.slug);
  const navigate = useNavigate();
  const error = archive.error ?? remove.error;

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="error">
          {errorMessage(error)}
          {isPlanLimit(error) && " Archive another workspace first, or upgrade your plan."}
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={archive.isPending}
          onClick={() => archive.mutate(!workspace.archived)}
        >
          {workspace.archived ? "Restore workspace" : "Archive workspace"}
        </Button>
        <Button
          variant="destructive"
          disabled={remove.isPending}
          onClick={() => {
            if (!window.confirm(`Delete ${workspace.name}? This cannot be undone.`)) return;
            remove.mutate(undefined, { onSuccess: () => navigate("/", { replace: true }) });
          }}
        >
          {remove.isPending ? "Deleting…" : "Delete workspace"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The last active workspace can be neither archived nor deleted. A workspace with projects
        cannot be deleted.
      </p>
    </div>
  );
}

// /:org/:ws/settings (PRD §11.2.4): rename, members, archive and delete.
export default function WorkspaceSettingsPage() {
  const context = useWorkspace();
  if (!context) return null;
  const { workspace, can } = context;
  // Organization owners and admins count as workspace admins everywhere.
  const canManage = workspace.role === "WORKSPACE_ADMIN";

  return (
    <SettingsPage title="Workspace settings" description={workspace.name}>
      {workspace.archived && (
        <Alert variant="info">This workspace is archived. Restore it to work in it again.</Alert>
      )}
      <SettingsSection title="Details" description="The workspace's name, address and description.">
        {canManage ? (
          <DetailsForm key={workspace.id} context={context} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Only workspace admins can change these details.
          </p>
        )}
      </SettingsSection>
      <SettingsSection title="Members" description="People who can open this workspace.">
        <MembersSection context={context} canManage={canManage} />
      </SettingsSection>
      <SettingsSection title="Labels" description="Tags shared by every project in this workspace.">
        <LabelsSection context={context} />
      </SettingsSection>
      {can("workspace:create") && (
        <SettingsSection
          title="Archive or delete"
          description="Archived workspaces are hidden from members and can be restored."
          danger
        >
          <DangerZone context={context} />
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
