# Project overview

NexusFlow is a multi-tenant SaaS project-management and team-collaboration app, built as a zero-cost portfolio project. Users belong to organizations, which contain workspaces, teams, projects and tasks. Tasks show up in Kanban, List and Calendar views, with comments, mentions, real-time updates, notifications, file attachments and an analytics dashboard. Billing runs in Razorpay test mode. A "Try the demo" login lets recruiters explore without signing up. See PRD.md for full details: it is the single source of truth.

# Tech stack

- Monorepo: pnpm workspaces (`apps/web`, `apps/api`, `packages/shared`)
- Frontend: React + TypeScript + Vite + Tailwind CSS + shadcn/ui, TanStack Query, Zustand, React Hook Form + Zod
- Backend: Node.js 24 + Express 5 + TypeScript, Socket.io, pg-boss for background jobs. Node runs the API's `.ts` files directly (type stripping), so imports use `.ts` extensions and TypeScript-only syntax like `enum` is not allowed.
- Database: PostgreSQL with Prisma ORM (Neon free tier for development, tests and production)
- Services (all free tiers): Cloudinary for files, Brevo for email, Razorpay test mode for payments, Gemini for optional AI
- Hosting: one Render free web service serves the frontend, API and sockets from a single URL
- Testing: Vitest, Supertest, Playwright

# Commands

These are the planned commands. They start working once Phase 1 (project setup) is done.

- Database: no Docker. Local development uses a free Neon `dev` branch and tests use a Neon `test` branch; emails print to the terminal in development.
- Install dependencies: `pnpm install`
- Run dev server: `pnpm dev` (open the web app at http://localhost:5173; the API runs on http://localhost:4000 and Vite forwards `/api` to it)
- Build for production: `pnpm build` (then the API also serves the app at http://localhost:4000)
- Design tokens (colors, radius, font) live in `apps/web/src/styles/index.css`; use token classes like `bg-primary`, never raw hex colors
- Every page address is listed in `apps/web/src/routes.tsx`. UI building blocks (shadcn style) are in `apps/web/src/components/ui/`; join classes with `cn()` from `lib/utils.ts`
- `apps/web/src/lib/sampleData.ts` is temporary sample data for the sidebar; Phase 3 replaces it with the real organization context from the API
- Run tests: `pnpm test` (needs `TEST_DATABASE_URL` in `.env`: the Neon `test` branch, never the dev one; a guard refuses the dev database). Watch mode: `pnpm --filter @nexusflow/api test:watch`
- Database tests must use `inRollbackTransaction()` from `apps/api/tests/helpers/database.ts` so they never leave data behind
- After adding or changing an API endpoint, describe it in `apps/api/src/docs/openapi.ts` and run `pnpm --filter @nexusflow/api docs:openapi` (a test fails if `openapi.json` is out of date)
- Run end-to-end tests: `pnpm test:e2e`
- Apply database migrations: `pnpm db:migrate` (regenerate the client: `pnpm db:generate`; browse data: `pnpm db:studio`)
- Prisma is pinned to 7.10.1 (the `prisma` package's default version is an 8.0 release candidate)
- Fill the dev database with sample data: `pnpm db:seed` (safe to repeat; about 40 seconds)
- Hand-written SQL lives in the migrations: generated `searchVector` columns and CHECK constraints. Prisma cannot describe them, so after creating a migration with `--create-only`, check its SQL before applying, and confirm `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` reports an empty migration.
- Lint and type-check: `pnpm lint` and `pnpm typecheck`
- Format code: `pnpm format` (check only: `pnpm format:check`)
- TypeScript is pinned to 6.0.x because typescript-eslint does not support TypeScript 7 yet

# Code style

- Keep functions small, name things clearly
- Add comments only where the "why" is not obvious
- TypeScript strict mode everywhere; share types and Zod schemas through `packages/shared`
- Backend layers: routes → controllers → services → repositories. Business rules live in services.
- Every database query on tenant data must be scoped by `organizationId`
- Check permissions and plan limits on the server, never only in the UI

# Rules for Claude

- I am a beginner. Before writing code, explain your approach in 3-4 lines.
- Make small changes: one feature at a time.
- Do not add new libraries without asking me first. PRD.md §16 lists the planned libraries, but still ask before installing each one.
- Never read, edit or print the .env file. Never hardcode secrets.
- After each change, tell me how to run it and what to expect.
- Use only free services and free-tier features. Never suggest anything that costs money.
- Follow PRD.md. If a change differs from the PRD, tell me first and update the PRD.
- Build in the phase order from PRD.md §27, starting with Phase 1.
