# NexusFlow

A multi-tenant SaaS platform for project management and team collaboration — organizations, workspaces, teams, projects and tasks, with a Kanban board, list and calendar views, comments with mentions, live updates, notifications, file attachments, an analytics dashboard, billing in Razorpay test mode, automation rules and AI suggestions. It is a portfolio project that runs entirely on free tiers.

**Try it without signing up:** the login page has a **Try the demo** button. You join the sample company "Acme Studio" as an admin; it resets every day.

The full product specification is in [PRD.md](PRD.md); progress per phase is tracked in PRD §27 and [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md).

## What you can do in it

- **Organizations and workspaces**: invite people by email, roles (owner, admin, member, guest), plan limits, audit log.
- **Teams and projects**: project roles, columns, milestones, labels, archive and a 30-day trash.
- **Tasks**: Kanban board with drag and drop (mouse, touch or keyboard), a sortable list with inline editing and bulk changes, a month/week calendar, My Tasks, subtasks, "blocked by" links, rich-text descriptions, history.
- **Collaboration**: comments with replies, @mentions and reactions; changes, presence ("also viewing") and "is typing…" arrive live over Socket.io.
- **Notifications**: inbox with unread badge, per-type in-app and email settings, due-soon and overdue reminders from background jobs.
- **Files**: attachments on tasks through Cloudinary signed uploads, checked by the server, with 15-minute links.
- **Insights**: tiles, completion trend, status and priority breakdowns, project health, workload; global search and a ⌘K command palette; a public pricing page.
- **Billing**: Free, Pro and Business plans with Razorpay test-mode checkout, signed webhooks, upgrade, downgrade with a limits check, cancel, invoices (no real money moves).
- **Automations**: "when a task is done, notify the project managers" style rules with a three-step builder, ready-made recipes, dry runs, a run log and loop protection.
- **AI (optional, Gemini free tier)**: draft task descriptions, suggest subtasks and due dates, summarize projects and meeting notes, explain the numbers. Every answer is a reviewed suggestion.

## Tech stack

| Part                  | Choice                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Monorepo              | pnpm workspaces: `apps/web`, `apps/api`, `packages/shared`                                                                                 |
| Web                   | React 19, Vite 8, Tailwind CSS 4, Radix UI, TanStack Query, React Router, React Hook Form + Zod, dnd-kit, Tiptap, TanStack Table + Virtual |
| API                   | Node.js 24 (runs TypeScript directly), Express 5, Zod, Socket.io, pg-boss                                                                  |
| Database              | PostgreSQL on Neon, Prisma 7                                                                                                               |
| Services (free tiers) | Neon, Cloudinary (files), Brevo (email), Razorpay test mode (billing), Gemini (AI), Render (hosting)                                       |
| Tests                 | Vitest + Supertest (API, against a real Neon test branch), Vitest unit tests                                                               |

Architecture notes: [ARCHITECTURE.md](ARCHITECTURE.md) · database: [DATABASE.md](DATABASE.md) · API: [API.md](API.md) (and `apps/api/openapi.json`) · deployment: [DEPLOYMENT.md](DEPLOYMENT.md) · runbooks: [docs/runbooks](docs/runbooks/README.md).

## Project structure

```
apps/web         React frontend (Vite)
apps/api         Express backend (REST API, Socket.io, background jobs)
packages/shared  Code shared by web and api (types, validation schemas, rules)
```

## Requirements

- Node.js 24 or newer (it runs the API's TypeScript directly)
- pnpm (`npm install -g pnpm`)
- Two free Neon database branches: `dev` and `test`

## Getting started

```bash
pnpm install        # install all dependencies
cp .env.example .env  # then paste your Neon connection strings into .env
pnpm db:migrate     # create the tables in your Neon dev branch
pnpm db:seed        # sample data (Acme Studio and Globex)
pnpm dev            # web app on http://localhost:5173, API on port 4000
```

Log in as `aarav@acme.example` with the password `Acme-demo-2026` (other sample people: `meera@`, `rohan@`, `priya@acme.example`, `gina@globex.example`, same password).

Other commands:

```bash
pnpm typecheck      # check TypeScript types
pnpm lint           # find likely bugs with ESLint
pnpm format         # auto-format code with Prettier (format:check only checks)
pnpm test           # all automated tests (uses the Neon test branch; ~40 minutes)
pnpm build          # build the web app; the API then serves it on http://localhost:4000
pnpm db:studio      # browse the database in your browser
```

Optional, all free: Cloudinary keys for profile photos and attachments, a Brevo API key for real emails, Google OAuth keys for "Continue with Google", Razorpay **test** keys for billing, a Gemini key (`AI_API_KEY`) for AI, `DEMO_MODE=true` for the "Try the demo" button. Without them those features explain that they are not set up. Set `JOBS_ENABLED=false` in `.env` to stop background jobs from keeping the free database awake.
