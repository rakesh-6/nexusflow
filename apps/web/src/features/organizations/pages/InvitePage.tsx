import { MailX } from "lucide-react";
import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { EmptyState } from "../../../components/common/EmptyState";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { ApiError, errorMessage } from "../../../lib/api";
import { AuthCard } from "../../auth/AuthCard";
import { FullPageLoader, setPendingInvite } from "../../auth/guards";
import { useCurrentUser, useLogout } from "../../auth/hooks";
import { useAcceptInvitation, useDeclineInvitation, useInvitationPreview } from "../hooks";

const ROLE_NAMES = { OWNER: "an owner", ADMIN: "an admin", MEMBER: "a member", GUEST: "a guest" };

// /invite/:token (PRD §11.3): anyone can see who invited them. While they
// still have to sign in, sign up or verify their email, the link is saved so
// that "/" brings them back here afterwards.
export default function InvitePage() {
  const { token = "" } = useParams();
  const preview = useInvitationPreview(token);
  const { data: user, isPending: userPending } = useCurrentUser();
  const accept = useAcceptInvitation(token);
  const decline = useDeclineInvitation(token);
  const logout = useLogout();
  const navigate = useNavigate();

  // Remember a valid link only while the person cannot accept it yet.
  const mustComeBack = !userPending && (!user || !user.emailVerified);
  useEffect(() => {
    if (preview.isSuccess && mustComeBack) setPendingInvite(token);
    if (preview.isError) setPendingInvite(null);
  }, [preview.isSuccess, preview.isError, mustComeBack, token]);

  if (preview.isPending || userPending) return <FullPageLoader />;

  if (preview.isError) {
    const expired = preview.error instanceof ApiError && preview.error.status === 410;
    return (
      <EmptyState
        icon={MailX}
        title={expired ? "This invitation has expired" : "This invitation is not valid"}
        description={
          expired
            ? "Invitations work for 7 days. Ask the person who invited you to send a new one."
            : "It may have been used already or withdrawn."
        }
        action={
          <Button asChild>
            <Link to="/">Go to NexusFlow</Link>
          </Button>
        }
      />
    );
  }

  const invitation = preview.data;
  const returnTo = encodeURIComponent(`/invite/${token}`);
  const wrongAccount = user && user.email.toLowerCase() !== invitation.email.toLowerCase();

  async function onAccept() {
    const joined = await accept.mutateAsync();
    setPendingInvite(null);
    navigate(
      joined.workspaceSlug
        ? `/${joined.orgSlug}/${joined.workspaceSlug}/home`
        : `/${joined.orgSlug}`,
      { replace: true },
    );
  }

  async function onDecline() {
    await decline.mutateAsync();
    setPendingInvite(null);
    navigate("/", { replace: true });
  }

  const actionError = accept.error ?? decline.error;

  return (
    <AuthCard
      title={`Join ${invitation.organization.name}`}
      description={
        <>
          <strong className="font-medium text-foreground">{invitation.invitedBy}</strong> invited{" "}
          {invitation.email} to join as {ROLE_NAMES[invitation.role]}.
        </>
      }
    >
      {!user ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Log in or create an account with <strong>{invitation.email}</strong> to accept.
          </p>
          <Button asChild className="w-full">
            <Link to={`/register?returnTo=${returnTo}`}>Create an account</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link to={`/login?returnTo=${returnTo}`}>Log in</Link>
          </Button>
        </div>
      ) : wrongAccount ? (
        <div className="space-y-3">
          <Alert variant="error">
            This invitation was sent to {invitation.email}, but you are signed in as {user.email}.
          </Alert>
          <Button
            className="w-full"
            onClick={() =>
              logout.mutate(undefined, {
                onSettled: () => navigate(`/login?returnTo=${returnTo}`, { replace: true }),
              })
            }
          >
            Log out and use {invitation.email}
          </Button>
        </div>
      ) : !user.emailVerified ? (
        <div className="space-y-3">
          <Alert variant="info">Confirm your email address first, then come back here.</Alert>
          <Button asChild className="w-full">
            <Link to="/verify-email">Verify my email</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {actionError && <Alert variant="error">{errorMessage(actionError)}</Alert>}
          <Button
            className="w-full"
            onClick={() => void onAccept().catch(() => undefined)}
            disabled={accept.isPending || decline.isPending}
          >
            {accept.isPending ? "Joining…" : "Accept invitation"}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void onDecline().catch(() => undefined)}
            disabled={accept.isPending || decline.isPending}
          >
            Decline
          </Button>
        </div>
      )}
    </AuthCard>
  );
}
