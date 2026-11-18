import { ScrollText } from "lucide-react";
import { useId, useState } from "react";
import { EmptyState } from "../../../components/common/EmptyState";
import { SettingsPage } from "../../../components/common/SettingsSection";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import type { WorkspaceContext } from "../../../hooks/useWorkspace";
import { useAuditLog } from "../hooks";
import { formatDateTime } from "../labels";

// The actions the API records in the audit log (category SECURITY or BILLING).
const ACTIONS: Record<string, string> = {
  "org.created": "Organization created",
  "org.settings_changed": "Settings changed",
  "org.ownership_transferred": "Ownership transferred",
  "org.deleted": "Organization deleted",
  "member.invited": "Person invited",
  "member.invitation_revoked": "Invitation revoked",
  "member.joined": "Person joined",
  "member.role_changed": "Role changed",
  "member.removed": "Person removed",
  "member.left": "Person left",
};

/** "email: priya@example.com, role: MEMBER" from the row's details. */
function details(metadata: unknown, changes: unknown): string {
  const parts: string[] = [];
  if (Array.isArray(changes)) {
    for (const change of changes as { field: string; from?: unknown; to?: unknown }[]) {
      parts.push(`${change.field}: ${String(change.from ?? "—")} → ${String(change.to ?? "—")}`);
    }
  }
  if (metadata && typeof metadata === "object") {
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === "string" || typeof value === "number") parts.push(`${key}: ${value}`);
    }
  }
  return parts.join(" · ");
}

// Settings › Audit log (PRD §11.17): who did what and when.
export function AuditLogSettings({ context }: { context: WorkspaceContext }) {
  const [action, setAction] = useState("");
  const filterId = useId();
  const log = useAuditLog(context.organization.slug, action);
  const rows = log.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <SettingsPage title="Audit log" description="Security and billing events, newest first.">
      <div className="flex items-center gap-2">
        <label htmlFor={filterId} className="text-sm font-medium">
          Show
        </label>
        <select
          id={filterId}
          value={action}
          onChange={(event) => setAction(event.target.value)}
          className="h-9 rounded-control border bg-card px-3 text-sm"
        >
          <option value="">All events</option>
          {Object.entries(ACTIONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {log.isError && <Alert variant="error">The audit log could not be loaded.</Alert>}
      {log.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="Nothing here yet" description="No matching events." />
      ) : (
        <ul className="divide-y rounded-card border bg-card px-4 shadow-sm">
          {rows.map((row) => (
            <li key={row.id} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm">
                  <span className="font-medium">{row.actorName}</span>{" "}
                  <span className="text-muted-foreground">·</span>{" "}
                  {ACTIONS[row.action] ?? row.action}
                </p>
                <time dateTime={row.createdAt} className="text-xs text-muted-foreground">
                  {formatDateTime(row.createdAt)}
                </time>
              </div>
              {(() => {
                const text = details(row.metadata, row.changes);
                return text ? (
                  <p className="mt-0.5 break-all text-xs text-muted-foreground">{text}</p>
                ) : null;
              })()}
            </li>
          ))}
        </ul>
      )}
      {log.hasNextPage && (
        <Button
          variant="outline"
          onClick={() => void log.fetchNextPage()}
          disabled={log.isFetchingNextPage}
        >
          {log.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}
    </SettingsPage>
  );
}
