import { zodResolver } from "@hookform/resolvers/zod";
import { deleteAccountFormSchema } from "@nexusflow/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { FormField } from "../../components/common/FormField";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { useDeleteAccount } from "../../features/account/hooks";
import { useCurrentUser } from "../../features/auth/hooks";
import { ApiError } from "../../lib/api";

// Danger zone: permanently delete your account (PRD §11.1.7). Asks for the
// password and for "DELETE" typed out, so it cannot happen by accident.
export function DeleteAccountSection() {
  const { data: user } = useCurrentUser();
  const deleteAccount = useDeleteAccount();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(deleteAccountFormSchema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await deleteAccount.mutateAsync(password);
      navigate("/goodbye", { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === "INVALID_CREDENTIALS") {
        setError("password", { message: error.message });
      } else if (error instanceof ApiError && error.code === "SOLE_OWNER") {
        const names = (error.details as unknown as { name: string }[])
          .map((org) => org.name)
          .join(", ");
        setFormError(`${error.message} (${names})`);
      } else {
        setFormError(error instanceof ApiError ? error.message : "Something went wrong.");
      }
    }
  });

  return (
    <section
      aria-labelledby="delete-account"
      className="rounded-card border border-destructive/40 bg-card p-5 shadow-sm sm:p-6"
    >
      <h2 id="delete-account" className="text-base font-semibold text-destructive">
        Delete account
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your name, email, photo and sign-in methods are removed for good. Tasks and comments you
        wrote stay, shown as “Deleted User”.
      </p>

      {!open ? (
        <Button variant="destructive" className="mt-5" onClick={() => setOpen(true)}>
          Delete my account…
        </Button>
      ) : !user?.hasPassword ? (
        <Alert variant="info" className="mt-5">
          Your account signs in with Google. Add a password first (log out and use “Forgot
          password?”), then come back here.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="mt-5 max-w-sm space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}
          <FormField
            name="password"
            label="Your password"
            type="password"
            autoComplete="current-password"
            register={register}
            error={errors.password?.message}
          />
          <FormField
            name="confirmation"
            label="Type DELETE to confirm"
            autoComplete="off"
            register={register}
            error={errors.confirmation?.message}
          />
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? "Deleting…" : "Delete forever"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
