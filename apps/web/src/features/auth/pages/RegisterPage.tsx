import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema } from "@nexusflow/shared";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { FormField, showServerErrors } from "../../../components/common/FormField";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { AuthCard } from "../AuthCard";
import { GoogleButton } from "../GoogleButton";
import { useRegister } from "../hooks";

export default function RegisterPage() {
  const navigate = useNavigate();
  const registerUser = useRegister();
  const [formError, setFormError] = useState<string | null>(null);
  const [takenMessage, setTakenMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await registerUser.mutateAsync(values);
      if (result.user) navigate("/verify-email", { replace: true });
      // The email already has an account. The server does not say so directly
      // (privacy); it emailed the owner instead.
      else setTakenMessage(result.message ?? "Check your email for the next step.");
    } catch (error) {
      setFormError(showServerErrors(error, setError, ["name", "email", "password"]));
    }
  });

  if (takenMessage) {
    return (
      <AuthCard title="Check your email" footer={<Link to="/login">Back to log in</Link>}>
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="size-10 text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{takenMessage}</p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      description="Free forever for small teams. No credit card."
      footer={
        <>
          Already have an account? <Link to="/login">Log in</Link>
        </>
      }
    >
      <GoogleButton />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}
        <FormField
          name="name"
          label="Your name"
          autoComplete="name"
          autoFocus
          register={register}
          error={errors.name?.message}
        />
        <FormField
          name="email"
          label="Work email"
          type="email"
          autoComplete="email"
          register={register}
          error={errors.email?.message}
        />
        <FormField
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          register={register}
          error={errors.password?.message}
          hint="At least 8 characters, with a letter and a number."
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}
