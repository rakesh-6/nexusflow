import type { Session, User } from "../generated/prisma/client.ts";

// Adds `req.auth` to every Express request. It is set by the loadSession
// middleware when the request carries a valid session cookie.
declare global {
  namespace Express {
    interface Request {
      auth?: { user: User; session: Session };
    }
  }
}

export {};
