import type {
  NotificationPreferenceSummary,
  NotificationSummary,
  UnreadCount,
} from "@nexusflow/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiGetPage, apiPost, apiPut } from "../../lib/api";

// The inbox and notification settings (PRD §11.10) as React hooks. New
// notifications arrive over the live connection, which refreshes these.

export const NOTIFICATIONS_KEY = ["notifications"] as const;
const UNREAD_KEY = [...NOTIFICATIONS_KEY, "unread-count"] as const;

export type InboxTab = "all" | "unread" | "mentions";

export function useNotifications(tab: InboxTab, orgId: string) {
  return useInfiniteQuery({
    queryKey: [...NOTIFICATIONS_KEY, "list", tab, orgId],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ orgId, limit: "30" });
      if (tab === "unread") params.set("unread", "true");
      if (tab === "mentions") params.set("mentions", "true");
      if (pageParam) params.set("cursor", pageParam);
      const page = await apiGetPage<NotificationSummary[], { nextCursor: string | null }>(
        `/api/v1/notifications?${params}`,
      );
      return { items: page.data, nextCursor: page.meta.nextCursor ?? null };
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => apiGet<UnreadCount>("/api/v1/notifications/unread-count"),
    staleTime: 60_000,
  });
}

type ReadChange = { kind: "read" | "unread"; id: string } | { kind: "read-all"; orgId: string };

export function useMarkNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: ReadChange) =>
      change.kind === "read-all"
        ? apiPost("/api/v1/notifications/read-all", { orgId: change.orgId })
        : apiPost(`/api/v1/notifications/${change.id}/${change.kind}`),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}

const PREFERENCES_KEY = ["notification-preferences"] as const;

export function useNotificationPreferences() {
  return useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: () =>
      apiGet<NotificationPreferenceSummary[]>("/api/v1/users/me/notification-preferences"),
  });
}

export function useSaveNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (preferences: NotificationPreferenceSummary[]) =>
      apiPut<NotificationPreferenceSummary[]>("/api/v1/users/me/notification-preferences", {
        preferences,
      }),
    onSuccess: (saved) => queryClient.setQueryData(PREFERENCES_KEY, saved),
  });
}
