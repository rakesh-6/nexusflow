import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordFormSchema } from "@nexusflow/shared";
import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router";
import { FormField, showServerErrors } from "../../../components/common/FormField";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { AuthCard } from "../AuthCard";
import { useResetPassword } from "../hooks";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const reset = useResetPassword();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(resetPasswordFormSchema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await reset.mutateAsync({ token: token ?? "", password });
    } catch (error) {
      setFormError(showServerErrors(error, setError, ["password"]));
    }
  });

  if (!token) {
    return (
      <AuthCard title="Link incomplete" footer={<Link to="/login">Back to log in</Link>}>
        <div className="space-y-4">
          <Alert variant="error">
            This reset link is missing its code. Open the link from the email again.
          </Alert>
          <Button asChild variant="outline" className="w-full">
            <Link to="/forgot-password">Send a new link</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (reset.isSuccess) {
    return (
      <AuthCard title="Password changed">
        <div className="flex flex-col items-center gap-4 text-center">
          <CircleCheck className="size-10 text-success" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Your new password is set, and every device was signed out. Log in with your new
            password.
          </p>
          <Button asChild className="w-full">
            <Link to="/login">Log in</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      footer={
        <>
          Link expired? <Link to="/forgot-password">Send a new one</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}
        <FormField
          name="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          autoFocus
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
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Set new password"}
        </Button>
      </form>
    </AuthCard>
  );
}
