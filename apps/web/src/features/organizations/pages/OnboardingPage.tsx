import { zodResolver } from "@hookform/resolvers/zod";
import { createOrganizationSchema, slugify } from "@nexusflow/shared";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { FormField, showServerErrors } from "../../../components/common/FormField";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { AuthCard } from "../../auth/AuthCard";
import { useCreateOrganization, useMyOrganizations } from "../hooks";

// /onboarding (PRD §11.2.1): name a new organization. It starts on the Free
// plan with a "General" workspace, and you become its owner.
export default function OnboardingPage() {
  const create = useCreateOrganization();
  const { data: organizations = [] } = useMyOrganizations();
  const navigate = useNavigate();
  const nameId = useId();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: "", slug: "" },
  });

  // Suggest the address from the name until the person types their own.
  const nameField = register("name", {
    onChange: (event: { target: { value: string } }) => {
      if (!dirtyFields.slug) setValue("slug", slugify(event.target.value));
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const created = await create.mutateAsync(values);
      navigate(`/${created.slug}/${created.workspaceSlug}/home`, { replace: true });
    } catch (error) {
      setFormError(showServerErrors(error, setError, ["name", "slug"]));
    }
  });

  const hasOrganizations = organizations.length > 0;

  return (
    <AuthCard
      title="Set up your organization"
      description="Your company or team. You can invite people and add workspaces next."
      footer={hasOrganizations ? <Link to="/">Back to my workspace</Link> : undefined}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}
        <div className="space-y-1.5">
          <label htmlFor={nameId} className="block text-sm font-medium">
            Organization name
          </label>
          <Input
            id={nameId}
            autoFocus
            autoComplete="organization"
            placeholder="Acme Studio"
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
          hint={`Your link: /${watch("slug") || "your-team"}`}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create organization"}
        </Button>
      </form>
    </AuthCard>
  );
}
