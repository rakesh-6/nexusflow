import type {
  CreateProjectInput,
  CreateTeamInput,
  LabelSummary,
  MilestoneSummary,
  ProjectMemberSummary,
  ProjectRole,
  ProjectStatus,
  ProjectSummary,
  StatusCategory,
  TaskStatusSummary,
  TeamMemberSummary,
  TeamRole,
  TeamSummary,
  TrashedProject,
  UpdateProjectInput,
} from "@nexusflow/shared";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiGetPage, apiPatch, apiPost, apiPut } from "../../lib/api";

// Teams, projects, columns, milestones and labels (PRD §11.4, §11.5) as React
// hooks. Everything about one organization is cached under ["org", slug, ...],
// like the Phase 3 hooks, so a change can refresh the related lists at once.

const org = (orgSlug: string) => `/api/v1/orgs/${encodeURIComponent(orgSlug)}`;
const ws = (orgSlug: string, workspaceSlug: string) =>
  `${org(orgSlug)}/workspaces/${encodeURIComponent(workspaceSlug)}`;
const projectPath = (orgSlug: string, projectId: string) => `${org(orgSlug)}/projects/${projectId}`;

const projectsKey = (orgSlug: string) => ["org", orgSlug, "projects"] as const;
const projectKey = (orgSlug: string, projectId: string) =>
  ["org", orgSlug, "project", projectId] as const;
const teamsKey = (orgSlug: string) => ["org", orgSlug, "teams"] as const;

/** After a project change: its own data, the project lists and the usage numbers. */
function refreshProject(queryClient: QueryClient, orgSlug: string, projectId?: string) {
  void queryClient.invalidateQueries({ queryKey: projectsKey(orgSlug) });
  if (projectId) void queryClient.invalidateQueries({ queryKey: projectKey(orgSlug, projectId) });
  void queryClient.invalidateQueries({ queryKey: teamsKey(orgSlug) });
}

// --- Projects ---------------------------------------------------------------------

export interface ProjectFilters {
  status?: ProjectStatus;
  teamId?: string;
  q?: string;
  includeArchived?: boolean;
}

export function useProjects(orgSlug: string, workspaceSlug: string, filters: ProjectFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.teamId) params.set("teamId", filters.teamId);
  if (filters.q) params.set("q", filters.q);
  if (filters.includeArchived) params.set("includeArchived", "true");
  return useQuery({
    queryKey: [...projectsKey(orgSlug), workspaceSlug, filters],
    queryFn: () => apiGet<ProjectSummary[]>(`${ws(orgSlug, workspaceSlug)}/projects?${params}`),
    staleTime: 30_000,
  });
}

/** One project by its key in the address ("NEX"). Refreshed with the project lists. */
export function useProjectByKey(orgSlug: string, workspaceSlug: string, key: string) {
  return useQuery({
    queryKey: [...projectsKey(orgSlug), workspaceSlug, "by-key", key.toUpperCase()],
    queryFn: () =>
      apiGet<ProjectSummary>(
        `${ws(orgSlug, workspaceSlug)}/projects/by-key/${encodeURIComponent(key)}`,
      ),
    retry: false,
  });
}

export function useCreateProject(orgSlug: string, workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      apiPost<ProjectSummary>(`${ws(orgSlug, workspaceSlug)}/projects`, input),
    onSuccess: () => {
      refreshProject(queryClient, orgSlug);
      void queryClient.invalidateQueries({ queryKey: ["org", orgSlug, "context"] });
    },
  });
}

export function useUpdateProject(orgSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) =>
      apiPatch<ProjectSummary>(projectPath(orgSlug, projectId), input),
    onSuccess: () => refreshProject(queryClient, orgSlug, projectId),
  });
}

export function useArchiveProject(orgSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archived: boolean) =>
      apiPost<ProjectSummary>(
        `${projectPath(orgSlug, projectId)}/${archived ? "archive" : "restore"}`,
      ),
    onSuccess: () => refreshProject(queryClient, orgSlug, projectId),
  });
}

export function useDeleteProject(orgSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete(projectPath(orgSlug, projectId)),
    onSuccess: () => {
      refreshProject(queryClient, orgSlug);
      void queryClient.invalidateQueries({ queryKey: ["org", orgSlug, "trash"] });
    },
  });
}

// --- Project members, columns, milestones -----------------------------------------

export function useProjectMembers(orgSlug: string, projectId: string) {
  return useQuery({
    queryKey: [...projectKey(orgSlug, projectId), "members"],
    queryFn: () => apiGet<ProjectMemberSummary[]>(`${projectPath(orgSlug, projectId)}/members`),
  });
}

export function useSetProjectMember(orgSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role, isNew }: { userId: string; role: ProjectRole; isNew: boolean }) =>
      isNew
        ? apiPost(`${projectPath(orgSlug, projectId)}/members`, { userId, role })
        : apiPatch(`${projectPath(orgSlug, projectId)}/members/${userId}`, { role }),
    onSuccess: () => refreshProject(queryClient, orgSlug, projectId),
  });
}

export function useRemoveProjectMember(orgSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiDelete(`${projectPath(orgSlug, projectId)}/members/${userId}`),
    onSuccess: () => refreshProject(queryClient, orgSlug, projectId),
  });
}

export function useStatuses(orgSlug: string, projectId: string) {
  return useQuery({
    queryKey: [...projectKey(orgSlug, projectId), "statuses"],
    queryFn: () => apiGet<TaskStatusSummary[]>(`${projectPath(orgSlug, projectId)}/statuses`),
  });
}

type StatusChange =
  | { kind: "create"; name: string; color: string; category: StatusCategory }
  | {
      kind: "update";
      statusId: string;
      name?: string;
      color?: string;
      category?: StatusCategory;
      isDefault?: true;
    }
  | { kind: "reorder"; statusIds: string[] }
  | { kind: "delete"; statusId: string; targetStatusId: string };

/** Every change to a project's columns; each answers with the new column list. */
export function useChangeStatuses(orgSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  const base = `${projectPath(orgSlug, projectId)}/statuses`;
  return useMutation({
    mutationFn: async (change: StatusChange): Promise<TaskStatusSummary[]> => {
      switch (change.kind) {
        case "create": {
          const { kind: _kind, ...body } = change;
          return apiPost(base, body);
        }
        case "update": {
          const { kind: _kind, statusId, ...body } = change;
          return apiPatch(`${base}/${statusId}`, body);
        }
        case "reorder":
          return apiPut(`${base}/reorder`, { statusIds: change.statusIds });
        case "delete": {
          const result = await apiDelete<{ statuses: TaskStatusSummary[] }>(
            `${base}/${change.statusId}`,
            { targetStatusId: change.targetStatusId },
          );
          return result.statuses;
        }
      }
    },
    onSuccess: (statuses) => {
      queryClient.setQueryData([...projectKey(orgSlug, projectId), "statuses"], statuses);
      refreshProject(queryClient, orgSlug, projectId);
    },
  });
}

export function useMilestones(orgSlug: string, projectId: string) {
  return useQuery({
    queryKey: [...projectKey(orgSlug, projectId), "milestones"],
    queryFn: () => apiGet<MilestoneSummary[]>(`${projectPath(orgSlug, projectId)}/milestones`),
  });
}

type MilestoneChange =
  | { kind: "create"; name: string; dueDate?: string | null; description?: string }
  | {
      kind: "update";
      milestoneId: string;
      name?: string;
      dueDate?: string | null;
      status?: "OPEN" | "COMPLETED";
    }
  | { kind: "delete"; milestoneId: string };

export function useChangeMilestones(orgSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  const base = `${projectPath(orgSlug, projectId)}/milestones`;
  return useMutation({
    mutationFn: (change: MilestoneChange): Promise<MilestoneSummary[]> => {
      if (change.kind === "create") {
        const { kind: _kind, ...body } = change;
        return apiPost(base, body);
      }
      if (change.kind === "update") {
        const { kind: _kind, milestoneId, ...body } = change;
        return apiPatch(`${base}/${milestoneId}`, body);
      }
      return apiDelete(`${base}/${change.milestoneId}`);
    },
    onSuccess: (milestones) =>
      queryClient.setQueryData([...projectKey(orgSlug, projectId), "milestones"], milestones),
  });
}

export interface ProjectActivityEntry {
  id: string;
  action: string;
  actorName: string;
  changes: unknown;
  metadata: unknown;
  createdAt: string;
}

export function useProjectActivity(orgSlug: string, projectId: string) {
  return useQuery({
    queryKey: [...projectKey(orgSlug, projectId), "activity"],
    queryFn: () =>
      apiGet<ProjectActivityEntry[]>(`${projectPath(orgSlug, projectId)}/activity?limit=20`),
  });
}

// --- Teams ----------------------------------------------------------------------------

export function useTeams(orgSlug: string, workspaceSlug: string) {
  return useQuery({
    queryKey: [...teamsKey(orgSlug), workspaceSlug],
    queryFn: async () => {
      const page = await apiGetPage<TeamSummary[], { canCreate: boolean }>(
        `${ws(orgSlug, workspaceSlug)}/teams`,
      );
      return { teams: page.data, canCreate: page.meta.canCreate ?? false };
    },
    staleTime: 30_000,
  });
}

export function useCreateTeam(orgSlug: string, workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTeamInput) =>
      apiPost<TeamSummary>(`${ws(orgSlug, workspaceSlug)}/teams`, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: teamsKey(orgSlug) }),
  });
}

export function useUpdateTeam(orgSlug: string, teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; slug?: string; description?: string }) =>
      apiPatch<TeamSummary>(`${org(orgSlug)}/teams/${teamId}`, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: teamsKey(orgSlug) }),
  });
}

export function useDeleteTeam(orgSlug: string, teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectsAction: "move" | "archive") =>
      apiDelete(`${org(orgSlug)}/teams/${teamId}`, { projectsAction }),
    onSuccess: () => refreshProject(queryClient, orgSlug),
  });
}

export function useTeamMembers(orgSlug: string, teamId: string) {
  return useQuery({
    queryKey: [...teamsKey(orgSlug), "members", teamId],
    queryFn: () => apiGet<TeamMemberSummary[]>(`${org(orgSlug)}/teams/${teamId}/members`),
  });
}

export function useSetTeamMember(orgSlug: string, teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role, isNew }: { userId: string; role: TeamRole; isNew: boolean }) =>
      isNew
        ? apiPost(`${org(orgSlug)}/teams/${teamId}/members`, { userId, role })
        : apiPatch(`${org(orgSlug)}/teams/${teamId}/members/${userId}`, { role }),
    onSuccess: () => refreshProject(queryClient, orgSlug),
  });
}

export function useRemoveTeamMember(orgSlug: string, teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiDelete(`${org(orgSlug)}/teams/${teamId}/members/${userId}`),
    onSuccess: () => refreshProject(queryClient, orgSlug),
  });
}

// --- Labels and trash -------------------------------------------------------------

export function useLabels(orgSlug: string, workspaceSlug: string) {
  return useQuery({
    queryKey: ["org", orgSlug, "labels", workspaceSlug],
    queryFn: async () => {
      const page = await apiGetPage<LabelSummary[], { canManage: boolean }>(
        `${ws(orgSlug, workspaceSlug)}/labels`,
      );
      return { labels: page.data, canManage: page.meta.canManage ?? false };
    },
  });
}

type LabelChange =
  | { kind: "create"; name: string; color: string }
  | { kind: "update"; labelId: string; name?: string; color?: string }
  | { kind: "delete"; labelId: string };

export function useChangeLabels(orgSlug: string, workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: LabelChange) => {
      if (change.kind === "create") {
        return apiPost(`${ws(orgSlug, workspaceSlug)}/labels`, {
          name: change.name,
          color: change.color,
        });
      }
      if (change.kind === "update") {
        const { kind: _kind, labelId, ...body } = change;
        return apiPatch(`${org(orgSlug)}/labels/${labelId}`, body);
      }
      return apiDelete(`${org(orgSlug)}/labels/${change.labelId}`);
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["org", orgSlug, "labels", workspaceSlug] }),
  });
}

export function useTrash(orgSlug: string) {
  return useQuery({
    queryKey: ["org", orgSlug, "trash"],
    queryFn: () => apiGet<TrashedProject[]>(`${org(orgSlug)}/trash`),
  });
}

export function useUndeleteProject(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => apiPost(`${projectPath(orgSlug, projectId)}/undelete`),
    onSuccess: () => {
      refreshProject(queryClient, orgSlug);
      void queryClient.invalidateQueries({ queryKey: ["org", orgSlug, "trash"] });
    },
  });
}
