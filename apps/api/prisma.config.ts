// Settings for the Prisma command-line tool (migrations, generate, studio).
import { defineConfig } from "prisma/config";

// The Prisma CLI does not read .env on its own, so load the root .env when it
// exists. On Render and in CI the variables come from the real environment.
try {
  process.loadEnvFile("../../.env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Command run by `prisma db seed` (pnpm db:seed).
    seed: "node prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection to Neon.
    url: process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"],
  },
});
