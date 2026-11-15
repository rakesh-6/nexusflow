import { useParams } from "react-router";
import { findOrganization } from "../lib/sampleData";

/**
 * The organization and workspace named in the current address, for example
 * /acme/general/home -> Acme Studio / General. Settings pages have no
 * workspace in their address, so they fall back to the organization's first one.
 * Returns null when the address names something that does not exist.
 */
export function useWorkspace() {
  const { orgSlug, workspaceSlug } = useParams();
  const organization = findOrganization(orgSlug);
  if (!organization) return null;

  const workspace = workspaceSlug
    ? organization.workspaces.find((ws) => ws.slug === workspaceSlug)
    : organization.workspaces[0];
  if (!workspace) return null;

  return {
    organization,
    workspace,
    projects: organization.projects[workspace.slug] ?? [],
    /** Builds an address inside the current workspace: path("projects") -> /acme/general/projects */
    path: (subPath: string) => `/${organization.slug}/${workspace.slug}/${subPath}`,
  };
}

export type WorkspaceContext = NonNullable<ReturnType<typeof useWorkspace>>;
