# NexusFlow — Deployment guide (draft)

_Draft for Phase 8 (MVP); the full go-live checklist, monitoring and demo mode come in Phase 12. Requirements: [PRD.md](PRD.md) §26._

NexusFlow runs as **one free Render Web Service** that serves the web app, the API and Socket.io from the same address, plus a **free Neon PostgreSQL** database. Everything stays on free tiers.

## 1. Prepare the database (Neon)

1. In Neon, create a project in **US East (Ohio)** (the same region as the Render service) with a `main` (production) branch.
2. Copy two connection strings from the Neon dashboard: the **pooled** one (host contains `-pooler`) and the **direct** one.
3. From your computer, apply the migrations to it once (they run again automatically on every deploy, see step 3):

   ```powershell
   $env:DATABASE_URL = "<pooled connection string>"; $env:DIRECT_DATABASE_URL = "<direct connection string>"
   pnpm --filter @nexusflow/api db:deploy
   ```

   Never put these strings in a committed file. Do not seed production with sample data unless you want a demo.

## 2. Create the Render service

New → **Web Service** → connect the GitHub repository, branch `main`, region **Ohio**, instance type **Free**.

| Setting           | Value                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Runtime           | Node (Render reads `.node-version`, Node 24)                                                                    |
| Build command     | `npm install -g pnpm && pnpm install --frozen-lockfile && pnpm build && pnpm --filter @nexusflow/api db:deploy` |
| Start command     | `pnpm --filter @nexusflow/api start`                                                                            |
| Health check path | `/api/v1/health`                                                                                                |
| Auto-deploy       | On (every push to `main` after CI passes)                                                                       |

## 3. Environment variables (Render → Environment)

| Name                                                                   | Value                                                                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                             | `production`                                                                                    |
| `DATABASE_URL`                                                         | Neon pooled connection string                                                                   |
| `DIRECT_DATABASE_URL`                                                  | Neon direct connection string (migrations)                                                      |
| `APP_URL`                                                              | `https://<your-service>.onrender.com`                                                           |
| `WEB_ORIGINS`                                                          | the same address                                                                                |
| `MAIL_PROVIDER`                                                        | `brevo` (or `console` to only log emails)                                                       |
| `BREVO_API_KEY`, `MAIL_FROM`                                           | from Brevo (free: 300 emails a day); `MAIL_FROM` must be a sender verified in Brevo             |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | from Cloudinary (free plan) for photos and attachments                                          |
| `CLOUDINARY_FOLDER_PREFIX`                                             | `nexusflow/production`                                                                          |
| `JOBS_ENABLED`                                                         | `true` (reminders and emails)                                                                   |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                             | optional, for "Continue with Google" (redirect `https://<service>/api/v1/auth/google/callback`) |

Secrets live only in Render's environment settings, never in the repository. `.env.example` lists every variable with placeholders.

## 4. After the first deploy

1. Open `https://<service>.onrender.com/api/v1/health/ready` — it answers `ok` when the database is reachable.
2. Sign up, verify the email (or read the link in the Render logs with `MAIL_PROVIDER=console`), create an organization.
3. Check the browser console for the live connection (`/socket.io` upgrades to a WebSocket).

## 5. Free-tier behaviour to expect

- **Render sleeps after 15 minutes without visitors**; the first visit afterwards takes about 30–60 seconds. Background jobs pause while it sleeps; hourly reminders run again once it wakes.
- **Neon suspends the database when idle** and wakes it on the next query (a few seconds). Background jobs check the database every 30–60 seconds while the API runs.
- Brevo sends at most 300 emails a day; beyond that emails are skipped and in-app notifications still work.

## 6. Updating

Push to `main`. GitHub Actions runs formatting, lint, types, build and the tests against a throwaway PostgreSQL; Render then builds and deploys, applying any new migrations in the build step.
