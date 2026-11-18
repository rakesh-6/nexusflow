import type { OrgPermission } from "@nexusflow/shared";
import { useParams } from "react-router";
import { useCurrentUser } from "../features/auth/hooks";
import { useOrgContext } from "../features/organizations/hooks";

/**
 * The organization and workspace named in the current address, for example
 * /acme/general/home -> Acme Studio / General, read from the API's
 * organization context. Settings pages have no workspace in their address, so
 * they use the workspace you opened last (or the first one).
 * Returns null while loading, or when the address names nothing you can open.
 */
export function useWorkspace() {
  const { orgSlug, workspaceSlug } = useParams();
  const { data } = useOrgContext(orgSlug);
  const { data: user } = useCurrentUser();
  if (!data) return null;

  const workspace = workspaceSlug
    ? data.workspaces.find((ws) => ws.slug === workspaceSlug)
    : (data.workspaces.find((ws) => ws.id === user?.lastActiveWorkspaceId && !ws.archived) ??
      data.workspaces.find((ws) => !ws.archived));
  if (!workspace) return null;

  const organization = { ...data.organization, planTier: data.plan.tier };
  return {
    organization,
    workspace,
    /** Your organization role (OWNER, ADMIN, MEMBER, GUEST). */
    role: data.role,
    plan: data.plan,
    usage: data.usage,
    /** Every workspace you can open here (owners and admins also see archived ones). */
    workspaces: data.workspaces,
    /** Hides buttons you cannot use; the API checks again on every request. */
    can: (permission: OrgPermission) => data.permissions.includes(permission),
    /** Builds an address inside the current workspace: path("projects") -> /acme/general/projects */
    path: (subPath: string) => `/${organization.slug}/${workspace.slug}/${subPath}`,
    settingsPath: (subPath = "") => `/${organization.slug}/settings${subPath ? `/${subPath}` : ""}`,
  };
}

export type WorkspaceContext = NonNullable<ReturnType<typeof useWorkspace>>;
