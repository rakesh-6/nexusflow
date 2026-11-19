import { z } from "zod";

// Building blocks for the API documentation (see openapi.ts).

export interface Endpoint {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  tag: string;
  summary: string;
  /** Needs a signed-in session cookie. */
  auth?: boolean;
  body?: z.ZodType;
  /** The request works without a body too. */
  optionalBody?: boolean;
  /** Status code -> [description, response schema]. Errors use ErrorResponse. */
  responses: Record<string, [string, z.ZodType?]>;
}

export const ok = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });
/** A list answer that also carries paging details in "meta". */
export const okPage = <T extends z.ZodType, M extends z.ZodType>(data: T, meta: M) =>
  z.object({ success: z.literal(true), data, meta });
export const cursorMeta = z.object({ nextCursor: z.uuid().nullable() });
export const flag = (name: string) => z.object({ [name]: z.literal(true) });

export const FORBIDDEN = "Your role does not allow this (FORBIDDEN)";
