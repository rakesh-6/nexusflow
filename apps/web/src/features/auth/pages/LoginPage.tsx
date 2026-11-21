import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema } from "@nexusflow/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { FormField, showServerErrors } from "../../../components/common/FormField";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { AuthCard } from "../AuthCard";
import { SIGNED_IN_HOME } from "../guards";
import { safeReturnTo, useLogin } from "../hooks";
import { DemoButton } from "../DemoButton";
import { GoogleButton } from "../GoogleButton";

export default function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const login = useLogin();
  const [formError, setFormError] = useState<string | null>(params.get("error"));
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { user } = await login.mutateAsync(values);
      const returnTo = safeReturnTo(params.get("returnTo"));
      navigate(
        user.emailVerified ? (returnTo === "/" ? SIGNED_IN_HOME : returnTo) : "/verify-email",
        {
          replace: true,
        },
      );
    } catch (error) {
      setFormError(showServerErrors(error, setError, ["email", "password"]));
    }
  });

  return (
    <AuthCard
      title="Log in"
      description="Welcome back to NexusFlow."
      footer={
        <>
          New to NexusFlow? <Link to="/register">Create an account</Link>
        </>
      }
    >
      <DemoButton />
      <GoogleButton />
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
        <FormField
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          register={register}
          error={errors.password?.message}
        />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </AuthCard>
  );
}
