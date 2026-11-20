# NexusFlow — Handoff for the next AI coding session

_Written 2026-11-18 at the end of a long session. Read this first, then [CLAUDE.md](CLAUDE.md) (mandatory working rules), [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md), [TODO.md](TODO.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), [API.md](API.md). Requirements: [PRD.md](PRD.md) (30 sections; progress trackers in §27; decisions in Appendix A)._

## 1. Project overview

NexusFlow: multi-tenant SaaS project management and team collaboration (Linear/ClickUp/Jira-style). Organizations (tenant + billing) contain workspaces, which contain teams and projects, which contain tasks. It is a **portfolio/resume project with a strict zero-cost rule**: only free tiers (Render web service, Neon Postgres, Cloudinary, Brevo, Razorpay test mode, Gemini). GitHub: https://github.com/rakesh-6/nexusflow (`main`).

**The developer is a beginner.** Working rules in `CLAUDE.md` (follow them exactly):

- Explain the approach in 3–4 lines before writing code; one feature at a time.
- **Ask before installing any new library.**
- **Never read, edit or print `.env`** (do not run scripts that dump it; the app may load it). Never hardcode secrets.
- After each change, say how to run it and what to expect.
- Only free services. Follow PRD.md; if something differs, say so and update the PRD.
- Commit/push only when the user says "commit". Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The user runs commands in PowerShell on Windows; give PowerShell-compatible commands.

## 2. Technology stack

| Area     | Choice (versions installed)                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Monorepo | pnpm 12.18 workspaces: `apps/api`, `apps/web`, `packages/shared`                                                                                                         |
| Runtime  | Node 24 (`.node-version`); API runs `.ts` directly (type stripping, `.ts` import extensions, no enums)                                                                   |
| API      | Express 5.3, Zod 4.6, pino, helmet, cors, express-rate-limit 8, cookie-parser, argon2, openid-client 6                                                                   |
| DB       | PostgreSQL 16 on Neon, Prisma 7.10.1 (pinned) + `@prisma/adapter-pg`, client generated to `apps/api/src/generated/prisma`                                                |
| Web      | React 19, Vite 8, Tailwind 4, React Router 8.5, TanStack Query 5, React Hook Form 7 + @hookform/resolvers 7, Radix (`radix-ui`), lucide-react, cva, clsx, tailwind-merge |
| Tests    | Vitest 5.1 (root), Supertest 7.3                                                                                                                                         |
| Tooling  | TypeScript 6.0.x (pinned; typescript-eslint lacks TS 7 support), ESLint 10 + typescript-eslint, Prettier 3                                                               |
| CI       | GitHub Actions `.github/workflows/ci.yml` (format, lint, typecheck, build; tests vs throwaway Postgres 16)                                                               |

## 3. Current architecture (summary — details in ARCHITECTURE.md)

- API middleware: logger → helmet CSP → cors → rate limit → CSRF (`X-Requested-With: NexusFlow`) → JSON → cookie + `loadSession` → `/api/v1` routers → built SPA → 404 → error handler.
- Auth: DB sessions (`nf_session` HttpOnly cookie, SHA-256 hash stored), Argon2id, lockout, re-auth window, Google PKCE.
- Tenancy: `loadTenant` (`apps/api/src/middleware/tenant.ts`) on `/orgs/:orgSlug/*` → 404 for non-members; `requireOrgPermission` uses the shared matrix `packages/shared/src/permissions.ts`; plan guard `apps/api/src/lib/planGuard.ts` → 402.
- Web: React Router routes `apps/web/src/routes.tsx`, guards `apps/web/src/features/auth/guards.tsx`, API client `apps/web/src/lib/api.ts`, design tokens `apps/web/src/styles/index.css`.

## 4. Current development phase

- Phase 1 ✅ (commit `ff532f3`), Phase 2 ✅ (commit `64eb645`, CI green, 57 API tests).
- Phase 3 ✅ (organizations and workspaces: backend, frontend, docs, PRD tracker), committed in the "Add Phase 3" commit. Full `pnpm test` passes (75 API + 18 shared tests; 18 of them Phase 3); 55 operations in `openapi.json`; 16 page renders pass.
- Phase 4 ✅ (teams and projects: access rules, teams, projects, columns, milestones, labels, trash; API + web), commit `76afd75`, CI green.
- Phases 5–8 ✅ committed (`b24afeb`, `261f016`), CI green. The MVP is complete.
- Phase 9 ✅ (billing, Razorpay test mode), commit `8ed87c8`, CI green.
- **Phase 10 (automations) is DONE but UNCOMMITTED**: shared rules `packages/shared/src/automations.ts`; engine `apps/api/src/modules/automations/automations.engine.ts` (+ `automations.actions.ts`), started in `server.ts` with `startAutomationBridge()`; jobs `automation.evaluate` and hourly `automations.due-soon`; routes `automations.routes.ts`; web `apps/web/src/features/automations/` (Settings › Automations). In tests, jobs are only recorded: `tests/automations.test.ts` runs them with `evaluateAutomations`. Waiting for "commit". Next: Phase 11 (AI).

## 5. Completed functionality (verified in code and tests)

Phase 1: monorepo, CI, Express foundation, full Prisma schema (36 models, 3 migrations, search columns, CHECK constraints), seed data, React shell with every route (placeholders), themes, Vitest/Supertest, OpenAPI from Zod.
Phase 2: register/login/logout/lockout, email verification, forgot/reset/change password, re-auth, sessions list/revoke, CSRF, audit events, mail providers (console/memory/Brevo), Cloudinary avatar (signed upload), account deletion, Google sign-in (hidden until configured), web auth pages and Profile/Security settings.
Phase 3: organizations, members, invitations, workspaces, plan limits and tenant isolation (API); onboarding, invitation page, real workspace switcher, organization and workspace settings (web). See DEVELOPMENT_STATUS.md, API.md and the PRD §27 Phase 3 tracker.

## 6. Current task and progress

Phase 5 is finished in code (uncommitted). Tasks: `apps/api/src/modules/tasks/` (every route loads the task's project through `loadProject`, so a task is visible exactly when its project is; every change sends the task's `version`, a stale one answers 409 `VERSION_CONFLICT` with the latest task; services call `recordTask` for the history and `emitEvent` (`apps/api/src/lib/events.ts`) for Phase 6, whose socket gateway only has to listen there). Web: `apps/web/src/features/tasks/`; a task opens in a panel (`?task=NEX-42`, mounted once in `ProjectLayout`) or on its own page. Project access is decided in one place, `packages/shared/src/projects.ts#projectAccess` (PRD §12.4), used by the API (`apps/api/src/modules/projects/access.ts#loadProject`, 404 without access) and shown to the web through each project's `access` field. Project pages get the project from `useProjectOutlet()` (`apps/web/src/pages/ProjectLayout.tsx`). The web app gets everything from the API: `useWorkspace()` reads `GET /orgs/:org/context` (`sampleData.ts` is deleted). Web cache rules live in `apps/web/src/features/organizations/hooks.ts`: after a delete/leave, `refreshAfterRemoval` waits for fresh lists before navigating to `/`; a created/renamed workspace is written into the cached context at once (`cacheWorkspace`) so its new address never flashes "not found".

## 7. Important files and directories

| Purpose                           | Path                                                                                                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requirements, trackers, decisions | `PRD.md` (§27 trackers, Appendix A decisions, Appendix D env vars)                                                                                                                                                            |
| Working rules                     | `CLAUDE.md`                                                                                                                                                                                                                   |
| Env template (placeholders only!) | `.env.example`                                                                                                                                                                                                                |
| API entry / app / routes          | `apps/api/src/server.ts`, `apps/api/src/app.ts`, `apps/api/src/routes.ts`                                                                                                                                                     |
| Env validation                    | `apps/api/src/config/env.ts`                                                                                                                                                                                                  |
| Auth                              | `apps/api/src/modules/auth/` (`auth.service.ts`, `auth.routes.ts`, `session.service.ts`, `password.ts`, `google.ts`, `verificationTokens.ts`), `apps/api/src/middleware/auth.ts`, `csrf.ts`                                   |
| Users                             | `apps/api/src/modules/users/users.routes.ts`, `users.service.ts`                                                                                                                                                              |
| Phase 3                           | `apps/api/src/modules/organizations/*`, `apps/api/src/middleware/tenant.ts`, `apps/api/src/lib/planGuard.ts`, `apps/api/src/lib/activity.ts`                                                                                  |
| Shared rules                      | `packages/shared/src/{auth,organizations,permissions,plans,taskStatuses}.ts`                                                                                                                                                  |
| DB                                | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`, `apps/api/prisma/seed.ts`, `apps/api/prisma.config.ts`, `apps/api/src/lib/prisma.ts`                                                                          |
| API docs                          | `apps/api/src/docs/openapi.ts` → `apps/api/openapi.json`                                                                                                                                                                      |
| Tests                             | `apps/api/tests/*.test.ts`, `apps/api/tests/helpers/{http,database}.ts`, `apps/api/tests/globalSetup.ts`, `apps/api/vitest.config.ts`, unit tests next to code (`*.test.ts`)                                                  |
| Web                               | `apps/web/src/routes.tsx`, `main.tsx`, `features/auth/*`, `features/account/hooks.ts`, `features/organizations/*`, `hooks/useWorkspace.ts`, `layouts/*`, `pages/*`, `components/ui/*`, `lib/{api,queryClient,utils,theme}.ts` |

## 8. Database and API status

- DB: all 3 migrations applied to the current Neon dev branch; sample data seeded (Acme Studio, Globex; password `Acme-demo-2026`). The test branch is migrated automatically by `tests/globalSetup.ts`. No schema changes pending for Phase 3/4. See DATABASE.md.
- DB: one migration for Phase 5 (`20261119090000_p5_task_position_order`: byte-order collation for `Task.position`), already applied to the dev branch; the test branch gets it from `tests/globalSetup.ts`.
- API: Phase 1–5 endpoints documented in `openapi.json` (109 operations). See API.md.

## 9. Known bugs

No open code bugs. Environment: pg `sslmode` SECURITY WARNING (harmless); Neon password was exposed in chat and should be rotated before going public. Two Claude sessions were once open on this folder at the same time and edited `openapi.ts` together. Work in only one session at a time.

## 10. Pending tasks

See TODO.md: the deferred Phase 3 items, then Phases 4–12 per PRD §27 (MVP ends after Phase 8).

## 11. Exact next steps (in order)

1. Phase 6 is done: `apps/api/tests/comments.test.ts` and `realtime.test.ts` pass (10 tests). Two earlier runs hung once each, probably on a database connection that died while the laptop slept; `apps/api/src/lib/prisma.ts` now has a 30 s `query_timeout` and keep-alive, so such a hang now fails fast with an error instead.
2. When the user says "commit": the full `pnpm test` must pass first (it takes ~25–30 minutes; keep the computer awake); stage, scan for secrets (`npg_`, connection strings, API keys), commit with the trailer, push, confirm CI.
3. Phase 9 is committed (`8ed87c8`) (see the PRD §27 Phase 9 tracker; 9.5 items are for later). To try it, the developer puts free Razorpay **test** keys and 4 plan ids in `.env` (never `.env.example`), upgrades in Settings › Billing with test card 4111 1111 1111 1111, then clicks "Check payment status" (webhooks cannot reach localhost). Next: Phase 10 (automations).
4. Earlier: committed `b24afeb` (Phases 5–7.3, CI green). Since then, uncommitted: Phase 7.4 attachments (`apps/api/src/modules/attachments/`, storage provider `apps/api/src/lib/storage/files.ts` with an in-memory stand-in for tests; web `features/tasks/detail/AttachmentsSection.tsx`; 2 tests pass) and Phase 8.1–8.4 (analytics `apps/api/src/modules/analytics/`, search `apps/api/src/modules/search/`, web `apps/web/src/features/insights/`, `pages/PricingPage.tsx`, Home "My focus"; 2 tests pass). Next: 8.5 (⌘K palette needs `cmdk` approval; accessibility pass; README; E2E). Earlier notes: Phase 7 steps 7.1–7.3 are done (pg-boss jobs in `apps/api/src/lib/jobs.ts` + `apps/api/src/jobs/`, `notify()` in `apps/api/src/modules/notifications/notifications.service.ts`, Inbox and settings in `apps/web/src/features/notifications/`; 4 tests pass). Next: step 7.4 attachments (Cloudinary signed uploads like avatars in `apps/api/src/lib/storage/cloudinary.ts`; needs the developer's free Cloudinary keys for real uploads; enqueue a destroy job before `trash.purge` deletes rows with files).

## 12. How to avoid breaking existing functionality

- Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and the relevant tests after every change; the full `pnpm test` before committing. CI runs the same checks.
- Never return a Prisma `User` directly; use `toCurrentUser()` (`apps/api/src/modules/auth/auth.service.ts`). Tests assert no password hash leaks.
- After changing user or session data in the DB, call `forgetCachedSessions(...)` (`session.service.ts`), or the 30 s session cache serves stale data.
- Every tenant query must filter by `organizationId`; org routes must go through `loadTenant` (404 for outsiders). Add an outsider test for each new org endpoint.
- Every new endpoint: document in `apps/api/src/docs/openapi.ts` and regenerate `openapi.json`.
- Web requests that change data must use `apiPost/apiPatch/apiDelete` (they add the CSRF header).
- Schema changes: create migrations with `--create-only` when tables with hand-written SQL are touched; confirm `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` is empty afterwards. Never drop the generated `searchVector` columns.
- Database tests must use `inRollbackTransaction()` (`apps/api/tests/helpers/database.ts`) or clean up their own users (`createTestClient(domain).cleanup()`).
- Keep `.env.example` placeholders only; the user has repeatedly pasted real secrets into it — check with `grep -c npg_ .env.example` (must be 0) before every commit.
- Keep versions pinned: TypeScript 6.0.x, Prisma 7.10.1.
- Don't let the computer sleep during long test runs (an interrupted run left a half-applied migration once; `globalSetup.ts` now repairs that on the test DB only).
