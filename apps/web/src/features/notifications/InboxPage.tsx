import {
  notificationPath,
  type NotificationSummary,
  type NotificationType,
} from "@nexusflow/shared";
import {
  AtSign,
  Bell,
  CalendarClock,
  CheckCheck,
  CircleAlert,
  FolderPlus,
  MessageSquare,
  MoveRight,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { EmptyState } from "../../components/common/EmptyState";
import { PageHeader } from "../../components/common/PageHeader";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { useWorkspace } from "../../hooks/useWorkspace";
import { cn } from "../../lib/utils";
import { formatDateTime } from "../organizations/labels";
import { useMarkNotifications, useNotifications, type InboxTab } from "./hooks";

// /:org/:ws/inbox (PRD §11.10.2): your notifications in this organization.

const ICONS: Partial<Record<NotificationType, LucideIcon>> = {
  TASK_ASSIGNED: UserPlus,
  TASK_UNASSIGNED: UserMinus,
  TASK_STATUS_CHANGED: MoveRight,
  TASK_DUE_SOON: CalendarClock,
  TASK_OVERDUE: CircleAlert,
  TASK_COMMENTED: MessageSquare,
  MENTIONED: AtSign,
  PROJECT_ADDED: FolderPlus,
  MILESTONE_DUE_SOON: CalendarClock,
  MEMBER_JOINED: UserPlus,
};

const TABS: { id: InboxTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "mentions", label: "Mentions" },
];

/** "5 min ago", "3 h ago", or the date for older ones. */
function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  return formatDateTime(iso);
}

export default function InboxPage() {
  const context = useWorkspace();
  const navigate = useNavigate();
  const [tab, setTab] = useState<InboxTab>("all");
  const list = useNotifications(tab, context?.organization.id ?? "");
  const mark = useMarkNotifications();
  if (!context) return null;

  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const open = (item: NotificationSummary) => {
    if (!item.readAt) mark.mutate({ kind: "read", id: item.id });
    const path = notificationPath(item.data);
    if (path) navigate(path);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        title="Inbox"
        description={`Your notifications in ${context.organization.name}.`}
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={mark.isPending}
            onClick={() => mark.mutate({ kind: "read-all", orgId: context.organization.id })}
          >
            <CheckCheck /> Mark all as read
          </Button>
        }
      />
      <div role="tablist" aria-label="Show" className="flex gap-1 border-b">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === item.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {list.isError && <Alert variant="error">Notifications could not be loaded.</Alert>}
      {list.isPending ? (
        <Skeleton className="h-48" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={tab === "all" ? "Nothing here yet" : "You are all caught up"}
          description="Assignments, mentions, comments and reminders show up here."
        />
      ) : (
        <ul className="divide-y rounded-card border bg-card">
          {items.map((item) => {
            const Icon = ICONS[item.type] ?? Bell;
            return (
              <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface",
                    !item.readAt && "bg-primary/10 text-primary",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <button
                  type="button"
                  onClick={() => open(item)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className={cn("text-sm", !item.readAt && "font-semibold")}>{item.title}</p>
                  {item.body && (
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{item.body}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.data.taskKey && `${item.data.taskKey} · `}
                    {ago(item.createdAt)}
                  </p>
                </button>
                <button
                  type="button"
                  aria-label={item.readAt ? "Mark as unread" : "Mark as read"}
                  title={item.readAt ? "Mark as unread" : "Mark as read"}
                  onClick={() =>
                    mark.mutate({ kind: item.readAt ? "unread" : "read", id: item.id })
                  }
                  className="mt-1.5 flex size-5 shrink-0 items-center justify-center rounded-full hover:bg-surface"
                >
                  <span
                    className={cn(
                      "size-2.5 rounded-full",
                      item.readAt ? "border border-muted-foreground" : "bg-primary",
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {list.hasNextPage && (
        <Button
          variant="outline"
          className="w-full"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {list.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
