import { zodResolver } from "@hookform/resolvers/zod";
import { changePasswordFormSchema } from "@nexusflow/shared";
import { Monitor, Smartphone } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { FormField, showServerErrors } from "../../components/common/FormField";
import { PageHeader } from "../../components/common/PageHeader";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import {
  useChangePassword,
  useCurrentUser,
  useLogout,
  useRevokeSession,
  useSessions,
  type SessionInfo,
} from "../../features/auth/hooks";
import { ApiError } from "../../lib/api";
import { DeleteAccountSection } from "./DeleteAccountSection";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const id = title.toLowerCase().replace(/\s+/g, "-");
  return (
    <section aria-labelledby={id} className="rounded-card border bg-card p-5 shadow-sm sm:p-6">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ChangePasswordForm() {
  const changePassword = useChangePassword();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(changePasswordFormSchema) });

  const onSubmit = handleSubmit(async ({ currentPassword, password }) => {
    setFormError(null);
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword: password });
      reset();
    } catch (error) {
      // "Current password is incorrect" belongs under that field.
      if (error instanceof ApiError && error.code === "INVALID_CREDENTIALS") {
        setError("currentPassword", { message: error.message });
      } else {
        setFormError(showServerErrors(error, setError, ["currentPassword", "password"]));
      }
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-sm space-y-4">
      {changePassword.isSuccess && (
        <Alert variant="success">Password changed. Your other devices were signed out.</Alert>
      )}
      {formError && <Alert variant="error">{formError}</Alert>}
      <FormField
        name="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        register={register}
        error={errors.currentPassword?.message}
      />
      <FormField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        register={register}
        error={errors.password?.message}
        hint="At least 8 characters, with a letter and a number."
      />
      <FormField
        name="confirmPassword"
        label="Repeat new password"
        type="password"
        autoComplete="new-password"
        register={register}
        error={errors.confirmPassword?.message}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}

/** "Chrome on Windows" from a browser's user-agent text; good enough to recognize a device. */
function describeDevice(userAgent: string | null) {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Browser";
  const system = /Windows/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad/.test(userAgent)
        ? "iOS"
        : /Mac OS/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";
  return system ? `${browser} on ${system}` : browser;
}

const isMobile = (userAgent: string | null) => /Android|iPhone|iPad|Mobile/.test(userAgent ?? "");

function SessionRow({ session }: { session: SessionInfo }) {
  const revoke = useRevokeSession();
  const Icon = isMobile(session.userAgent) ? Smartphone : Monitor;
  return (
    <li className="flex items-center gap-3 py-3">
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {describeDevice(session.userAgent)}
          {session.current && (
            <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
              This device
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          Last active {new Date(session.lastSeenAt).toLocaleString()}
          {session.ip ? ` · ${session.ip}` : ""}
        </p>
      </div>
      {!session.current && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => revoke.mutate(session.id)}
          disabled={revoke.isPending}
        >
          Sign out
        </Button>
      )}
    </li>
  );
}

function SessionsList() {
  const { data: sessions, isPending, isError } = useSessions();
  const logoutEverywhere = useLogout(true);
  const navigate = useNavigate();

  if (isPending) return <Skeleton className="h-24 rounded-card" />;
  if (isError)
    return <Alert variant="error">Could not load your devices. Refresh to try again.</Alert>;
  return (
    <div className="space-y-4">
      <ul className="divide-y">
        {sessions.map((session) => (
          <SessionRow key={session.id} session={session} />
        ))}
      </ul>
      <Button
        variant="outline"
        onClick={() =>
          logoutEverywhere.mutate(undefined, {
            onSettled: () => navigate("/login", { replace: true }),
          })
        }
        disabled={logoutEverywhere.isPending}
      >
        Sign out everywhere
      </Button>
    </div>
  );
}

// Settings › Security (PRD §11.1): password, signed-in devices, account deletion.
export default function SecuritySettingsPage() {
  const { data: user } = useCurrentUser();
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader title="Security" description="Your password, signed-in devices and account." />
      <Section title="Password" description="Changing it signs you out on your other devices.">
        {user?.hasPassword ? (
          <ChangePasswordForm />
        ) : (
          <Alert variant="info">
            You sign in with Google. To add a password, log out and use “Forgot password?”.
          </Alert>
        )}
      </Section>
      <Section title="Signed-in devices" description="Sign out any device you do not recognize.">
        <SessionsList />
      </Section>
      <DeleteAccountSection />
    </div>
  );
}
