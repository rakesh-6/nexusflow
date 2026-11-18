import type {
  AuditLogEntry,
  CreateOrganizationInput,
  CreateWorkspaceInput,
  CurrentUser,
  InvitationInput,
  InvitationPreview,
  InvitationSummary,
  OrganizationContext,
  OrganizationSummary,
  OrganizationUsage,
  OrgMember,
  OrgRole,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceSummary,
} from "@nexusflow/shared";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { ApiError, apiDelete, apiGet, apiGetPage, apiPatch, apiPost, apiPut } from "../../lib/api";
import { CURRENT_USER_KEY } from "../auth/hooks";

// Organizations, workspaces, members and invitations (PRD §11.2, §11.3), as
// React hooks. Every answer about one organization is cached under
// ["org", slug, ...], so a change can refresh all of it at once.

export const MY_ORGANIZATIONS_KEY = ["my-organizations"] as const;
const orgKey = (orgSlug: string) => ["org", orgSlug] as const;
const orgPath = (orgSlug: string) => `/api/v1/orgs/${encodeURIComponent(orgSlug)}`;
const workspacePath = (orgSlug: string, workspaceSlug: string) =>
  `${orgPath(orgSlug)}/workspaces/${encodeURIComponent(workspaceSlug)}`;

/** After any change: refresh this organization's data and the switcher list. */
function refreshOrg(queryClient: QueryClient, orgSlug: string) {
  void queryClient.invalidateQueries({ queryKey: orgKey(orgSlug) });
  void queryClient.invalidateQueries({ queryKey: MY_ORGANIZATIONS_KEY });
}

/**
 * After deleting or leaving something: wait for fresh "where do I belong"
 * answers, so "/" cannot send the person back to what is gone. The
 * organization's own data is only marked old (refetching it now would show
 * "not found" on the page they are leaving).
 */
async function refreshAfterRemoval(queryClient: QueryClient, orgSlug: string) {
  void queryClient.invalidateQueries({ queryKey: orgKey(orgSlug), refetchType: "none" });
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: MY_ORGANIZATIONS_KEY }),
    queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY }),
  ]);
}

/**
 * Puts a created or renamed workspace into the cached context at once, so
 * opening its (new) address does not briefly show "not found".
 */
function cacheWorkspace(queryClient: QueryClient, orgSlug: string, saved: WorkspaceSummary) {
  queryClient.setQueryData<OrganizationContext>([...orgKey(orgSlug), "context"], (context) =>
    context
      ? {
          ...context,
          workspaces: context.workspaces.some((ws) => ws.id === saved.id)
            ? context.workspaces.map((ws) => (ws.id === saved.id ? saved : ws))
            : [...context.workspaces, saved],
        }
      : context,
  );
}

// --- Reading --------------------------------------------------------------------

export function useMyOrganizations(enabled = true) {
  return useQuery({
    queryKey: MY_ORGANIZATIONS_KEY,
    queryFn: () => apiGet<OrganizationSummary[]>("/api/v1/users/me/organizations"),
    enabled,
    staleTime: 60_000,
  });
}

export function useOrgContext(orgSlug: string | undefined) {
  return useQuery({
    queryKey: [...orgKey(orgSlug ?? ""), "context"],
    queryFn: () => apiGet<OrganizationContext>(`${orgPath(orgSlug ?? "")}/context`),
    enabled: !!orgSlug,
    staleTime: 30_000,
    // "Not found" means you are not a member: asking again will not help.
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
}

export function useMembers(orgSlug: string, search: { q?: string; role?: OrgRole } = {}) {
  const params = new URLSearchParams({ pageSize: "100" });
  if (search.q) params.set("q", search.q);
  if (search.role) params.set("role", search.role);
  return useQuery({
    queryKey: [...orgKey(orgSlug), "members", search],
    queryFn: async () => {
      const page = await apiGetPage<OrgMember[], { total: number }>(
        `${orgPath(orgSlug)}/members?${params}`,
      );
      return { members: page.data, total: page.meta.total ?? page.data.length };
    },
  });
}

export function useInvitations(orgSlug: string) {
  return useQuery({
    queryKey: [...orgKey(orgSlug), "invitations"],
    queryFn: () => apiGet<InvitationSummary[]>(`${orgPath(orgSlug)}/invitations`),
  });
}

export function useUsage(orgSlug: string) {
  return useQuery({
    queryKey: [...orgKey(orgSlug), "usage"],
    queryFn: () => apiGet<OrganizationUsage>(`${orgPath(orgSlug)}/usage`),
  });
}

export function useAuditLog(orgSlug: string, action: string) {
  return useInfiniteQuery({
    queryKey: [...orgKey(orgSlug), "audit", action],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "50" });
      if (pageParam) params.set("cursor", pageParam);
      if (action) params.set("action", action);
      return apiGetPage<AuditLogEntry[], { nextCursor: string | null }>(
        `${orgPath(orgSlug)}/audit-logs?${params}`,
      );
    },
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
  });
}

export function useWorkspaceMembers(orgSlug: string, workspaceSlug: string) {
  return useQuery({
    queryKey: [...orgKey(orgSlug), "workspace", workspaceSlug, "members"],
    queryFn: () => apiGet<WorkspaceMember[]>(`${workspacePath(orgSlug, workspaceSlug)}/members`),
  });
}

export function useInvitationPreview(token: string) {
  return useQuery({
    queryKey: ["invitation", token],
    queryFn: () => apiGet<InvitationPreview>(`/api/v1/invitations/${encodeURIComponent(token)}`),
    retry: false,
  });
}

// --- Organizations --------------------------------------------------------------

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrganizationInput) =>
      apiPost<{ slug: string; name: string; workspaceSlug: string }>("/api/v1/orgs", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MY_ORGANIZATIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY });
    },
  });
}

export function useUpdateOrganization(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; slug?: string }) =>
      apiPatch<{ name: string; slug: string }>(orgPath(orgSlug), input),
    onSuccess: () => refreshOrg(queryClient, orgSlug),
  });
}

/** Sensitive actions confirm the password first; the API requires it (PRD §11.1.7). */
const reauthenticate = (password: string) => apiPost("/api/v1/auth/reauthenticate", { password });

export function useDeleteOrganization(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ password, confirmSlug }: { password: string; confirmSlug: string }) => {
      await reauthenticate(password);
      await apiDelete(orgPath(orgSlug), { confirmSlug });
    },
    onSuccess: () => refreshAfterRemoval(queryClient, orgSlug),
  });
}

export function useTransferOwnership(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ password, userId }: { password: string; userId: string }) => {
      await reauthenticate(password);
      await apiPost(`${orgPath(orgSlug)}/transfer-ownership`, { userId });
    },
    onSuccess: () => refreshOrg(queryClient, orgSlug),
  });
}

export function useLeaveOrganization(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`${orgPath(orgSlug)}/leave`),
    onSuccess: () => refreshAfterRemoval(queryClient, orgSlug),
  });
}

// --- Members and invitations ----------------------------------------------------

export function useChangeMemberRole(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: OrgRole }) =>
      apiPatch(`${orgPath(orgSlug)}/members/${userId}`, { role }),
    onSuccess: () => refreshOrg(queryClient, orgSlug),
  });
}

export function useRemoveMember(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiDelete(`${orgPath(orgSlug)}/members/${userId}`),
    onSuccess: () => refreshOrg(queryClient, orgSlug),
  });
}

export function useInvite(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InvitationInput) =>
      apiPost<{ invited: string[]; skipped: { email: string; reason: string }[] }>(
        `${orgPath(orgSlug)}/invitations`,
        input,
      ),
    onSuccess: () => refreshOrg(queryClient, orgSlug),
  });
}

export function useResendInvitation(orgSlug: string) {
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiPost(`${orgPath(orgSlug)}/invitations/${invitationId}/resend`),
  });
}

export function useRevokeInvitation(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiDelete(`${orgPath(orgSlug)}/invitations/${invitationId}`),
    onSuccess: () => refreshOrg(queryClient, orgSlug),
  });
}

export function useAcceptInvitation(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<{ orgSlug: string; workspaceSlug: string | null }>(
        `/api/v1/invitations/${encodeURIComponent(token)}/accept`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MY_ORGANIZATIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY });
    },
  });
}

export function useDeclineInvitation(token: string) {
  return useMutation({
    mutationFn: () => apiPost(`/api/v1/invitations/${encodeURIComponent(token)}/decline`),
  });
}

// --- Workspaces -------------------------------------------------------------------

export function useCreateWorkspace(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) =>
      apiPost<WorkspaceSummary>(`${orgPath(orgSlug)}/workspaces`, input),
    onSuccess: (saved) => {
      cacheWorkspace(queryClient, orgSlug, saved);
      refreshOrg(queryClient, orgSlug);
    },
  });
}

export function useUpdateWorkspace(orgSlug: string, workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateWorkspaceInput>) =>
      apiPatch<WorkspaceSummary>(workspacePath(orgSlug, workspaceSlug), input),
    onSuccess: (saved) => {
      cacheWorkspace(queryClient, orgSlug, saved);
      refreshOrg(queryClient, orgSlug);
    },
  });
}

export function useArchiveWorkspace(orgSlug: string, workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archived: boolean) =>
      apiPost<WorkspaceSummary>(
        `${workspacePath(orgSlug, workspaceSlug)}/${archived ? "archive" : "restore"}`,
      ),
    onSuccess: () => refreshOrg(queryClient, orgSlug),
  });
}

export function useDeleteWorkspace(orgSlug: string, workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete(workspacePath(orgSlug, workspaceSlug)),
    onSuccess: () => refreshAfterRemoval(queryClient, orgSlug),
  });
}

export function useSetWorkspaceMember(orgSlug: string, workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      role,
      isNew,
    }: {
      userId: string;
      role: WorkspaceRole;
      isNew: boolean;
    }) =>
      isNew
        ? apiPost(`${workspacePath(orgSlug, workspaceSlug)}/members`, { userId, role })
        : apiPatch(`${workspacePath(orgSlug, workspaceSlug)}/members/${userId}`, { role }),
    onSuccess: () => refreshOrg(queryClient, orgSlug),
  });
}

export function useRemoveWorkspaceMember(orgSlug: string, workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiDelete(`${workspacePath(orgSlug, workspaceSlug)}/members/${userId}`),
    onSuccess: () => refreshOrg(queryClient, orgSlug),
  });
}

/** Remembers the workspace you opened, so "/" brings you back to it. */
export function useRememberWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) => apiPut("/api/v1/users/me/last-workspace", { workspaceId }),
    onSuccess: (_data, workspaceId) =>
      queryClient.setQueryData<CurrentUser | null>(CURRENT_USER_KEY, (user) =>
        user ? { ...user, lastActiveWorkspaceId: workspaceId } : user,
      ),
  });
}

/**
 * Where a signed-in person starts: the workspace they used last, else the
 * first one they can open, else onboarding to create an organization.
 */
export function homePathFor(
  organizations: OrganizationSummary[],
  lastActiveWorkspaceId: string | null,
): string {
  for (const org of organizations) {
    const last = org.workspaces.find((ws) => ws.id === lastActiveWorkspaceId);
    if (last) return `/${org.slug}/${last.slug}/home`;
  }
  for (const org of organizations) {
    const first = org.workspaces.find((ws) => !ws.archived);
    if (first) return `/${org.slug}/${first.slug}/home`;
  }
  return "/onboarding";
}
