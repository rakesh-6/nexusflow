import { zodResolver } from "@hookform/resolvers/zod";
import {
  PRIORITIES,
  PROJECT_VISIBILITIES,
  SETTABLE_PROJECT_STATUSES,
  updateProjectSchema,
  type ProjectSummary,
} from "@nexusflow/shared";
import { useId, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { FormField, showServerErrors } from "../../../components/common/FormField";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import type { WorkspaceContext } from "../../../hooks/useWorkspace";
import { useProjectMembers, useTeams, useUpdateProject } from "../hooks";
import { PRIORITY_LABELS, PROJECT_STATUS_LABELS } from "../labels";

const selectClass = "h-10 w-full rounded-control border bg-card px-3 text-sm disabled:opacity-50";

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Name, key, description, status, priority, visibility, team, owner and dates. */
export function ProjectDetailsSection({
  project,
  context,
}: {
  project: ProjectSummary;
  context: WorkspaceContext;
}) {
  const slug = context.organization.slug;
  const update = useUpdateProject(slug, project.id);
  const { data: teamData } = useTeams(slug, context.workspace.slug);
  const { data: members = [] } = useProjectMembers(slug, project.id);
  const navigate = useNavigate();
  const id = useId();
  const [formError, setFormError] = useState<string | null>(null);
  const editable = project.access.canManage && project.status !== "ARCHIVED";
  const defaults = {
    name: project.name,
    key: project.key,
    description: project.description ?? "",
    status: project.status === "ARCHIVED" ? undefined : project.status,
    priority: project.priority,
    visibility: project.visibility,
    teamId: project.team?.id ?? null,
    ownerId: project.owner.id,
    startDate: project.startDate,
    endDate: project.endDate,
  };
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty, dirtyFields },
  } = useForm({ resolver: zodResolver(updateProjectSchema), defaultValues: defaults });
  const emptyAsNull = { setValueAs: (value: string | null) => value || null };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    // Send only what changed, so an unchanged locked key is never sent.
    const changed = Object.fromEntries(
      Object.entries(values).filter(([field]) => dirtyFields[field as keyof typeof dirtyFields]),
    );
    try {
      const saved = await update.mutateAsync(changed);
      reset({ ...defaults, ...changed });
      if (saved.key !== project.key)
        navigate(context.path(`projects/${saved.key}/settings`), { replace: true });
    } catch (error) {
      setFormError(
        showServerErrors(error, setError, [
          "name",
          "key",
          "description",
          "teamId",
          "ownerId",
          "endDate",
        ]),
      );
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {update.isSuccess && !isDirty && <Alert variant="success">Saved.</Alert>}
      {formError && <Alert variant="error">{formError}</Alert>}
      <fieldset disabled={!editable} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <FormField name="name" label="Name" register={register} error={errors.name?.message} />
          <div className="space-y-1.5">
            <label htmlFor={`${id}-key`} className="block text-sm font-medium">
              Key
            </label>
            <Input
              id={`${id}-key`}
              disabled={project.keyLocked}
              aria-invalid={errors.key ? true : undefined}
              {...register("key")}
            />
            <p className="text-xs text-muted-foreground">
              {errors.key?.message ??
                (project.keyLocked ? "Locked after the first task" : "Task ids use it")}
            </p>
          </div>
        </div>
        <Field label="Description" id={`${id}-description`}>
          <textarea
            id={`${id}-description`}
            rows={3}
            className="w-full rounded-control border bg-card px-3 py-2 text-sm"
            {...register("description")}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Status" id={`${id}-status`}>
            <select id={`${id}-status`} className={selectClass} {...register("status")}>
              {SETTABLE_PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority" id={`${id}-priority`}>
            <select id={`${id}-priority`} className={selectClass} {...register("priority")}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Visibility" id={`${id}-visibility`}>
            <select id={`${id}-visibility`} className={selectClass} {...register("visibility")}>
              {PROJECT_VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {v === "WORKSPACE" ? "Workspace" : "Private"}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Team" id={`${id}-team`}>
            <select id={`${id}-team`} className={selectClass} {...register("teamId", emptyAsNull)}>
              <option value="">No team</option>
              {teamData?.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Owner" id={`${id}-owner`}>
            <select id={`${id}-owner`} className={selectClass} {...register("ownerId")}>
              {/* The owner is always listed, even before the member list loads. */}
              {!members.some((m) => m.userId === project.owner.id) && (
                <option value={project.owner.id}>{project.owner.name}</option>
              )}
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" id={`${id}-start`}>
            <Input id={`${id}-start`} type="date" {...register("startDate", emptyAsNull)} />
          </Field>
          <Field label="End date" id={`${id}-end`}>
            <Input
              id={`${id}-end`}
              type="date"
              aria-invalid={errors.endDate ? true : undefined}
              {...register("endDate", emptyAsNull)}
            />
          </Field>
        </div>
        {errors.endDate && (
          <p className="text-xs font-medium text-destructive">{errors.endDate.message}</p>
        )}
      </fieldset>
      {editable && (
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Saving…" : "Save changes"}
        </Button>
      )}
    </form>
  );
}
