import type { Request } from "express";
import type { z } from "zod";
import { AppError } from "./errors.ts";

// Which parts of the request to check, each with its own Zod schema.
interface RequestSchemas {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
}

// The checked values, typed from the schemas that were passed in.
type ValidatedRequest<S extends RequestSchemas> = {
  [Part in keyof S]: S[Part] extends z.ZodType ? z.output<S[Part]> : never;
};

export interface ValidationIssue {
  /** Where the problem is, e.g. "body.title" or "query.limit". */
  path: string;
  message: string;
}

/**
 * Checks a request against Zod schemas and returns the cleaned, typed values.
 * Fields the schema does not list are removed. If anything is wrong, throws one
 * 400 VALIDATION_ERROR that lists every problem (PRD §18.2), which the error
 * handler turns into the standard error response.
 *
 * Query string values always arrive as text. In query schemas, use
 * z.coerce.number() for numbers and z.stringbool() for yes/no values.
 * Never use z.coerce.boolean() there: it turns the text "false" into true.
 *
 * Example inside a route handler:
 *   const { params, body } = validateRequest(req, { params: taskIdParams, body: updateTaskBody });
 */
export function validateRequest<S extends RequestSchemas>(
  req: Request,
  schemas: S,
): ValidatedRequest<S> {
  const values: Record<string, unknown> = {};
  const issues: ValidationIssue[] = [];

  for (const part of ["params", "query", "body"] as const) {
    const schema = schemas[part];
    if (!schema) continue;

    const result = schema.safeParse(req[part]);
    if (result.success) {
      values[part] = result.data;
    } else {
      for (const issue of result.error.issues) {
        issues.push({ path: [part, ...issue.path.map(String)].join("."), message: issue.message });
      }
    }
  }

  if (issues.length > 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Some fields are missing or invalid", issues);
  }
  return values as ValidatedRequest<S>;
}
