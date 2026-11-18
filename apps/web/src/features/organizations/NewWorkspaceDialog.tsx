import { zodResolver } from "@hookform/resolvers/zod";
import { createWorkspaceSchema, slugify } from "@nexusflow/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { FormField, showServerErrors } from "../../components/common/FormField";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { isPlanLimit } from "../../lib/api";
import { useCreateWorkspace } from "./hooks";

// "New workspace" from the switcher (PRD §11.2.4). The address is suggested
// from the name until the person edits it themselves.
export function NewWorkspaceDialog({
  orgSlug,
  open,
  onOpenChange,
}: {
  orgSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateWorkspace(orgSlug);
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [planLimited, setPlanLimited] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    reset,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { name: "", slug: "", description: "" },
  });

  const nameField = register("name", {
    onChange: (event: { target: { value: string } }) => {
      if (!dirtyFields.slug) setValue("slug", slugify(event.target.value));
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setPlanLimited(false);
    try {
      const workspace = await create.mutateAsync(values);
      reset();
      onOpenChange(false);
      navigate(`/${orgSlug}/${workspace.slug}/home`);
    } catch (error) {
      setPlanLimited(isPlanLimit(error));
      setFormError(showServerErrors(error, setError, ["name", "slug", "description"]));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New workspace"
        description="A separate space for a department or client, with its own teams and projects."
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError && (
            <Alert variant="error">
              {formError}
              {planLimited && (
                <>
                  {" "}
                  <Link to="/pricing" className="font-medium underline">
                    See plans
                  </Link>
                </>
              )}
            </Alert>
          )}
          <div className="space-y-1.5">
            <label htmlFor="new-workspace-name" className="block text-sm font-medium">
              Name
            </label>
            <Input
              id="new-workspace-name"
              autoFocus
              aria-invalid={errors.name ? true : undefined}
              {...nameField}
            />
            {errors.name && (
              <p className="text-xs font-medium text-destructive">{errors.name.message}</p>
            )}
          </div>
          <FormField
            name="slug"
            label="Address"
            register={register}
            error={errors.slug?.message}
            hint={`/${orgSlug}/your-address`}
          />
          <FormField
            name="description"
            label="Description (optional)"
            register={register}
            error={errors.description?.message}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create workspace"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
