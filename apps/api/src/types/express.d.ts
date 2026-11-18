import type {
  Organization,
  OrganizationMember,
  Session,
  Subscription,
  User,
} from "../generated/prisma/client.ts";

// Extra fields our middleware adds to every Express request.
declare global {
  namespace Express {
    interface Request {
      /** Set by loadSession when the request carries a valid session cookie. */
      auth?: { user: User; session: Session };
      /** Set by loadTenant on /orgs/:orgSlug/... routes: the organization and your membership. */
      tenant?: {
        organization: Organization;
        membership: OrganizationMember;
        subscription: Subscription;
      };
    }
  }
}

export {};
