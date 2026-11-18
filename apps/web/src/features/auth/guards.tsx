import { LoaderCircle, ServerCrash } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation, useParams, useSearchParams } from "react-router";
import { EmptyState } from "../../components/common/EmptyState";
import { Button } from "../../components/ui/button";
import { NotFoundPage } from "../../pages/NotFoundPage";
import { homePathFor, useMyOrganizations, useOrgContext } from "../organizations/hooks";
import { NoWorkspacePage } from "../organizations/NoWorkspacePage";
import { safeReturnTo, useCurrentUser } from "./hooks";

/** Where "/" leads a signed-in person; <SignedInHome> works out the exact workspace. */
export const SIGNED_IN_HOME = "/";

/**
 * An invitation link opened before signing in or verifying; "/" returns to it
 * once. Kept in localStorage (not per tab) because the verification email's
 * link usually opens a new tab.
 */
const PENDING_INVITE_KEY = "nf_pending_invite";

export function readPendingInvite(): string | null {
  try {
    return localStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

export function setPendingInvite(token: string | null) {
  try {
    if (token) localStorage.setItem(PENDING_INVITE_KEY, token);
    else localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // Private windows may block storage; the invite link still works when reopened.
  }
}

export function FullPageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface" role="status">
      <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function ServerUnavailable({ retry }: { retry: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4">
      <EmptyState
        icon={ServerCrash}
        title="Cannot reach NexusFlow"
        description="The server did not answer. It may be waking up; this takes up to a minute on the free plan."
        action={<Button onClick={retry}>Try again</Button>}
      />
    </div>
  );
}

/** Pages for signed-in, verified people only. Others go to log in or verify their email. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending, isError, refetch } = useCurrentUser();
  const location = useLocation();

  if (isPending) return <FullPageLoader />;
  if (isError) return <ServerUnavailable retry={() => void refetch()} />;
  if (!user) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />;
  return children;
}

/** Log in and sign up pages: people who are already signed in skip ahead. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useCurrentUser();
  const [params] = useSearchParams();

  if (isPending) return <FullPageLoader />;
  if (user && !user.emailVerified) return <Navigate to="/verify-email" replace />;
  if (user) return <Navigate to={safeReturnTo(params.get("returnTo"))} replace />;
  return children;
}

/**
 * Sends a signed-in person to a pending invitation, else the workspace they
 * used last, else their first workspace, else onboarding.
 */
function SignedInHome({ lastActiveWorkspaceId }: { lastActiveWorkspaceId: string | null }) {
  const organizations = useMyOrganizations();
  const pendingInvite = readPendingInvite();
  // Used once: the invitation page itself decides whether to keep it.
  useEffect(() => {
    if (pendingInvite) setPendingInvite(null);
  }, [pendingInvite]);

  if (pendingInvite) {
    return <Navigate to={`/invite/${encodeURIComponent(pendingInvite)}`} replace />;
  }
  if (organizations.isPending) return <FullPageLoader />;
  if (organizations.isError) {
    return <ServerUnavailable retry={() => void organizations.refetch()} />;
  }
  const path = homePathFor(organizations.data, lastActiveWorkspaceId);
  // A guest with no workspace anywhere still belongs to an organization.
  const guestOrg = organizations.data[0];
  if (path === "/onboarding" && guestOrg) return <Navigate to={`/${guestOrg.slug}`} replace />;
  return <Navigate to={path} replace />;
}

/** "/" sends signed-in people into the app and everyone else to log in. */
export function RootRedirect() {
  const { data: user, isPending } = useCurrentUser();
  if (isPending) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />;
  return <SignedInHome lastActiveWorkspaceId={user.lastActiveWorkspaceId} />;
}

/** /acme -> the workspace you used last in Acme, or its first one. */
export function OrganizationRedirect() {
  const { orgSlug } = useParams();
  const { data: user } = useCurrentUser();
  const context = useOrgContext(orgSlug);

  if (context.isPending) return <FullPageLoader />;
  if (context.isError) return <NotFoundPage />;
  const { workspaces, organization } = context.data;
  const workspace =
    workspaces.find((ws) => ws.id === user?.lastActiveWorkspaceId && !ws.archived) ??
    workspaces.find((ws) => !ws.archived);
  if (!workspace) return <NoWorkspacePage organizationName={organization.name} />;
  return <Navigate to={`/${organization.slug}/${workspace.slug}/home`} replace />;
}
