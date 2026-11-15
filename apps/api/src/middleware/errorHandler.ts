import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.ts";
import { AppError, NotFoundError } from "../utils/errors.ts";

// Runs when no route matched the URL.
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
}

// Errors created by express.json() when the request body is broken or too big.
function isBodyParserError(err: unknown): err is { type: string } {
  return typeof err === "object" && err !== null && "type" in err && typeof err.type === "string";
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (isBodyParserError(err)) {
    if (err.type === "entity.parse.failed") {
      return new AppError(400, "VALIDATION_ERROR", "Request body is not valid JSON");
    }
    if (err.type === "entity.too.large") {
      return new AppError(413, "PAYLOAD_TOO_LARGE", "Request body is larger than 1 MB");
    }
  }
  return new AppError(500, "INTERNAL_ERROR", "Something went wrong");
}

// Express recognises an error handler by its four parameters, so `_next` must stay.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const appError = toAppError(err);
  // A bug we did not anticipate, as opposed to an error we raised on purpose.
  const isUnexpected = !(err instanceof AppError) && appError.statusCode >= 500;

  if (isUnexpected) {
    req.log.error({ err }, "Unhandled error");
  }

  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined && { details: appError.details }),
      requestId: req.id,
      // Stack traces help while developing but must never reach real users.
      ...(env.NODE_ENV === "development" && isUnexpected && err instanceof Error
        ? { stack: err.stack }
        : {}),
    },
  });
}
