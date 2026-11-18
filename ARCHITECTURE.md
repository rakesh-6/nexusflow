# NexusFlow — Architecture

_Describes the code as it exists on 2026-11-18. The intended full design is in [PRD.md](PRD.md) §15–§20._

## Repository layout (pnpm workspace)

```
apps/api          Node 24 + Express 5 + Prisma 7 (REST API, also serves the built web app)
apps/web          React 19 + Vite 8 + Tailwind CSS 4 single-page app
packages/shared   Zod schemas, permission rules, plan limits, constants (used by api and web)
.github/workflows/ci.yml   CI: format, lint, typecheck, build; tests against a throwaway Postgres 16
PRD.md  CLAUDE.md  README.md  .env.example  (+ these handoff docs)
```

Root configs: `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.gitattributes` (LF line endings), `.node-version` (24), `pnpm-workspace.yaml` (includes `allowBuilds` for `prisma`, `@prisma/engines`, `argon2`).

## Backend (`apps/api`)

- **Runs TypeScript directly** with Node 24 type stripping (no build step). Imports use `.ts` extensions; `erasableSyntaxOnly` forbids `enum`/`namespace`/parameter properties. Start: `src/server.ts`; app factory: `src/app.ts` (used by tests without listening).
- **Middleware order** (`src/app.ts`): requestLogger (pino-http, request ids) → helmet (CSP allows Cloudinary/Google images and `api.cloudinary.com` uploads; no https upgrade outside production) → cors → `generalLimiter` on `/api/v1` → `csrfProtection` on `/api/v1` → `express.json({limit:"1mb"})` → `cookieParser()` + `loadSession` on `/api/v1` → `apiRouter` → `webAppRouter()` (built SPA) → `notFoundHandler` → `errorHandler`.
- **Layering**: `modules/<area>/<area>.routes.ts` (validate + call service + respond) → `*.service.ts` (business rules, Prisma). No separate repository layer yet; services always filter by `organizationId`.
- **Config**: `src/config/env.ts` validates all env vars with Zod at startup (empty values count as unset). Key vars: `DATABASE_URL`, `DIRECT_DATABASE_URL`, `TEST_DATABASE_URL`, `APP_URL`, `WEB_ORIGINS`, `RATE_LIMIT_*`, `MAIL_PROVIDER` (console|memory|brevo), `MAIL_FROM`, `BREVO_API_KEY`, `MAIL_DAILY_CAP`, `CLOUDINARY_*`, `GOOGLE_CLIENT_ID/SECRET`, `LOG_LEVEL` (incl. `silent`).
- **Errors**: throw `AppError(status, code, message, details?)` (`src/utils/errors.ts`); `src/middleware/errorHandler.ts` renders `{ success:false, error:{ code, message, details?, requestId } }`; stack traces only for unexpected errors in development.
- **Responses**: `sendSuccess(res, data, status?, meta?)` → `{ success:true, data, meta? }` (`src/utils/response.ts`).
- **Validation**: `validateRequest(req, { params, query, body })` (`src/utils/validateRequest.ts`) — a helper called inside handlers (Express 5 makes `req.query` read-only). Lists all issues as `details: [{ path: "body.email", message }]`. Use `z.stringbool()` for query booleans, never `z.coerce.boolean()`.
- **Rate limiting**: `src/middleware/rateLimit.ts` (`generalLimiter` 300/min, health exempt; `authLimiter` 10/min; `createLimiter` factory). In-memory store (single instance).
- **Mail**: `src/lib/mail/` — `mailer` chosen by `MAIL_PROVIDER`; `sendEmail()` never throws (logs failures, masks addresses); `memoryMailbox` for tests.
- **Storage**: `src/lib/storage/cloudinary.ts` — SHA-1 signed direct uploads, Admin API fetch/destroy over HTTPS (no SDK). `cloudinaryConfigured` flag.
- **Activity / audit**: `src/lib/securityLog.ts` (auth events, `organizationId` null) and `src/lib/activity.ts` (org-scoped DOMAIN/SECURITY rows). Audit log = SECURITY + BILLING rows.
- **API docs**: `src/docs/openapi.ts` (list `ENDPOINTS`, Zod → JSON Schema via `z.toJSONSchema`), served at `/api/v1/docs/openapi.json` outside production; `pnpm --filter @nexusflow/api docs:openapi` writes `apps/api/openapi.json`; drift test in `src/docs/openapi.test.ts`.

## Authentication and authorization

- **Sessions** (`src/modules/auth/session.service.ts`): random 32-byte token in cookie `nf_session` (HttpOnly, SameSite=Lax, Secure in production, host-only); DB stores SHA-256 hash in `Session`. 30-day sliding expiry (extended at most daily), 90-day absolute cap, `lastSeenAt` every 5 min, in-memory cache 30 s (`forgetCachedSessions({userId|sessionId})` after any change to user/session data).
- **Middleware** (`src/middleware/auth.ts`): `loadSession` (sets `req.auth`), `requireAuth` (401), `requireVerified` (403 `EMAIL_NOT_VERIFIED`), `requireRecentAuth` (403 `REAUTH_REQUIRED` unless password confirmed via `/auth/reauthenticate` within 5 min), `currentAuth(req)`.
- **Passwords** (`src/modules/auth/password.ts`): Argon2id 64 MB / 3 passes; constant-time path for unknown accounts.
- **Lockout**: 5 `auth.login_failed` ActivityLog rows in 15 minutes since the last login/reset → 429.
- **CSRF** (`src/middleware/csrf.ts`): non-GET requests need header `X-Requested-With: NexusFlow`; `Origin` must be own origin, `WEB_ORIGINS` or `APP_URL`.
- **Google** (`src/modules/auth/google.ts`): openid-client Authorization Code + PKCE, state/nonce in short-lived `nf_oauth` cookie, link only verified matching emails.
- **Tenancy (Phase 3)** (`src/middleware/tenant.ts`): `loadTenant` on `/orgs/:orgSlug/*` requires a verified user with ACTIVE membership in a non-deleted org; otherwise **404** (never reveals existence). Sets `req.tenant = { organization, membership, subscription }`. `requireOrgPermission(permission)` uses `canInOrg` from `packages/shared/src/permissions.ts` (PRD §12.2 matrix). Workspace access: `loadWorkspace` in `workspaces.service.ts` (OWNER/ADMIN all; MEMBER only with WorkspaceMember; GUEST none).
- **Plan limits**: `assertWithinPlan(subscription, limitKey, current, adding)` in `src/lib/planGuard.ts` → 402 `PLAN_LIMIT_REACHED` with `details {limit, current, max, planTier}`. Limits in `packages/shared/src/plans.ts` (FREE: 1 workspace, 5 members, 2 guests).

## Frontend (`apps/web`)

- **Entry**: `src/main.tsx` (QueryClientProvider + `createBrowserRouter(routes)`), routes in `src/routes.tsx` (React Router 8; lazy pages with Suspense skeletons; route `handle: crumb(...)` drives breadcrumbs).
- **Data**: TanStack Query (`src/lib/queryClient.ts`); API client `src/lib/api.ts` (`apiGet/apiPost/apiPatch/apiDelete`, adds CSRF header, throws `ApiError {status, code, details}`).
- **Auth UI**: `src/features/auth/` (hooks, guards `RequireAuth`/`GuestOnly`/`RootRedirect`, pages), `src/features/account/hooks.ts` (profile, avatar upload, delete account). Forms: React Hook Form + `zodResolver` with schemas from `@nexusflow/shared`; `src/components/common/FormField.tsx` (`showServerErrors` maps `body.x` details to fields).
- **Layout**: `src/layouts/AppShell.tsx` (sidebar, drawer on phones, Ctrl/⌘+K → search), `Sidebar.tsx`, `TopBar.tsx`, `WorkspaceSwitcher.tsx`, `UserMenu.tsx` (real user, logout). **Still uses `src/lib/sampleData.ts`** for organizations/workspaces/projects in the switcher, sidebar and `useWorkspace` — replaced in Phase 3 frontend.
- **Design system**: tokens in `src/styles/index.css` (Tailwind 4 `@theme inline`; light `:root`, dark `.dark`); shadcn-style components in `src/components/ui/` (button, dropdown-menu, tooltip, sheet, skeleton, input, alert); `cn()` in `src/lib/utils.ts`. Theme init script `public/theme-init.js` (CSP forbids inline scripts).
- **Dev**: Vite on 5173 proxies `/api` and `/socket.io` to the API on 4000 (same-origin cookies). Production: Express serves `apps/web/dist` with SPA fallback (`src/middleware/webApp.ts`).

## Database

PostgreSQL 16 on Neon (free), Prisma 7 with `prisma-client` generator (output `apps/api/src/generated/prisma`, git-ignored, regenerated by `postinstall`) and `@prisma/adapter-pg`. Details in [DATABASE.md](DATABASE.md).

## Important design decisions

| Decision                                                                                              | Why                                                              | Where recorded                                         |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| Zero-cost free tiers only; single Render service serves SPA + API + sockets                           | Portfolio project; first-party cookies without a domain          | PRD §26, A-24                                          |
| Organization contains many workspaces                                                                 | User decision                                                    | PRD §17                                                |
| Razorpay test mode; Cloudinary; Brevo; Gemini                                                         | Free, India-friendly                                             | PRD Appendix A                                         |
| Server sessions instead of JWT                                                                        | Revocable on role change/removal                                 | PRD §19.1                                              |
| Node type stripping, no API build step                                                                | Simpler; Node 24                                                 | PRD §16                                                |
| TypeScript pinned 6.0.x                                                                               | typescript-eslint does not support TS 7                          | CLAUDE.md                                              |
| Prisma pinned 7.10.1                                                                                  | `prisma` latest tag was an 8.0 RC                                | CLAUDE.md                                              |
| Generated `searchVector` columns are hand-written SQL marked `@default(dbgenerated())`                | Prisma cannot express them; otherwise migrate wants to drop them | CLAUDE.md, migration `p1_collaboration_billing_search` |
| `Task.statusId` FK uses NO ACTION                                                                     | Lets a project delete remove tasks and statuses together         | schema.prisma                                          |
| Avatars use public Cloudinary delivery with random names                                              | Expiring URLs need a paid plan                                   | PRD A-25                                               |
| `validateRequest` helper instead of middleware                                                        | Express 5 `req.query` is read-only; keeps types                  | PRD §15.3                                              |
| Tenant isolation by explicit `organizationId` filters + 404 for outsiders (Prisma extension deferred) | Speed of delivery; verified by cross-tenant tests                | DEVELOPMENT_STATUS.md                                  |
