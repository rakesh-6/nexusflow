import type {
  AiStatus,
  AiUsageRow,
  DeadlineOutput,
  InsightsOutput,
  MeetingNotesOutput,
  ProjectPlanOutput,
  ProjectSummaryOutput,
  RichTextDoc,
  TaskBreakdownOutput,
  TaskDescriptionOutput,
} from "@nexusflow/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, apiGet, apiPost, apiPut } from "../../lib/api";

// AI features (PRD §11.16). When the server has no AI provider, /ai/status
// answers 404 and every AI control stays hidden (AC-AI-01).

const aiPath = (orgSlug: string) => `/api/v1/orgs/${encodeURIComponent(orgSlug)}/ai`;
const statusKey = (orgSlug: string) => ["org", orgSlug, "ai", "status"] as const;

export function useAiStatus(orgSlug: string) {
  return useQuery({
    queryKey: statusKey(orgSlug),
    queryFn: async () => {
      try {
        return await apiGet<AiStatus>(`${aiPath(orgSlug)}/status`);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

/** True when AI buttons should show: set up on the server, on the plan, and switched on. */
export function useAiAvailable(orgSlug: string) {
  const { data } = useAiStatus(orgSlug);
  return !!data && data.enabled && data.planAllows;
}

/** One AI request; refreshes the usage numbers afterwards. */
function useAi<Input, Output>(orgSlug: string, feature: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) => apiPost<Output>(`${aiPath(orgSlug)}/${feature}`, input),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["org", orgSlug, "ai"] }),
  });
}

export const useDraftDescription = (orgSlug: string) =>
  useAi<
    { projectId: string; title: string; taskId?: string },
    TaskDescriptionOutput & { description: RichTextDoc }
  >(orgSlug, "task-description");
export const useSuggestSubtasks = (orgSlug: string) =>
  useAi<{ taskId: string }, TaskBreakdownOutput>(orgSlug, "task-breakdown");
export const useSuggestDeadline = (orgSlug: string) =>
  useAi<{ taskId: string }, DeadlineOutput>(orgSlug, "deadline-suggestion");
export const useProjectSummary = (orgSlug: string) =>
  useAi<{ projectId: string }, ProjectSummaryOutput>(orgSlug, "project-summary");
export const useProjectPlan = (orgSlug: string) =>
  useAi<{ projectId: string }, ProjectPlanOutput>(orgSlug, "project-plan");
export const useMeetingNotes = (orgSlug: string) =>
  useAi<{ text: string; projectId?: string }, MeetingNotesOutput>(orgSlug, "meeting-notes");
export const useAiInsights = (orgSlug: string) =>
  useAi<{ workspaceId: string }, InsightsOutput>(orgSlug, "insights");

export function useAiUsage(orgSlug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["org", orgSlug, "ai", "usage"],
    queryFn: () => apiGet<AiUsageRow[]>(`${aiPath(orgSlug)}/usage`),
    enabled,
  });
}

export function useAiSettings(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (aiEnabled: boolean) =>
      apiPut<AiStatus>(`${aiPath(orgSlug)}/settings`, { aiEnabled }),
    onSuccess: (status) => queryClient.setQueryData(statusKey(orgSlug), status),
  });
}

// --- The privacy notice, once per browser (PRD §11.16.1) --------------------------

const NOTICE_KEY = "nexusflow.ai-notice-seen";

function readNoticeSeen() {
  try {
    return window.localStorage.getItem(NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function useAiNotice() {
  const [seen, setSeen] = useState(() => typeof window !== "undefined" && readNoticeSeen());
  const accept = () => {
    try {
      window.localStorage.setItem(NOTICE_KEY, "1");
    } catch {
      // Private mode: show the notice again next time; nothing else breaks.
    }
    setSeen(true);
  };
  return { seen, accept };
}
