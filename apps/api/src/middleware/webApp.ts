import { existsSync } from "node:fs";
import path from "node:path";
import express, { Router } from "express";
import { sendSuccess } from "../utils/response.ts";

// Where `pnpm build` puts the finished React app (apps/web/dist).
const WEB_DIST = path.resolve(import.meta.dirname, "../../../web/dist");
const INDEX_HTML = path.join(WEB_DIST, "index.html");

/**
 * Serves the React app from the same address as the API (PRD §26.1).
 *
 * - Files Vite built (scripts, styles, images) are sent as they are. Their
 *   names contain a content hash, so browsers may cache them for a year.
 * - Any other address that is not an API route returns index.html, and React
 *   shows the right page for that address (for example /acme/general/home).
 *
 * If the app has not been built yet (normal during development, where Vite
 * serves it on port 5173), "/" explains where to find it instead.
 */
export function webAppRouter(): Router {
  const router = Router();

  if (!existsSync(INDEX_HTML)) {
    router.get("/", (_req, res) => {
      sendSuccess(res, {
        message:
          "NexusFlow API is running. Open the web app at http://localhost:5173 (run pnpm dev), or run pnpm build to serve it from here.",
        links: { health: "/api/v1/health", databaseCheck: "/api/v1/health/ready" },
      });
    });
    return router;
  }

  router.use(
    express.static(WEB_DIST, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );

  // "/{*path}" matches every address (Express 5 syntax).
  router.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    // Always fetch a fresh index.html, so a new deploy is picked up at once.
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(INDEX_HTML);
  });

  return router;
}
