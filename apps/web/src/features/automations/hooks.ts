import type {
  AutomationExecutionSummary,
  AutomationSummary,
  CreateAutomationInput,
  DryRunResult,
  Recipe,
} from "@nexusflow/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api";

// Automation rules (PRD §11.15), cached under ["org", slug, "automations", …].

const orgPath = (orgSlug: string) => `/api/v1/orgs/${encodeURIComponent(orgSlug)}`;
const listKey = (orgSlug: string, workspaceSlug: string) =>
  ["org", orgSlug, "automations", workspaceSlug] as const;

export function useAutomations(orgSlug: string, workspaceSlug: string) {
  return useQuery({
    queryKey: listKey(orgSlug, workspaceSlug),
    queryFn: () =>
      apiGet<AutomationSummary[]>(
        `${orgPath(orgSlug)}/workspaces/${encodeURIComponent(workspaceSlug)}/automations`,
      ),
  });
}

export function useRecipes(orgSlug: string) {
  return useQuery({
    queryKey: ["org", orgSlug, "automations", "recipes"],
    queryFn: () => apiGet<Recipe[]>(`${orgPath(orgSlug)}/automations/recipes`),
    staleTime: Infinity,
  });
}

function useRefresh(orgSlug: string) {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ["org", orgSlug, "automations"] });
}

export function useCreateAutomation(orgSlug: string, workspaceSlug: string) {
  const refresh = useRefresh(orgSlug);
  return useMutation({
    mutationFn: (input: CreateAutomationInput) =>
      apiPost<AutomationSummary>(
        `${orgPath(orgSlug)}/workspaces/${encodeURIComponent(workspaceSlug)}/automations`,
        input,
      ),
    onSuccess: refresh,
  });
}

export function useToggleAutomation(orgSlug: string) {
  const refresh = useRefresh(orgSlug);
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<AutomationSummary>(`${orgPath(orgSlug)}/automations/${id}/toggle`),
    onSuccess: refresh,
  });
}

export function useUpdateAutomation(orgSlug: string) {
  const refresh = useRefresh(orgSlug);
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<CreateAutomationInput> & { id: string }) =>
      apiPatch<AutomationSummary>(`${orgPath(orgSlug)}/automations/${id}`, input),
    onSuccess: refresh,
  });
}

export function useDeleteAutomation(orgSlug: string) {
  const refresh = useRefresh(orgSlug);
  return useMutation({
    mutationFn: (id: string) => apiDelete(`${orgPath(orgSlug)}/automations/${id}`),
    onSuccess: refresh,
  });
}

export function useExecutions(orgSlug: string, automationId: string | null) {
  return useQuery({
    queryKey: ["org", orgSlug, "automations", "executions", automationId],
    queryFn: () =>
      apiGet<AutomationExecutionSummary[]>(
        `${orgPath(orgSlug)}/automations/${automationId}/executions`,
      ),
    enabled: !!automationId,
  });
}

/** Dry run against a task key like "NEX-12": finds the task, then asks the rule. */
export function useDryRun(orgSlug: string, workspaceSlug: string) {
  return useMutation({
    mutationFn: async ({ automationId, taskKey }: { automationId: string; taskKey: string }) => {
      const task = await apiGet<{ id: string }>(
        `${orgPath(orgSlug)}/workspaces/${encodeURIComponent(workspaceSlug)}/tasks/by-key/${encodeURIComponent(taskKey.trim().toUpperCase())}`,
      );
      return apiPost<DryRunResult>(`${orgPath(orgSlug)}/automations/${automationId}/dry-run`, {
        taskId: task.id,
      });
    },
  });
}
