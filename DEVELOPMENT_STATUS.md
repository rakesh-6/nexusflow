# NexusFlow — Development Status

_Last updated: 2026-11-18. Source of truth for requirements: [PRD.md](PRD.md) (progress trackers in PRD §27)._

## Project overview

NexusFlow is a multi-tenant SaaS project-management and team-collaboration app (organizations → workspaces → teams → projects → tasks), built as a **zero-cost portfolio project**: every service runs on a free tier (Render, Neon, Cloudinary, Brevo, Razorpay test mode, Gemini). It is a pnpm monorepo: `apps/api` (Node 24 + Express 5 + Prisma 7), `apps/web` (React 19 + Vite 8 + Tailwind 4), `packages/shared` (Zod schemas and rules used by both).

Repository: https://github.com/rakesh-6/nexusflow (branch `main`).

## Current phase

**Phase 3 — Organizations and workspaces: DONE (backend + frontend), committed.** Next: Phase 4 (teams and projects).

| Phase                                                | Status                                       | Commit    |
| ---------------------------------------------------- | -------------------------------------------- | --------- |
| 1 Setup and architecture (8 steps)                   | ✅ Done, CI green                            | `ff532f3` |
| 2 Authentication and user management (steps 2.1–2.6) | ✅ Done, 57 API tests pass, CI green         | `64eb645` |
| 3 Organizations and workspaces (steps 3.1–3.7)       | ✅ Done, 93 tests pass (see PRD §27 tracker) | —         |
| 4–12                                                 | ⬜ Not started                               | —         |

## Features completed (verified)

### Phase 1 (committed)

- Monorepo, TypeScript strict, ESLint, Prettier, GitHub Actions CI (`.github/workflows/ci.yml`).
- Express API basics: middleware chain, response envelope, `AppError`, error handler, request ids, pino logging, helmet CSP, CORS, rate limiting, Zod `validateRequest`, health checks (`/api/v1/health`, `/api/v1/health/ready`).
- Full MVP database schema (36 models), 3 migrations, generated search columns, 15 CHECK constraints, seed script (Acme Studio + Globex).
- React app shell: sidebar, top bar, every route from PRD §14.2 (placeholders for later phases), light/dark/system themes, Express serves the built SPA.
- Tests (Vitest + Supertest) and OpenAPI docs generated from Zod.

### Phase 2 (committed)

- Server sessions (HttpOnly cookie `nf_session`, SHA-256 token hash in DB), Argon2id passwords, register, login with lockout (5 failures / 15 min), logout / logout everywhere.
- Email verification + resend, forgot/reset/change password, password re-confirmation (`requireRecentAuth`, 5 minutes), active sessions list and revoke, CSRF protection (`X-Requested-With: NexusFlow` + Origin check), SECURITY audit events.
- Mail providers: console (dev), memory (tests), Brevo HTTP (prod). Templates in `apps/api/src/lib/mail/templates.ts`.
- Profile (name, time zone), Cloudinary avatar upload via signed direct upload (no SDK), account deletion with data scrub.
- Google sign-in (openid-client, PKCE) — code done, **hidden until `GOOGLE_CLIENT_ID/SECRET` are set**.
- Web: login, register, verify email, forgot/reset password, goodbye pages; Profile and Security settings; route guards; TanStack Query; React Hook Form.

## Phase 3 (done) — where things are

| Part                                                                                       | Files                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Shared plan limits, permission matrix (15 unit tests), schemas, API response types         | `packages/shared/src/{plans,permissions,organizations}.ts`                                                                               |
| Tenant middleware, plan guard (402), activity logging                                      | `apps/api/src/middleware/tenant.ts`, `apps/api/src/lib/{planGuard,activity}.ts`                                                          |
| Organizations, members, invitations, workspaces services and routes                        | `apps/api/src/modules/organizations/*`, `apps/api/src/modules/users/users.routes.ts`                                                     |
| API tests (18, all pass) and OpenAPI docs (55 operations)                                  | `apps/api/tests/organizations.test.ts`, `apps/api/src/docs/openapi.ts` → `openapi.json`                                                  |
| Web data layer: org hooks, `useWorkspace()` from `/orgs/:org/context`; sample data removed | `apps/web/src/features/organizations/hooks.ts`, `apps/web/src/hooks/useWorkspace.ts`, `apps/web/src/lib/api.ts`                          |
| Shell: real switcher + "New workspace" dialog, `/` → last/first workspace or onboarding    | `apps/web/src/layouts/*`, `apps/web/src/features/auth/guards.tsx`, `features/organizations/NewWorkspaceDialog.tsx`                       |
| Onboarding and invitation pages                                                            | `apps/web/src/features/organizations/pages/{OnboardingPage,InvitePage}.tsx`                                                              |
| Settings layout; org sections (Organization, Members, Invitations, Usage, Audit, Roles)    | `apps/web/src/pages/settings/{SettingsLayout,OrgSettingsPage,orgSettingsSections}.tsx`, `apps/web/src/features/organizations/settings/*` |
| Workspace settings (details, members, archive, delete)                                     | `apps/web/src/features/organizations/settings/WorkspaceSettingsPage.tsx`                                                                 |

Deferred from Phase 3 (also in the PRD §27 tracker): logo upload and branding color, workspace activity page UI (API exists), audit-log CSV export, invitation-expiry job (Phase 7), redirects from old org slugs, Prisma tenant extension (§20.3), Playwright E2E journey. Guests see an explanation page until project sharing (Phase 4).

## Known bugs and errors

No open code bugs. (Fixed on 2026-11-18: DELETE workspace without a body now defaults to `{ deleteContents: false }`; the slow multi-request tests have a 120 s timeout — the Phase 3 file takes ~5.5 minutes against Neon.)

1. **Environment notes (not code bugs):**
   - The pg driver prints a `SECURITY WARNING` about `sslmode=require`; harmless. Using `sslmode=verify-full` in `.env` removes it.
   - The developer has several times pasted real Neon connection strings into `.env.example`; it must only contain placeholders (it does now).
   - Prisma's migration engine reports a wrong password as `P1001 Can't reach database server`; the real error is `28P01 password authentication failed`.
   - If a test run is interrupted mid-migration, `tests/globalSetup.ts` now rebuilds the test database automatically (handles Prisma `P3009`).

## Test status

| Suite                                            | Result                                                        |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `pnpm test` (full run 2026-11-18, 488 s)         | 93 tests pass: `packages/shared` 18, `apps/api` 75 (10 files) |
| of which Phase 3 (`tests/organizations.test.ts`) | 18 pass (~5.5 minutes on its own against Neon)                |
| Web page renders (temporary SSR check)           | 16 pass (owner and member views, signed-out invitation)       |
| Typecheck / lint / format / web build            | Pass                                                          |
