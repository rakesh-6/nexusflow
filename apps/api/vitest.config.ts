import { defineConfig } from "vitest/config";

// Read the root .env if it exists (on your computer). In GitHub Actions there is
// no .env; TEST_DATABASE_URL comes from the workflow instead.
try {
  process.loadEnvFile("../../.env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const testDatabaseUrl = process.env["TEST_DATABASE_URL"];
const developmentDatabaseUrl = process.env["DATABASE_URL"];

// Safety guard: tests create and change data, so they must never run against
// the development database. Neon's pooled and direct addresses differ only by
// "-pooler", so compare without it.
const sameDatabase = (a: string, b: string) => {
  const key = (url: string) => {
    const parsed = new URL(url);
    return `${parsed.hostname.replace("-pooler", "")}${parsed.pathname}`;
  };
  return key(a) === key(b);
};

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is missing. Add your Neon test branch to .env (see .env.example).",
  );
}
if (developmentDatabaseUrl && sameDatabase(testDatabaseUrl, developmentDatabaseUrl)) {
  throw new Error(
    "TEST_DATABASE_URL points at the same database as DATABASE_URL. Use the separate Neon test branch.",
  );
}

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Creates the tables in the test database once, before any test runs.
    globalSetup: ["tests/globalSetup.ts"],
    // Settings the app sees during tests.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      MAIL_PROVIDER: "memory",
      LOG_LEVEL: "silent",
      RATE_LIMIT_GENERAL_PER_MINUTE: "10000",
      RATE_LIMIT_AUTH_PER_MINUTE: "10000",
    },
    // One test file at a time keeps the number of database connections low.
    fileParallelism: false,
    // Neon may need a few seconds to wake up.
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
