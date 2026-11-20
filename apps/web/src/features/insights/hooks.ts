import type { Analytics, SearchResults } from "@nexusflow/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";

// Dashboard numbers and search (PRD §11.12, §11.13) as React hooks.

const org = (orgSlug: string) => `/api/v1/orgs/${encodeURIComponent(orgSlug)}`;

export interface AnalyticsFilters {
  from?: string;
  to?: string;
  projectId?: string;
}

export function useAnalytics(orgSlug: string, workspaceSlug: string, filters: AnalyticsFilters) {
  const params = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => !!entry[1]),
  );
  return useQuery({
    queryKey: ["org", orgSlug, "analytics", workspaceSlug, filters],
    queryFn: () =>
      apiGet<Analytics>(
        `${org(orgSlug)}/workspaces/${encodeURIComponent(workspaceSlug)}/analytics?${params}`,
      ),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useSearch(orgSlug: string, q: string, workspaceId?: string) {
  const params = new URLSearchParams({ q, limit: "8", ...(workspaceId ? { workspaceId } : {}) });
  return useQuery({
    queryKey: ["org", orgSlug, "search", q, workspaceId],
    queryFn: () => apiGet<SearchResults>(`${org(orgSlug)}/search?${params}`),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
  });
}
