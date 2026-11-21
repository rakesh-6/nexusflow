import { defineConfig, devices } from "@playwright/test";

// Browser tests (PRD §25.1): the real built app in Chromium, against the Neon
// TEST database (never the dev one). Run with `pnpm test:e2e`. Playwright
// builds the app and starts the API on port 4100, so `pnpm dev` (4000/5173)
// can keep running.

// The test database address comes from your .env (TEST_DATABASE_URL).
try {
  process.loadEnvFile("../../.env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const testDatabase = process.env["TEST_DATABASE_URL"];
if (!testDatabase)
  throw new Error("Browser tests need TEST_DATABASE_URL in .env (the Neon test branch)");

const PORT = 4100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests",
  // One browser at a time: the demo organization is shared by every test.
  workers: 1,
  // Free databases wake slowly; allow for it.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env["CI"] ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Build the web app, bring the test database up to date, then start the API,
    // which also serves the built web app.
    command:
      "pnpm --filter @nexusflow/web build && pnpm --filter @nexusflow/api db:deploy && pnpm --filter @nexusflow/api start",
    cwd: "../..",
    url: `${BASE_URL}/api/v1/health`,
    timeout: 300_000,
    reuseExistingServer: !process.env["CI"],
    env: {
      NODE_ENV: "development",
      PORT: String(PORT),
      APP_URL: BASE_URL,
      WEB_ORIGINS: BASE_URL,
      DATABASE_URL: testDatabase,
      DIRECT_DATABASE_URL: testDatabase,
      DEMO_MODE: "true",
      JOBS_ENABLED: "false",
      MAIL_PROVIDER: "console",
      // Keep these optional services off in browser tests.
      AI_API_KEY: "",
      RAZORPAY_KEY_ID: "",
    },
  },
});
