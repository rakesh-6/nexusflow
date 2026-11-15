import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOpenApiDocument, OPENAPI_FILE } from "./openapi.ts";

describe("API documentation", () => {
  it("openapi.json is up to date (run `pnpm docs:openapi` if this fails)", () => {
    const saved: unknown = JSON.parse(readFileSync(OPENAPI_FILE, "utf8"));
    expect(saved).toEqual(buildOpenApiDocument());
  });

  it("documents every health endpoint", () => {
    expect(Object.keys(buildOpenApiDocument().paths)).toEqual(["/health", "/health/ready"]);
  });
});
