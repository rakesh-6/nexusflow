import type { Response } from "express";

// Every successful response uses the same shape: { success: true, data, meta? }.
export function sendSuccess(res: Response, data: unknown, statusCode = 200, meta?: object) {
  res.status(statusCode).json(meta ? { success: true, data, meta } : { success: true, data });
}
