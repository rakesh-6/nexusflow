import { CircleCheck, LoaderCircle, MailOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { ApiError } from "../../../lib/api";
import { AuthCard } from "../AuthCard";
import { FullPageLoader, SIGNED_IN_HOME } from "../guards";
import { useCurrentUser, useLogout, useResendVerification, useVerifyEmail } from "../hooks";

const errorText = (error: unknown) =>
  error instanceof ApiError ? error.message : "Something went wrong. Please try again.";

/** "Resend the email" with its own success and error messages. */
function ResendButton() {
  const resend = useResendVerification();
  return (
    <div className="space-y-3">
      {resend.isSuccess && <Alert variant="success">A new link is on its way.</Alert>}
      {resend.isError && <Alert variant="error">{errorText(resend.error)}</Alert>}
      <Button
        variant="outline"
        className="w-full"
        onClick={() => resend.mutate()}
        disabled={resend.isPending}
      >
        {resend.isPending ? "Sending…" : "Send a new link"}
      </Button>
    </div>
  );
}

/** Opened from the email: confirms the token as soon as the page loads. */
function VerifyWithToken({ token }: { token: string }) {
  const verify = useVerifyEmail();
  const { data: user } = useCurrentUser();
  const started = useRef(false);

  useEffect(() => {
    // React's development mode runs effects twice; a link must only be used once.
    if (started.current) return;
    started.current = true;
    verify.mutate(token);
  }, [token, verify]);

  if (verify.isSuccess) {
    return (
      <AuthCard title="Email verified">
        <div className="flex flex-col items-center gap-4 text-center">
          <CircleCheck className="size-10 text-success" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Your email address is confirmed. You are all set.
          </p>
          <Button asChild className="w-full">
            <Link to={user ? SIGNED_IN_HOME : "/login"}>
              {user ? "Continue to NexusFlow" : "Log in"}
            </Link>
          </Button>
        </div>
      </AuthCard>
    );
  }
  if (verify.isError) {
    return (
      <AuthCard title="This link did not work" footer={<Link to="/login">Back to log in</Link>}>
        <div className="space-y-4">
          <Alert variant="error">{errorText(verify.error)}</Alert>
          {user && !user.emailVerified ? <ResendButton /> : null}
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Verifying your email…">
      <div className="flex justify-center py-4" role="status">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    </AuthCard>
  );
}

/** Shown after sign-up, or when an unverified person opens the app. */
function CheckInbox() {
  const { data: user, isPending } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  if (isPending) return <FullPageLoader />;
  if (!user && !leaving) {
    return (
      <AuthCard
        title="Verify your email"
        description="Open the link we emailed you. To get a new link, log in first."
        footer={<Link to="/login">Log in</Link>}
      >
        <MailOpen className="mx-auto size-10 text-primary" aria-hidden="true" />
      </AuthCard>
    );
  }
  if (user?.emailVerified) return <Navigate to={SIGNED_IN_HOME} replace />;

  return (
    <AuthCard
      title="Check your inbox"
      description={
        <>
          We sent a verification link to <strong className="text-foreground">{user?.email}</strong>.
          It can take a minute to arrive, and may land in your spam folder.
        </>
      }
    >
      <div className="space-y-4">
        <ResendButton />
        <button
          type="button"
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
          onClick={() => {
            setLeaving(true);
            logout.mutate(undefined, { onSettled: () => navigate("/register", { replace: true }) });
          }}
        >
          Wrong email? Sign up again
        </button>
      </div>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  return token ? <VerifyWithToken token={token} /> : <CheckInbox />;
}
