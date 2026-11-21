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
    // The web app's address, used in links inside emails (verify, reset password).
    APP_URL: z.url().default("http://localhost:5173"),
    // Requests allowed per minute (PRD SEC-09). "General" covers the whole API;
    // "auth" is the stricter limit for login, sign-up and password reset.
    RATE_LIMIT_GENERAL_PER_MINUTE: z.coerce.number().int().positive().default(300),
    RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().positive().default(10),
    // Background jobs (reminders, emails, clean-ups). Set to false to let the
    // free Neon database sleep while you only browse the app locally.
    JOBS_ENABLED: z.stringbool().default(true),
    // Where emails go: "console" prints them to the terminal, "memory" keeps them
    // in a list for automated tests, "brevo" really sends them (free plan).
    MAIL_PROVIDER: z.enum(["console", "memory", "brevo"]).optional(),
    MAIL_FROM: z.string().min(3).default("NexusFlow <no-reply@nexusflow.local>"),
    BREVO_API_KEY: z.string().min(10).optional(),
    // Brevo's free plan sends 300 emails a day; extra emails are skipped and logged.
    MAIL_DAILY_CAP: z.coerce.number().int().positive().default(300),
    // Cloudinary (free plan) stores profile photos and, later, file attachments.
    // Leave empty until you create the account; photo upload stays hidden.
    CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
    CLOUDINARY_API_KEY: z.string().min(1).optional(),
    CLOUDINARY_API_SECRET: z.string().min(1).optional(),
    CLOUDINARY_FOLDER_PREFIX: z.string().min(1).default("nexusflow/development"),
    // "Continue with Google" (PRD §19.4). Leave empty to hide the button.
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    // AI (PRD §11.16): Gemini's free tier. Leave AI_API_KEY empty and AI stays hidden.
    AI_PROVIDER: z.enum(["gemini"]).default("gemini"),
    AI_API_KEY: z.string().min(10).optional(),
    AI_MODEL: z.string().min(3).default("gemini-flash-latest"),
    // Razorpay in TEST MODE (PRD §11.14). Leave empty and upgrading stays off.
    RAZORPAY_KEY_ID: z
      .string()
      .startsWith("rzp_test_", "Use a Razorpay TEST key (rzp_test_...)")
      .optional(),
    RAZORPAY_KEY_SECRET: z.string().min(8).optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().min(8).optional(),
    RAZORPAY_PLAN_PRO_MONTHLY: z.string().startsWith("plan_").optional(),
    RAZORPAY_PLAN_PRO_YEARLY: z.string().startsWith("plan_").optional(),
    RAZORPAY_PLAN_BUSINESS_MONTHLY: z.string().startsWith("plan_").optional(),
    RAZORPAY_PLAN_BUSINESS_YEARLY: z.string().startsWith("plan_").optional(),
  })
  .refine((values) => values.MAIL_PROVIDER !== "brevo" || values.BREVO_API_KEY, {
    message: "MAIL_PROVIDER=brevo needs BREVO_API_KEY (see .env.example)",
    path: ["BREVO_API_KEY"],
  })
  // Pick the email provider from NODE_ENV when it is not set explicitly.
  .transform((values) => ({
    ...values,
    MAIL_PROVIDER: values.MAIL_PROVIDER ?? (values.NODE_ENV === "test" ? "memory" : "console"),
  }));

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // "BREVO_API_KEY=" with nothing after it means "not set", not "empty text".
  const provided = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== ""),
  );
  const result = envSchema.safeParse(provided);
  if (!result.success) {
    console.error("Invalid environment variables:\n" + z.prettifyError(result.error));
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
