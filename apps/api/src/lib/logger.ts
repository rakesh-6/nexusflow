import { pino } from "pino";
import { env } from "../config/env.ts";

// Structured JSON logs. Render collects anything written to stdout.
export const logger = pino({
  level: env.LOG_LEVEL,
  // Never write secrets or session cookies to the logs.
  redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
});
