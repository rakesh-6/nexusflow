import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.ts";
import { loadSession } from "./middleware/auth.ts";
import { csrfProtection } from "./middleware/csrf.ts";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.ts";
import { generalLimiter } from "./middleware/rateLimit.ts";
import { requestLogger } from "./middleware/requestLogger.ts";
import { webAppRouter } from "./middleware/webApp.ts";
import { apiRouter } from "./routes.ts";

// Builds the Express app without starting it, so tests can use it directly.
// Middleware order follows PRD.md §15.3.
export function createApp() {
  const app = express();

  // Render puts a proxy in front of the app; trust it so client IPs are correct.
  app.set("trust proxy", 1);

  app.use(requestLogger);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Profile photos come from Cloudinary (uploaded) or Google (Google sign-in).
          imgSrc: [
            "'self'",
            "data:",
            "https://res.cloudinary.com",
            "https://*.googleusercontent.com",
          ],
          // The browser uploads photos straight to Cloudinary (PRD §11.11).
          connectSrc: ["'self'", "https://api.cloudinary.com"],
          // Upgrading http to https only makes sense on the real https site;
          // on http://localhost it would break loading the app's own files.
          upgradeInsecureRequests: env.NODE_ENV === "production" ? [] : null,
        },
      },
    }),
  );
  app.use(cors({ origin: env.WEB_ORIGINS, credentials: true }));
  // Count API requests before reading their bodies, so a visitor over the
  // limit is turned away cheaply.
  app.use("/api/v1", generalLimiter);
  // Block cross-site forgeries before doing any work (PRD §19.3).
  app.use("/api/v1", csrfProtection);
  app.use(express.json({ limit: "1mb" }));
  // Read the login cookie and find who is signed in (sets req.auth).
  app.use("/api/v1", cookieParser(), loadSession);

  app.use("/api/v1", apiRouter);

  // Everything that is not an API route: the React app (after `pnpm build`).
  app.use(webAppRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
