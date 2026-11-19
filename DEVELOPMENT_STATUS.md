# NexusFlow — Development Status

_Last updated: 2026-11-19. Source of truth for requirements: [PRD.md](PRD.md) (progress trackers in PRD §27)._

## Project overview

NexusFlow is a multi-tenant SaaS project-management and team-collaboration app (organizations → workspaces → teams → projects → tasks), built as a **zero-cost portfolio project**: every service runs on a free tier (Render, Neon, Cloudinary, Brevo, Razorpay test mode, Gemini). It is a pnpm monorepo: `apps/api` (Node 24 + Express 5 + Prisma 7), `apps/web` (React 19 + Vite 8 + Tailwind 4), `packages/shared` (Zod schemas and rules used by both).

Repository: https://github.com/rakesh-6/nexusflow (branch `main`).

## Current phase

**Phase 5 — Tasks, board, list, calendar, My Tasks: DONE (backend + frontend), NOT YET COMMITTED.** **Phase 6 — comments, reactions and live updates (Socket.io, presence, typing): DONE (API + web), NOT YET COMMITTED; its 10 API tests pass.** Next: the full test run, commit when the user says so, then Phase 7 (notifications and files).

| Phase                                                | Status                                     | Commit    |
| ---------------------------------------------------- | ------------------------------------------ | --------- |
| 1 Setup and architecture (8 steps)                   | ✅ Done, CI green                          | `ff532f3` |
| 2 Authentication and user management (steps 2.1–2.6) | ✅ Done, 57 API tests pass, CI green       | `64eb645` |
| 3 Organizations and workspaces (steps 3.1–3.7)       | ✅ Done, CI green                          | `15068dd` |
| 4 Teams and projects (steps 4.1–4.5)                 | ✅ Done, CI green                          | `76afd75` |
| 5 Tasks and project views (steps 5.1–5.6)            | ✅ Done, uncommitted (see PRD §27 tracker) | —         |
| 6 Comments and real-time (steps 6.1–6.4)             | ✅ Done, uncommitted (see PRD §27 tracker) | —         |
| 7 Notifications and files (steps 7.1–7.4)            | 🟡 7.1–7.3 done, uncommitted; 7.4 next     | —         |
| 8–12                                                 | ⬜ Not started                             | —         |

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

## Phase 4 (done) — where things are

| Part                                                                                    | Files                                                                                                          |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Access rules (§12.4), key suggestion, schemas, response types (10 unit tests)           | `packages/shared/src/projects.ts`, `projects.test.ts`                                                          |
| Project access loader, accessible-projects filter, progress                             | `apps/api/src/modules/projects/access.ts`                                                                      |
| Projects, members, trash, activity; columns and milestones; labels                      | `apps/api/src/modules/projects/{projects,structure,labels}.service.ts`, `projects.routes.ts`                   |
| Teams and team members                                                                  | `apps/api/src/modules/teams/teams.{service,routes}.ts`                                                         |
| Shared route helpers (`workspaceFor`, `idParam`), "may this person be picked" check     | `apps/api/src/modules/organizations/{requestContext,people}.ts`                                                |
| API tests (10) and docs (37 new operations, in their own file)                          | `apps/api/tests/projects.test.ts`, `tests/helpers/orgs.ts`, `apps/api/src/docs/{projectEndpoints,helpers}.ts`  |
| Web hooks, labels/badges, New project dialog                                            | `apps/web/src/features/projects/{hooks.ts,labels.tsx,NewProjectDialog.tsx}`                                    |
| Pages: Projects, project settings, Teams, Team                                          | `apps/web/src/features/projects/pages/*`, `apps/web/src/pages/ProjectLayout.tsx` (header + `useProjectOutlet`) |
| Settings sections: project details/members/columns/milestones, labels, trash, all teams | `apps/web/src/features/projects/settings/*`                                                                    |

## Phase 5 (done) — where things are

| Part                                                                                               | Files                                                                                                                                   |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Task schemas, card positions, cycle check, date helpers, rich-text rules (14 unit tests)           | `packages/shared/src/{tasks,dates,richText}.ts`, `tasks.test.ts`                                                                        |
| Task loading, cards, assignable people                                                             | `apps/api/src/modules/tasks/taskAccess.ts`                                                                                              |
| Filters, sorting, paging; card order keys; shared checks (numbering, versions, history)            | `apps/api/src/modules/tasks/{taskQueries,taskPositions,taskRules}.ts`                                                                   |
| Create, read, change, move, delete, restore, duplicate; lists, board, My Tasks; links and bulk     | `apps/api/src/modules/tasks/{tasks,taskLists,taskRelations}.service.ts`, `tasks.routes.ts`                                              |
| Event hook for Phase 6, shared history reader                                                      | `apps/api/src/lib/events.ts`, `apps/api/src/lib/activity.ts#listActivity`                                                               |
| API tests (10) and docs (17 new operations)                                                        | `apps/api/tests/tasks.test.ts`, `apps/api/src/docs/taskEndpoints.ts`                                                                    |
| Web hooks (optimistic changes, conflicts), filter bar, pickers, New task dialog, small task pieces | `apps/web/src/features/tasks/{hooks.ts,useTaskFilters.ts,TaskFilterBar.tsx,pickers.tsx,NewTaskDialog.tsx,taskBits.tsx}`                 |
| Board (dnd-kit), List (TanStack Table + Virtual), Calendar, My Tasks                               | `apps/web/src/features/tasks/{board/BoardPage,list/ListPage,calendar/CalendarPage}.tsx`, `pages/MyTasksPage.tsx`                        |
| Task panel (`?task=NEX-42`) and page; description editor (Tiptap, lazy), links, history            | `apps/web/src/features/tasks/{TaskPanel,TaskPage}.tsx`, `detail/*`; the panel is mounted once in `apps/web/src/pages/ProjectLayout.tsx` |
| Migration: byte-order sorting for card keys                                                        | `apps/api/prisma/migrations/20261119090000_p5_task_position_order`                                                                      |

## Phase 6 (in progress) — where things are

| Part                                                                             | Files                                                                                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Comment schemas, reaction emoji, mention clean-up                                | `packages/shared/src/comments.ts`, `packages/shared/src/richText.ts#sanitizeMentions`                                                     |
| Comments API (threads, placeholders, mentions, reactions, notification requests) | `apps/api/src/modules/comments/comments.{service,routes}.ts`, `apps/api/src/lib/notifications.ts`                                         |
| API tests (AC-COMM-01…05, permissions, tenant isolation) and docs (6 operations) | `apps/api/tests/comments.test.ts`, `apps/api/src/docs/commentEndpoints.ts`                                                                |
| Web: comments section, comment box with @ picker, JSON-to-React renderer         | `apps/web/src/features/tasks/detail/{CommentsSection,CommentEditor,CommentBody}.tsx`, hooks in `hooks.ts`                                 |
| Live updates: gateway (rooms, events, presence, typing, access re-checks)        | `apps/api/src/realtime/gateway.ts` (started in `server.ts`), `recheckAccessAfter` in `middleware/tenant.ts`                               |
| Live-update tests (AC-RT-01…05, rooms of other organizations)                    | `apps/api/tests/realtime.test.ts`                                                                                                         |
| Web: connection, rooms, cache refresh, presence, typing                          | `apps/web/src/lib/realtime.ts`, `apps/web/src/features/realtime/useRealtime.ts` (used by AppShell, ProjectLayout, TaskDetailView, TopBar) |

## Known bugs and errors

No open code bugs. (Fixed on 2026-11-18: DELETE workspace without a body now defaults to `{ deleteContents: false }`; the slow multi-request tests have a 120 s timeout — the Phase 3 file takes ~5.5 minutes against Neon.)

1. **Environment notes (not code bugs):**
   - The pg driver prints a `SECURITY WARNING` about `sslmode=require`; harmless. Using `sslmode=verify-full` in `.env` removes it.
   - The developer has several times pasted real Neon connection strings into `.env.example`; it must only contain placeholders (it does now).
   - Prisma's migration engine reports a wrong password as `P1001 Can't reach database server`; the real error is `28P01 password authentication failed`.
   - If a test run is interrupted mid-migration, `tests/globalSetup.ts` now rebuilds the test database automatically (handles Prisma `P3009`).

## Test status

| Suite                                            | Result                                                         |
| ------------------------------------------------ | -------------------------------------------------------------- |
| `pnpm test` (full run 2026-11-18, 917 s)         | 113 tests pass: `packages/shared` 28, `apps/api` 85 (11 files) |
| of which Phase 3 (`tests/organizations.test.ts`) | 18 pass (~5.5 minutes on its own against Neon)                 |
| Web page renders (temporary SSR check)           | 16 pass (owner and member views, signed-out invitation)        |
| Phase 4 (`tests/projects.test.ts`)               | 10 pass (~7 minutes on its own against Neon)                   |
| Phase 4 page renders                             | 11 pass (owner and read-only member views)                     |
| Typecheck / lint / format / web build            | Pass                                                           |
