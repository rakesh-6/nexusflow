import { LoaderCircle, ServerCrash } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router";
import { EmptyState } from "../../components/common/EmptyState";
import { Button } from "../../components/ui/button";
import { safeReturnTo, useCurrentUser } from "./hooks";

// Until organizations exist (Phase 3), signed-in people land in the sample workspace.
export const SIGNED_IN_HOME = "/acme/general/home";

export function FullPageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface" role="status">
      <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function ServerUnavailable({ retry }: { retry: () => void }) {
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
  if (user) {
    const returnTo = safeReturnTo(params.get("returnTo"));
    return <Navigate to={returnTo === "/" ? SIGNED_IN_HOME : returnTo} replace />;
  }
  return children;
}

/** "/" sends signed-in people into the app and everyone else to log in. */
export function RootRedirect() {
  const { data: user, isPending } = useCurrentUser();
  if (isPending) return <FullPageLoader />;
  return <Navigate to={user ? SIGNED_IN_HOME : "/login"} replace />;
}
