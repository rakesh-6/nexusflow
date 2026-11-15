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
  text.replace(/postgres(ql)?:\/\/\S+/g, "<connection string hidden>");

// Runs once before all tests: applies every migration to the test database, so
// its tables always match the schema. Already-applied migrations are skipped.
export default function setup() {
  const testDatabaseUrl = process.env["TEST_DATABASE_URL"] ?? "";
  try {
    execSync("pnpm exec prisma migrate deploy", {
      cwd: apiDirectory,
      stdio: "pipe",
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        DIRECT_DATABASE_URL: toDirectUrl(testDatabaseUrl),
      },
    });
  } catch (error) {
    const output = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      "Could not prepare the test database:\n" +
        hideSecrets(`${output.stdout?.toString() ?? ""}${output.stderr?.toString() ?? ""}`),
    );
  }
}
