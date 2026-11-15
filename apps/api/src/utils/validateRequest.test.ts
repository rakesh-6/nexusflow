import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "./errors.ts";
import { validateRequest } from "./validateRequest.ts";

const schemas = {
  params: z.object({ taskId: z.uuid() }),
  query: z.object({
    notify: z.stringbool().default(true),
    limit: z.coerce.number().int().max(100),
  }),
  body: z.object({ title: z.string().trim().min(1), priority: z.enum(["LOW", "HIGH"]).optional() }),
};

const fakeRequest = (params: unknown, query: unknown, body: unknown) =>
  ({ params, query, body }) as unknown as Request;

const TASK_ID = "019a7f3c-1234-7abc-8def-0123456789ab";

describe("validateRequest", () => {
  it("returns cleaned values: trimmed text, numbers from text, unknown fields removed", () => {
    const result = validateRequest(
      fakeRequest(
        { taskId: TASK_ID },
        { notify: "false", limit: "25" },
        { title: "  Fix bug  ", isAdmin: true },
      ),
      schemas,
    );
    expect(result).toEqual({
      params: { taskId: TASK_ID },
      query: { notify: false, limit: 25 },
      body: { title: "Fix bug" },
    });
  });

  it("lists every problem in one 400 VALIDATION_ERROR", () => {
    let thrown: unknown;
    try {
      validateRequest(
        fakeRequest({ taskId: "42" }, { limit: "500" }, { title: "", priority: "SUPER" }),
        schemas,
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppError);
    const appError = thrown as AppError;
    expect(appError.statusCode).toBe(400);
    expect(appError.code).toBe("VALIDATION_ERROR");
    const paths = (appError.details as { path: string }[]).map((issue) => issue.path);
    expect(paths).toEqual(["params.taskId", "query.limit", "body.title", "body.priority"]);
  });

  it("only checks the parts it was given", () => {
    const result = validateRequest(fakeRequest({}, {}, { title: "Hi" }), { body: schemas.body });
    expect(result).toEqual({ body: { title: "Hi" } });
  });
});
