import {
  canChangeRole,
  canRemoveMember,
  ORG_ROLES,
  type OrgMember,
  type OrgRole,
} from "@nexusflow/shared";
import { Search, Users } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Link } from "react-router";
import { EmptyState } from "../../../components/common/EmptyState";
import { SettingsPage } from "../../../components/common/SettingsSection";
import { UserAvatar } from "../../../components/common/UserAvatar";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Skeleton } from "../../../components/ui/skeleton";
import type { WorkspaceContext } from "../../../hooks/useWorkspace";
import { errorMessage } from "../../../lib/api";
import { useCurrentUser } from "../../auth/hooks";
import { useChangeMemberRole, useMembers, useRemoveMember } from "../hooks";
import { formatDate, ORG_ROLE_LABELS } from "../labels";

function MemberRow({
  member,
  myRole,
  isMe,
  orgSlug,
  onError,
}: {
  member: OrgMember;
  myRole: OrgRole;
  isMe: boolean;
  orgSlug: string;
  onError: (message: string | null) => void;
}) {
  const changeRole = useChangeMemberRole(orgSlug);
  const remove = useRemoveMember(orgSlug);
  // The same rules the API applies (PRD §12.2): only offer what will work.
  const roleChoices = ORG_ROLES.filter(
    (role) => role === member.role || canChangeRole(myRole, member.role, role, isMe),
  );
  const canRemove = canRemoveMember(myRole, member.role, isMe);
  const busy = changeRole.isPending || remove.isPending;

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <UserAvatar name={member.name} avatarUrl={member.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {member.name} {isMe && <span className="text-muted-foreground">(you)</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {member.email} · joined {formatDate(member.joinedAt)}
        </p>
      </div>
      {roleChoices.length > 1 ? (
        <select
          aria-label={`Role of ${member.name}`}
          value={member.role}
          disabled={busy}
          onChange={(event) => {
            onError(null);
            changeRole.mutate(
              { userId: member.userId, role: event.target.value as OrgRole },
              { onError: (error) => onError(errorMessage(error)) },
            );
          }}
          className="h-8 rounded-control border bg-card px-2 text-sm"
        >
          {roleChoices.map((role) => (
            <option key={role} value={role}>
              {ORG_ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      ) : (
        <span className="rounded-full border bg-surface px-2 py-0.5 text-xs font-medium">
          {ORG_ROLE_LABELS[member.role]}
        </span>
      )}
      {canRemove && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            if (!window.confirm(`Remove ${member.name}? Their access ends at once.`)) return;
            onError(null);
            remove.mutate(member.userId, { onError: (error) => onError(errorMessage(error)) });
          }}
        >
          Remove
        </Button>
      )}
    </li>
  );
}

// Settings › Members (PRD §11.3): search, change roles, remove people.
export function MembersSettings({ context }: { context: WorkspaceContext }) {
  const { organization, role, can, plan, usage } = context;
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim());
  const { data, isPending, isError } = useMembers(organization.slug, q ? { q } : {});
  const { data: me } = useCurrentUser();
  const [actionError, setActionError] = useState<string | null>(null);
  const seatLimit = plan.limits.maxMembers;

  return (
    <SettingsPage
      title="Members"
      description={
        seatLimit === null
          ? `${usage.members} members`
          : `${usage.members} of ${seatLimit} member seats used on the ${plan.tier} plan`
      }
      actions={
        can("members:invite") && (
          <Button asChild>
            <Link to={context.settingsPath("org/invitations")}>Invite people</Link>
          </Button>
        )
      }
    >
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Search members"
          placeholder="Search by name or email"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9"
        />
      </div>
      {actionError && <Alert variant="error">{actionError}</Alert>}
      {isError && <Alert variant="error">The member list could not be loaded.</Alert>}
      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : data && data.members.length === 0 ? (
        <EmptyState icon={Users} title="No one found" description="Try another name or email." />
      ) : (
        <ul className="divide-y rounded-card border bg-card px-4 shadow-sm">
          {data?.members.map((member) => (
            <MemberRow
              key={member.userId}
              member={member}
              myRole={role}
              isMe={member.userId === me?.id}
              orgSlug={organization.slug}
              onError={setActionError}
            />
          ))}
        </ul>
      )}
    </SettingsPage>
  );
}
