import { Router } from "express";
import { env } from "./config/env.ts";
import { buildOpenApiDocument } from "./docs/openapi.ts";
import { authRouter } from "./modules/auth/auth.routes.ts";
import { healthRouter } from "./modules/health/health.routes.ts";
import { usersRouter } from "./modules/users/users.routes.ts";

// All version 1 API routes. Each feature module adds its router here.
export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);

// The API documentation, outside production only (PRD §18.8).
if (env.NODE_ENV !== "production") {
  apiRouter.get("/docs/openapi.json", (_req, res) => {
    res.json(buildOpenApiDocument());
  });
}
