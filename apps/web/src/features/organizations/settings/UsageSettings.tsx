import { Link } from "react-router";
import { SettingsPage, SettingsSection } from "../../../components/common/SettingsSection";
import { Alert } from "../../../components/ui/alert";
import { Skeleton } from "../../../components/ui/skeleton";
import type { WorkspaceContext } from "../../../hooks/useWorkspace";
import { cn } from "../../../lib/utils";
import { useUsage } from "../hooks";
import { formatBytes } from "../labels";

function UsageBar({
  label,
  used,
  max,
  format = String,
  note,
}: {
  label: string;
  used: number;
  max: number | null;
  format?: (value: number) => string;
  note?: string;
}) {
  const percent = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {format(used)} / {max === null ? "Unlimited" : format(max)}
        </span>
      </div>
      {max !== null && (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 overflow-hidden rounded-full bg-surface"
        >
          <div
            className={cn(
              "h-full rounded-full",
              percent >= 100 ? "bg-destructive" : percent >= 80 ? "bg-warning" : "bg-primary",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

// Settings › Usage (PRD §23.2): what the organization uses against its plan.
export function UsageSettings({ context }: { context: WorkspaceContext }) {
  const { data: usage, isPending, isError } = useUsage(context.organization.slug);
  const { limits, tier } = context.plan;

  return (
    <SettingsPage title="Usage" description={`The ${tier} plan's limits and what you use.`}>
      {isError && <Alert variant="error">Usage could not be loaded.</Alert>}
      <SettingsSection
        title="This organization"
        description="Pending invitations count as members until they are answered."
      >
        {isPending || !usage ? (
          <div className="space-y-4">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : (
          <div className="space-y-5">
            <UsageBar label="Workspaces" used={usage.workspaces} max={limits.maxWorkspaces} />
            <UsageBar
              label="Members"
              used={usage.members + usage.pendingMembers}
              max={limits.maxMembers}
              note={`${usage.members} joined, ${usage.pendingMembers} invited`}
            />
            <UsageBar
              label="Guests"
              used={usage.guests + usage.pendingGuests}
              max={limits.maxGuests}
              note={`${usage.guests} joined, ${usage.pendingGuests} invited`}
            />
            <UsageBar
              label="File storage"
              used={usage.storageBytes}
              max={limits.maxStorageBytes}
              format={formatBytes}
            />
          </div>
        )}
      </SettingsSection>
      <p className="text-sm text-muted-foreground">
        Need more?{" "}
        <Link to="/pricing" className="font-medium text-primary hover:underline">
          Compare plans
        </Link>
        {context.can("billing:manage") && (
          <>
            {" "}
            or{" "}
            <Link
              to={`/${context.organization.slug}/settings/org/billing`}
              className="font-medium text-primary hover:underline"
            >
              upgrade
            </Link>
          </>
        )}
        .
      </p>
    </SettingsPage>
  );
}
