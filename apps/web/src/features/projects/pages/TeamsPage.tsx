import { zodResolver } from "@hookform/resolvers/zod";
import { createTeamSchema, slugify, type TeamSummary } from "@nexusflow/shared";
import { Plus, Users } from "lucide-react";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { EmptyState } from "../../../components/common/EmptyState";
import { FormField, showServerErrors } from "../../../components/common/FormField";
import { PageHeader } from "../../../components/common/PageHeader";
import { UserAvatar } from "../../../components/common/UserAvatar";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Skeleton } from "../../../components/ui/skeleton";
import { useWorkspace, type WorkspaceContext } from "../../../hooks/useWorkspace";
import { useWorkspaceMembers } from "../../organizations/hooks";
import { useCreateTeam, useTeams } from "../hooks";

function NewTeamDialog({
  context,
  open,
  onOpenChange,
}: {
  context: WorkspaceContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { organization, workspace } = context;
  const create = useCreateTeam(organization.slug, workspace.slug);
  const { data: people = [] } = useWorkspaceMembers(organization.slug, workspace.slug);
  const navigate = useNavigate();
  const ids = { name: useId(), lead: useId() };
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    reset,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm({
    resolver: zodResolver(createTeamSchema),
    defaultValues: { name: "", slug: "", description: "", leadId: "" },
  });
  const nameField = register("name", {
    onChange: (event: { target: { value: string } }) => {
      if (!dirtyFields.slug) setValue("slug", slugify(event.target.value));
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const team = await create.mutateAsync(values);
      reset();
      onOpenChange(false);
      navigate(context.path(`teams/${team.slug}`));
    } catch (error) {
      setFormError(showServerErrors(error, setError, ["name", "slug", "description", "leadId"]));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New team"
        description="A group of people who work together on projects."
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}
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
          <FormField name="slug" label="Address" register={register} error={errors.slug?.message} />
          <FormField
            name="description"
            label="Description (optional)"
            register={register}
            error={errors.description?.message}
          />
          <div className="space-y-1.5">
            <label htmlFor={ids.lead} className="block text-sm font-medium">
              Team lead
            </label>
            <select
              id={ids.lead}
              className="h-10 w-full rounded-control border bg-card px-3 text-sm"
              aria-invalid={errors.leadId ? true : undefined}
              {...register("leadId")}
            >
              <option value="">Choose a workspace member…</option>
              {people.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.name} ({person.email})
                </option>
              ))}
            </select>
            {errors.leadId && (
              <p className="text-xs font-medium text-destructive">{errors.leadId.message}</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create team"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TeamCard({ team, context }: { team: TeamSummary; context: WorkspaceContext }) {
  return (
    <li>
      <Link
        to={context.path(`teams/${team.slug}`)}
        className="flex h-full flex-col gap-3 rounded-card border bg-card p-4 shadow-sm transition-colors hover:bg-surface"
      >
        <div>
          <p className="font-medium">{team.name}</p>
          {team.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{team.description}</p>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {team.memberCount} member{team.memberCount === 1 ? "" : "s"} · {team.projectCount}{" "}
            project
            {team.projectCount === 1 ? "" : "s"}
          </span>
          <span className="flex -space-x-1.5">
            {team.leads.slice(0, 3).map((lead) => (
              <UserAvatar
                key={lead.id}
                name={lead.name}
                avatarUrl={lead.avatarUrl}
                className="size-6 ring-2 ring-card"
              />
            ))}
          </span>
        </div>
        {team.myRole && (
          <span className="w-fit rounded-full border bg-surface px-2 py-0.5 text-xs font-medium">
            {team.myRole === "LEAD" ? "You lead this team" : "You're a member"}
          </span>
        )}
      </Link>
    </li>
  );
}

// /:org/:ws/teams (PRD §11.4).
export default function TeamsPage() {
  const context = useWorkspace();
  const [params, setParams] = useSearchParams();
  const teams = useTeams(context?.organization.slug ?? "", context?.workspace.slug ?? "");
  if (!context) return null;
  const creating = params.get("new") === "1";
  const setCreating = (open: boolean) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (open) next.set("new", "1");
      else next.delete("new");
      return next;
    });
  const canCreate = teams.data?.canCreate ?? false;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader
        title="Teams"
        description={`Groups of people in ${context.workspace.name}. Team members can work on every team project.`}
        actions={
          canCreate && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New team
            </Button>
          )
        }
      />
      {teams.isError && <Alert variant="error">Teams could not be loaded.</Alert>}
      {teams.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : teams.data?.teams.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.data.teams.map((team) => (
            <TeamCard key={team.id} team={team} context={context} />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Users}
          title="No teams yet"
          description={
            canCreate ? "Create a team and give it a lead." : "Workspace admins create teams."
          }
          action={
            canCreate && (
              <Button onClick={() => setCreating(true)}>
                <Plus /> New team
              </Button>
            )
          }
        />
      )}
      {canCreate && <NewTeamDialog context={context} open={creating} onOpenChange={setCreating} />}
    </div>
  );
}
