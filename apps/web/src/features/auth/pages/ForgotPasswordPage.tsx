import { zodResolver } from "@hookform/resolvers/zod";
import { emailOnlySchema } from "@nexusflow/shared";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { FormField, showServerErrors } from "../../../components/common/FormField";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { AuthCard } from "../AuthCard";
import { useForgotPassword } from "../hooks";

export default function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(emailOnlySchema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      await forgot.mutateAsync(email);
    } catch (error) {
      setFormError(showServerErrors(error, setError, ["email"]));
    }
  });

  if (forgot.isSuccess) {
    return (
      <AuthCard title="Check your email" footer={<Link to="/login">Back to log in</Link>}>
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="size-10 text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{forgot.data.message}</p>
          <p className="text-xs text-muted-foreground">The link expires in 1 hour.</p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgot your password?"
      description="Enter your email and we will send you a link to choose a new one."
      footer={
        <>
          Remembered it? <Link to="/login">Log in</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}
        <FormField
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          register={register}
          error={errors.email?.message}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthCard>
  );
}
