import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const apiDirectory = fileURLToPath(new URL("..", import.meta.url));

/** Neon's pooled address is the direct one plus "-pooler"; migrations need the direct one. */
function toDirectUrl(url: string) {
  const parsed = new URL(url);
  parsed.hostname = parsed.hostname.replace("-pooler", "");
  return parsed.toString();
}

const hideSecrets = (text: string) =>
  text
    .replace(/postgres(ql)?:\/\/\S+/g, "<connection string hidden>")
    .replace(/npg_\w+/g, "<hidden>");

/** Runs a Prisma command against the test database. Returns its output; throws with the output on failure. */
function prismaOnTestDatabase(command: string, testDatabaseUrl: string): string {
  try {
    return execSync(`pnpm exec prisma ${command}`, {
      cwd: apiDirectory,
      stdio: "pipe",
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        DIRECT_DATABASE_URL: toDirectUrl(testDatabaseUrl),
      },
    }).toString();
  } catch (error) {
    const output = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      hideSecrets(`${output.stdout?.toString() ?? ""}${output.stderr?.toString() ?? ""}`),
    );
  }
}

// Runs once before all tests: applies every migration to the test database, so
// its tables always match the schema. Already-applied migrations are skipped.
//
// If an earlier run stopped half-way through a migration (for example because
// the computer went to sleep), Prisma marks it as failed (error P3009) and
// refuses to continue. The test database only ever holds throwaway test data,
// and vitest.config.ts has already checked it is not the development
// database, so the safe fix is to wipe it and rebuild it from the migrations.
export default function setup() {
  const testDatabaseUrl = process.env["TEST_DATABASE_URL"] ?? "";
  try {
    prismaOnTestDatabase("migrate deploy", testDatabaseUrl);
  } catch (error) {
    const message = (error as Error).message;
    if (!message.includes("P3009")) {
      throw new Error(`Could not prepare the test database:\n${message}`);
    }
    console.warn("Test database had a half-finished migration; rebuilding it from scratch…");
    try {
      prismaOnTestDatabase("migrate reset --force", testDatabaseUrl);
    } catch (resetError) {
      throw new Error(`Could not rebuild the test database:\n${(resetError as Error).message}`);
    }
  }
}
