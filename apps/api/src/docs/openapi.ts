import path from "node:path";
import { z } from "zod";

// API documentation in the OpenAPI 3.1 format (PRD §18.8), built from Zod
// schemas with Zod's own z.toJSONSchema(). Each new endpoint adds its entry to
// `paths` below, then `pnpm docs:openapi` rewrites openapi.json. A test fails
// if the saved file and this code ever disagree.

export const OPENAPI_FILE = path.resolve(import.meta.dirname, "../../openapi.json");

const ErrorResponse = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});

const successResponse = <T extends z.ZodType>(data: T) =>
  z.object({ success: z.literal(true), data });

const HealthData = z.object({
  status: z.literal("ok"),
  app: z.string(),
  uptimeSeconds: z.number().int(),
  timestamp: z.iso.datetime(),
});

const ReadyData = z.object({
  status: z.literal("ready"),
  database: z.literal("ok"),
  latencyMs: z.number().int(),
});

/** Converts a Zod schema to JSON Schema, minus the "$schema" line OpenAPI does not want. */
function jsonSchema(schema: z.ZodType) {
  const result: Record<string, unknown> = { ...z.toJSONSchema(schema) };
  delete result["$schema"];
  return result;
}

const json = (description: string, schema: z.ZodType) => ({
  description,
  content: { "application/json": { schema: jsonSchema(schema) } },
});

export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "NexusFlow API",
      version: "1.0.0",
      description:
        "REST API for NexusFlow. Every response uses { success, data } or { success: false, error }.",
    },
    servers: [{ url: "/api/v1" }],
    paths: {
      "/health": {
        get: {
          operationId: "getHealth",
          tags: ["Health"],
          summary: "Liveness check: answers while the server process is running",
          responses: { "200": json("The server is running", successResponse(HealthData)) },
        },
      },
      "/health/ready": {
        get: {
          operationId: "getReadiness",
          tags: ["Health"],
          summary: "Readiness check: also confirms the database answers",
          responses: {
            "200": json("The server and database are ready", successResponse(ReadyData)),
            "503": json("The database is not reachable (code DATABASE_UNAVAILABLE)", ErrorResponse),
          },
        },
      },
    },
  };
}
