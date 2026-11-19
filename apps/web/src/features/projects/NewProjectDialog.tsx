import { zodResolver } from "@hookform/resolvers/zod";
import {
  createProjectSchema,
  PRIORITIES,
  PROJECT_VISIBILITIES,
  suggestProjectKey,
} from "@nexusflow/shared";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { FormField, showServerErrors } from "../../components/common/FormField";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import type { WorkspaceContext } from "../../hooks/useWorkspace";
import { isPlanLimit } from "../../lib/api";
import { useCreateProject, useTeams } from "./hooks";
import { PRIORITY_LABELS } from "./labels";

const VISIBILITY_HINTS = {
  WORKSPACE: "Everyone in the workspace can see it",
  PRIVATE: "Only project members (and its team) can see it",
};

const selectClass = "h-10 w-full rounded-control border bg-card px-3 text-sm";

// "New project" (PRD §11.5.1). The key is suggested from the name until the
// person types their own.
export function NewProjectDialog({
  context,
  open,
  onOpenChange,
  defaultTeamId,
}: {
  context: WorkspaceContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTeamId?: string;
}) {
  const { organization, workspace } = context;
  const create = useCreateProject(organization.slug, workspace.slug);
  const { data: teamData } = useTeams(organization.slug, workspace.slug);
  const navigate = useNavigate();
  const ids = { name: useId(), description: useId(), team: useId(), visibility: useId() };
  const [formError, setFormError] = useState<string | null>(null);
  const [planLimited, setPlanLimited] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: "",
      key: "",
      description: "",
      priority: "MEDIUM" as const,
      visibility: "WORKSPACE" as const,
      teamId: defaultTeamId ?? null,
      startDate: null,
      endDate: null,
    },
  });
  const visibility = watch("visibility") ?? "WORKSPACE";

  const nameField = register("name", {
    onChange: (event: { target: { value: string } }) => {
      if (!dirtyFields.key)
        setValue("key", event.target.value ? suggestProjectKey(event.target.value) : "");
    },
  });
  const emptyAsNull = { setValueAs: (value: string | null) => value || null };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setPlanLimited(false);
    try {
      const project = await create.mutateAsync(values);
      reset();
      onOpenChange(false);
      navigate(context.path(`projects/${project.key}`));
    } catch (error) {
      setPlanLimited(isPlanLimit(error));
      setFormError(
        showServerErrors(error, setError, ["name", "key", "description", "teamId", "endDate"]),
      );
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New project"
        description={`In ${workspace.name}. It starts with six board columns you can change later.`}
        className="max-w-lg"
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError && (
            <Alert variant="error">
              {formError}
              {planLimited && (
                <>
                  {" "}
                  Archive a project first, or{" "}
                  <Link to="/pricing" className="font-medium underline">
                    see plans
                  </Link>
                  .
                </>
              )}
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-1.5">
              <label htmlFor={ids.name} className="block text-sm font-medium">
                Name
              </label>
              <Input
                id={ids.name}
                autoFocus
                aria-invalid={errors.name ? true : undefined}
                {...nameField}
              />
              {errors.name && (
                <p className="text-xs font-medium text-destructive">{errors.name.message}</p>
              )}
            </div>
            <FormField
              name="key"
              label="Key"
              register={register}
              error={errors.key?.message}
              hint="Task ids: KEY-1"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.description} className="block text-sm font-medium">
              Description (optional)
            </label>
            <textarea
              id={ids.description}
              rows={2}
              className="w-full rounded-control border bg-card px-3 py-2 text-sm"
              {...register("description")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={ids.team} className="block text-sm font-medium">
                Team
              </label>
              <select id={ids.team} className={selectClass} {...register("teamId", emptyAsNull)}>
                <option value="">No team</option>
                {teamData?.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              {errors.teamId && (
                <p className="text-xs font-medium text-destructive">{errors.teamId.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor={ids.visibility} className="block text-sm font-medium">
                Visibility
              </label>
              <select id={ids.visibility} className={selectClass} {...register("visibility")}>
                {PROJECT_VISIBILITIES.map((v) => (
                  <option key={v} value={v}>
                    {v === "WORKSPACE" ? "Workspace" : "Private"}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{VISIBILITY_HINTS[visibility]}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" htmlFor={`${ids.name}-priority`}>
                Priority
              </label>
              <select id={`${ids.name}-priority`} className={selectClass} {...register("priority")}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" htmlFor={`${ids.name}-start`}>
                Start
              </label>
              <Input id={`${ids.name}-start`} type="date" {...register("startDate", emptyAsNull)} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" htmlFor={`${ids.name}-end`}>
                End
              </label>
              <Input
                id={`${ids.name}-end`}
                type="date"
                aria-invalid={errors.endDate ? true : undefined}
                {...register("endDate", emptyAsNull)}
              />
            </div>
          </div>
          {errors.endDate && (
            <p className="text-xs font-medium text-destructive">{errors.endDate.message}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
