import { zodResolver } from "@hookform/resolvers/zod";
import { createOrganizationSchema } from "@nexusflow/shared";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { FormField, showServerErrors } from "../../../components/common/FormField";
import { SettingsPage, SettingsSection } from "../../../components/common/SettingsSection";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import type { WorkspaceContext } from "../../../hooks/useWorkspace";
import { ApiError, errorMessage } from "../../../lib/api";
import {
  useDeleteOrganization,
  useLeaveOrganization,
  useMembers,
  useTransferOwnership,
  useUpdateOrganization,
} from "../hooks";
import { ORG_ROLE_LABELS } from "../labels";

function DetailsForm({ context }: { context: WorkspaceContext }) {
  const { organization } = context;
  const update = useUpdateOrganization(organization.slug);
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: organization.name, slug: organization.slug },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await update.mutateAsync(values);
      reset(saved);
      // A new address means new links: move this page there too.
      if (saved.slug !== organization.slug) {
        navigate(`/${saved.slug}/settings/org/general`, { replace: true });
      }
    } catch (error) {
      setFormError(showServerErrors(error, setError, ["name", "slug"]));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-sm space-y-4">
      {update.isSuccess && !isDirty && <Alert variant="success">Saved.</Alert>}
      {formError && <Alert variant="error">{formError}</Alert>}
      <FormField name="name" label="Name" register={register} error={errors.name?.message} />
      <FormField
        name="slug"
        label="Address"
        register={register}
        error={errors.slug?.message}
        hint="Changing it changes every link to this organization."
      />
      <Button type="submit" disabled={isSubmitting || !isDirty}>
        {isSubmitting ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

function TransferOwnership({ context }: { context: WorkspaceContext }) {
  const slug = context.organization.slug;
  const { data } = useMembers(slug, { role: "ADMIN" });
  const transfer = useTransferOwnership(slug);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const selectId = useId();
  const passwordId = useId();
  const admins = data?.members ?? [];

  if (admins.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Only an admin can become the owner. Make someone an admin on the Members page first.
      </p>
    );
  }

  return (
    <form
      className="max-w-sm space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        transfer.mutate({ userId, password }, { onSuccess: () => setPassword("") });
      }}
    >
      {transfer.isSuccess && (
        <Alert variant="success">Ownership transferred. You are now an admin.</Alert>
      )}
      {transfer.error && <Alert variant="error">{errorMessage(transfer.error)}</Alert>}
      <div className="space-y-1.5">
        <label htmlFor={selectId} className="block text-sm font-medium">
          New owner
        </label>
        <select
          id={selectId}
          required
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          className="h-10 w-full rounded-control border bg-card px-3 text-sm"
        >
          <option value="">Choose an admin…</option>
          {admins.map((admin) => (
            <option key={admin.userId} value={admin.userId}>
              {admin.name} ({admin.email})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={passwordId} className="block text-sm font-medium">
          Your password
        </label>
        <Input
          id={passwordId}
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <Button type="submit" variant="outline" disabled={transfer.isPending || !userId}>
        {transfer.isPending ? "Transferring…" : "Transfer ownership"}
      </Button>
    </form>
  );
}

function DeleteOrganization({ context }: { context: WorkspaceContext }) {
  const { organization } = context;
  const remove = useDeleteOrganization(organization.slug);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [password, setPassword] = useState("");
  const confirmId = useId();
  const passwordId = useId();

  if (!open) {
    return (
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete organization…
      </Button>
    );
  }

  const wrongPassword =
    remove.error instanceof ApiError && remove.error.code === "INVALID_CREDENTIALS";

  return (
    <form
      className="max-w-sm space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        remove.mutate(
          { confirmSlug, password },
          { onSuccess: () => navigate("/", { replace: true }) },
        );
      }}
    >
      {remove.error && (
        <Alert variant="error">
          {wrongPassword ? "That password is not correct." : errorMessage(remove.error)}
        </Alert>
      )}
      <div className="space-y-1.5">
        <label htmlFor={confirmId} className="block text-sm font-medium">
          Type <strong>{organization.slug}</strong> to confirm
        </label>
        <Input
          id={confirmId}
          autoComplete="off"
          value={confirmSlug}
          onChange={(event) => setConfirmSlug(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={passwordId} className="block text-sm font-medium">
          Your password
        </label>
        <Input
          id={passwordId}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="destructive"
          disabled={remove.isPending || confirmSlug !== organization.slug || !password}
        >
          {remove.isPending ? "Deleting…" : "Delete forever"}
        </Button>
        <Button variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function LeaveOrganization({ context }: { context: WorkspaceContext }) {
  const leave = useLeaveOrganization(context.organization.slug);
  const navigate = useNavigate();
  return (
    <div className="space-y-3">
      {leave.error && <Alert variant="error">{errorMessage(leave.error)}</Alert>}
      <Button
        variant="destructive"
        disabled={leave.isPending}
        onClick={() => {
          if (window.confirm(`Leave ${context.organization.name}? You will lose access at once.`)) {
            leave.mutate(undefined, { onSuccess: () => navigate("/", { replace: true }) });
          }
        }}
      >
        {leave.isPending ? "Leaving…" : "Leave organization"}
      </Button>
    </div>
  );
}

// Settings › Organization (PRD §11.2.2).
export function OrgGeneralSettings({ context }: { context: WorkspaceContext }) {
  const { organization, role, can } = context;
  return (
    <SettingsPage
      title="Organization"
      description={`Your role: ${ORG_ROLE_LABELS[role]} · ${organization.planTier} plan`}
    >
      <SettingsSection title="Details" description="The organization's name and web address.">
        {can("org:update") ? (
          <DetailsForm context={context} />
        ) : (
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="font-medium">Name</dt>
              <dd className="text-muted-foreground">{organization.name}</dd>
            </div>
            <div>
              <dt className="font-medium">Address</dt>
              <dd className="text-muted-foreground">/{organization.slug}</dd>
            </div>
          </dl>
        )}
      </SettingsSection>

      {can("org:transfer") && (
        <SettingsSection
          title="Transfer ownership"
          description="Make an admin the owner. You stay in the organization as an admin."
        >
          <TransferOwnership context={context} />
        </SettingsSection>
      )}

      {role !== "OWNER" && (
        <SettingsSection
          title="Leave organization"
          description="You lose access to its workspaces and projects. Your work stays."
          danger
        >
          <LeaveOrganization context={context} />
        </SettingsSection>
      )}

      {can("org:delete") && (
        <SettingsSection
          title="Delete organization"
          description="Everyone loses access at once, and its data is removed for good after 7 days."
          danger
        >
          <DeleteOrganization context={context} />
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
