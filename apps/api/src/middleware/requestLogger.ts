import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { logger } from "../lib/logger.ts";

// Accept a caller's request id only if it looks safe; otherwise create one.
const SAFE_REQUEST_ID = /^[\w-]{1,64}$/;

// Logs one line per request and tags it with a request id. The id is also sent
// back in the X-Request-Id header so a user's error report can be traced.
export const requestLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const incoming = req.headers["x-request-id"];
    const id =
      typeof incoming === "string" && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
});
