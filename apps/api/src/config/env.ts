import { z } from "zod";

// Every setting the API reads from environment variables, with safe defaults
// for local development. The server refuses to start if a value is invalid.
const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    // Neon pooled connection string for the app (see .env.example).
    DATABASE_URL: z
      .string({
        error:
          "DATABASE_URL is missing. Copy .env.example to .env and paste your Neon connection string.",
      })
      .regex(/^postgres(ql)?:\/\//, "DATABASE_URL must start with postgresql://"),
    // Comma-separated list of websites allowed to call the API.
    WEB_ORIGINS: z
      .string()
      .default("http://localhost:5173")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    // Requests allowed per minute (PRD SEC-09). "General" covers the whole API;
    // "auth" is the stricter limit for login and sign-up (used from Phase 2).
    RATE_LIMIT_GENERAL_PER_MINUTE: z.coerce.number().int().positive().default(300),
    RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().positive().default(10),
    // Where emails go: "console" prints them to the terminal, "memory" keeps them
    // in a list for automated tests. Brevo (real email) is added in Phase 2.
    MAIL_PROVIDER: z.enum(["console", "memory"]).optional(),
    MAIL_FROM: z.string().min(3).default("NexusFlow <no-reply@nexusflow.local>"),
  })
  // Pick the email provider from NODE_ENV when it is not set explicitly.
  .transform((values) => ({
    ...values,
    MAIL_PROVIDER: values.MAIL_PROVIDER ?? (values.NODE_ENV === "test" ? "memory" : "console"),
  }));

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:\n" + z.prettifyError(result.error));
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
