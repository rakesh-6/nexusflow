# NexusFlow

A multi-tenant SaaS platform for project management and team collaboration, built as a portfolio project on free-tier services only.

The full product specification is in [PRD.md](PRD.md).

## Project structure

```
apps/web         React frontend (Vite)
apps/api         Express backend (REST API + Socket.io)
packages/shared  Code shared by web and api (types, validation schemas)
```

## Requirements

- Node.js 24 or newer (it runs the API's TypeScript directly)
- pnpm (`npm install -g pnpm`)

## Getting started

```bash
pnpm install        # install all dependencies
pnpm typecheck      # check TypeScript types
pnpm lint           # find likely bugs with ESLint
pnpm format         # auto-format code with Prettier
pnpm format:check   # check formatting without changing files
pnpm test           # run all automated tests (uses the test database)
pnpm dev            # start the web app (http://localhost:5173) and the API (port 4000)
pnpm build          # build the web app; the API then serves it on http://localhost:4000
pnpm db:migrate     # apply database migrations to your Neon dev branch
pnpm db:studio      # browse the database in your browser
pnpm db:seed        # fill the database with sample data (Acme Studio and Globex)
```

Settings come from a `.env` file in the project root. Copy `.env.example` to `.env` to start; the defaults work for local development.

More commands are added as the project grows. See CLAUDE.md for the planned list.
