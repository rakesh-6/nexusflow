import { zodResolver } from "@hookform/resolvers/zod";
import { INVITABLE_ROLES, inviteFormSchema, type InvitationSummary } from "@nexusflow/shared";
import { MailCheck } from "lucide-react";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { EmptyState } from "../../../components/common/EmptyState";
import { SettingsPage, SettingsSection } from "../../../components/common/SettingsSection";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import type { WorkspaceContext } from "../../../hooks/useWorkspace";
import { errorMessage, isPlanLimit } from "../../../lib/api";
import { useInvitations, useInvite, useResendInvitation, useRevokeInvitation } from "../hooks";
import { formatDate, ORG_ROLE_LABELS } from "../labels";

const ROLE_HINTS = {
  ADMIN: "Manages members, workspaces and settings.",
  MEMBER: "Works in the workspaces they are added to.",
  GUEST: "Sees only projects shared with them.",
};

function InviteForm({ context }: { context: WorkspaceContext }) {
  const slug = context.organization.slug;
  const invite = useInvite(slug);
  const emailsId = useId();
  const roleId = useId();
  const workspaceId = useId();
  const [result, setResult] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { emails: "", role: "MEMBER" as const, workspaceId: "" },
  });
  const role = watch("role");
  const workspaces = context.workspaces.filter((ws) => !ws.archived);

  const onSubmit = handleSubmit(async (values) => {
    setResult(null);
    const answer = await invite.mutateAsync({
      invites: values.emails.map((email) => ({
        email,
        role: values.role,
        ...(values.workspaceId && values.role !== "GUEST"
          ? { workspaceId: values.workspaceId }
          : {}),
      })),
    });
    const skipped = answer.skipped.map((s) => s.email).join(", ");
    setResult(
      `Sent ${answer.invited.length} invitation${answer.invited.length === 1 ? "" : "s"}.` +
        (skipped ? ` Already members: ${skipped}.` : ""),
    );
    reset({ emails: "", role: values.role, workspaceId: values.workspaceId ?? "" });
  });

  return (
    <form
      onSubmit={(event) => void onSubmit(event).catch(() => undefined)}
      noValidate
      className="space-y-4"
    >
      {result && <Alert variant="success">{result}</Alert>}
      {invite.error && (
        <Alert variant="error">
          {errorMessage(invite.error)}
          {isPlanLimit(invite.error) && (
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
        <label htmlFor={emailsId} className="block text-sm font-medium">
          Email addresses
        </label>
        <textarea
          id={emailsId}
          rows={3}
          placeholder="priya@example.com, sam@example.com"
          aria-invalid={errors.emails ? true : undefined}
          className="w-full rounded-control border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring aria-invalid:border-destructive"
          {...register("emails")}
        />
        <p
          className={
            errors.emails ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"
          }
        >
          {errors.emails?.message ?? "Separate addresses with commas or new lines (up to 20)."}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={roleId} className="block text-sm font-medium">
            Role
          </label>
          <select
            id={roleId}
            className="h-10 w-full rounded-control border bg-card px-3 text-sm"
            {...register("role")}
          >
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ORG_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{ROLE_HINTS[role]}</p>
        </div>
        {role !== "GUEST" && (
          <div className="space-y-1.5">
            <label htmlFor={workspaceId} className="block text-sm font-medium">
              Workspace
            </label>
            <select
              id={workspaceId}
              className="h-10 w-full rounded-control border bg-card px-3 text-sm"
              {...register("workspaceId")}
            >
              <option value="">Default workspace</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : "Send invitations"}
      </Button>
    </form>
  );
}

function PendingRow({ invitation, orgSlug }: { invitation: InvitationSummary; orgSlug: string }) {
  const resend = useResendInvitation(orgSlug);
  const revoke = useRevokeInvitation(orgSlug);
  const busy = resend.isPending || revoke.isPending;
  const error = resend.error ?? revoke.error;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{invitation.email}</p>
          <p className="text-xs text-muted-foreground">
            {ORG_ROLE_LABELS[invitation.role]} · invited by {invitation.invitedBy} ·{" "}
            {invitation.expired ? (
              <span className="font-medium text-destructive">expired</span>
            ) : (
              `expires ${formatDate(invitation.expiresAt)}`
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => resend.mutate(invitation.id)}
        >
          {resend.isSuccess ? "Sent" : resend.isPending ? "Sending…" : "Resend"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => revoke.mutate(invitation.id)}
        >
          Revoke
        </Button>
      </div>
      {error && <p className="mt-1 text-xs font-medium text-destructive">{errorMessage(error)}</p>}
    </li>
  );
}

// Settings › Invitations (PRD §11.3): invite by email, resend, revoke.
export function InvitationsSettings({ context }: { context: WorkspaceContext }) {
  const slug = context.organization.slug;
  const { data: invitations, isPending } = useInvitations(slug);
  const { plan, usage } = context;
  const seats = plan.limits.maxMembers;

  return (
    <SettingsPage
      title="Invitations"
      description={
        seats === null
          ? "Invite people by email. Invitations work for 7 days."
          : `${usage.members + usage.pendingMembers} of ${seats} member seats used, counting pending invitations. Invitations work for 7 days.`
      }
    >
      <SettingsSection
        title="Invite people"
        description="Each person gets an email with a link to join."
      >
        <InviteForm context={context} />
      </SettingsSection>
      <SettingsSection title="Pending" description="Invitations nobody has answered yet.">
        {isPending ? (
          <Skeleton className="h-12" />
        ) : !invitations?.length ? (
          <EmptyState
            icon={MailCheck}
            title="No pending invitations"
            description="Everyone you invited has answered."
          />
        ) : (
          <ul className="divide-y">
            {invitations.map((invitation) => (
              <PendingRow key={invitation.id} invitation={invitation} orgSlug={slug} />
            ))}
          </ul>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}
