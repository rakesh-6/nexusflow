import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOpenApiDocument, OPENAPI_FILE } from "./openapi.ts";

describe("API documentation", () => {
  it("openapi.json is up to date (run `pnpm docs:openapi` if this fails)", () => {
    const saved: unknown = JSON.parse(readFileSync(OPENAPI_FILE, "utf8"));
    expect(saved).toEqual(buildOpenApiDocument());
  });

  it("documents the health, auth and user endpoints", () => {
    const paths = Object.keys(buildOpenApiDocument().paths);
    for (const expected of [
      "/health",
      "/health/ready",
      "/auth/register",
      "/auth/login",
      "/users/me",
    ]) {
      expect(paths).toContain(expected);
    }
  });

  it("gives every operation a unique name", () => {
    const ids = Object.values(buildOpenApiDocument().paths).flatMap((methods) =>
      Object.values(methods).map((operation) => (operation as { operationId: string }).operationId),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
