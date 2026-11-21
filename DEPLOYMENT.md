# NexusFlow — Deployment guide

NexusFlow runs as **one free Render Web Service**: it serves the web app, the API and the live
updates (Socket.io) from one address. The data lives in a **free Neon PostgreSQL** database.
Every service below is on a free plan; nothing here costs money. Requirements: [PRD.md](PRD.md) §26.

## 1. Prepare the database (Neon)

1. In Neon, create a project in **US East (Ohio)**, the same region as the Render service. Its
   `main` branch is production.
2. Copy two connection strings from Neon → **Connect**: the **pooled** one (host contains
   `-pooler`) and the **direct** one (pooling off).
3. Never put these strings in a committed file. The migrations run by themselves on every start
   (step 2).

## 2. Create the Render service

The repository has a **Blueprint**, [`render.yaml`](render.yaml), with every setting.

1. Render → **New → Blueprint** → connect this GitHub repository → **Apply**.
2. Render creates the free service `nexusflow` in Ohio and asks for every value marked
   `sync: false` (step 3).

What the Blueprint sets up:

| Setting       | Value                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------- |
| Build command | `npm install -g pnpm && pnpm install --frozen-lockfile && pnpm build`                             |
| Start command | `pnpm --filter @nexusflow/api db:deploy && pnpm --filter @nexusflow/api start`                    |
| Health check  | `/api/v1/health`                                                                                  |
| Auto-deploy   | on: every push to `main`                                                                          |
| Fixed values  | `NODE_ENV=production`, `JOBS_ENABLED=true`, `DEMO_MODE=true`, `MAIL_PROVIDER=brevo`, AI on Gemini |

Migrations run at start because Render's separate pre-deploy step is a paid feature. They only
add things (expand → migrate → contract), so rolling back to an older deploy never needs a
database downgrade.

## 3. Environment variables (Render → Environment)

| Name                                                                   | Where to get it                                                                        |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `APP_URL`, `WEB_ORIGINS`                                               | the service address, e.g. `https://nexusflow.onrender.com` (both the same)             |
| `DATABASE_URL`                                                         | Neon pooled connection string                                                          |
| `DIRECT_DATABASE_URL`                                                  | Neon direct connection string (migrations)                                             |
| `BREVO_API_KEY`, `MAIL_FROM`                                           | Brevo (free: 300 emails a day); `MAIL_FROM` must be a sender you verified in Brevo     |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary (free plan), for photos and attachments                                     |
| `AI_API_KEY`                                                           | optional: aistudio.google.com (free); without it AI stays hidden                       |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`                               | optional: Razorpay **test mode** API keys; without them upgrading stays off            |
| `RAZORPAY_WEBHOOK_SECRET`                                              | a long random password you choose, typed into Razorpay's webhook settings too (step 4) |
| `RAZORPAY_PLAN_*` (4)                                                  | the four test-mode plan ids (`plan_…`)                                                 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                             | optional, "Continue with Google"; redirect `https://<app>/api/v1/auth/google/callback` |

Secrets live only in Render (and your own `.env`), never in the repository. `.env.example` lists
every variable with empty values.

## 4. After the first deploy

1. Open `https://<app>/api/v1/health/ready`: it answers `ready` when the database is reachable.
2. Open the site: the login page shows **Try the demo**. The demo organization "Acme Studio" is
   built at the first start (about a minute); until then the button says "being prepared".
3. **Razorpay webhook** (only if payments are set up): Razorpay (Test Mode) → Account & Settings →
   Webhooks → Add → URL `https://<app>/api/v1/billing/webhooks/razorpay`, secret =
   `RAZORPAY_WEBHOOK_SECRET`, events `subscription.*`, `payment.failed`, `invoice.paid`.
4. **GitHub**: Settings → Secrets and variables → Actions →
   - Variable `APP_URL` = the site address, so the **Deploy check** workflow tests each deploy.
   - Secrets `BACKUP_DATABASE_URL` (Neon direct string) and `BACKUP_PASSPHRASE` (a long random
     password you keep safe), so the **Weekly backup** workflow runs.

## 5. Free-tier behaviour to expect

- **Render sleeps after 15 minutes without visitors**; the first visit afterwards takes about
  30–60 seconds while Render shows its own loading page. Background jobs pause while it sleeps;
  on waking, every timetable job runs once to catch up. Do not add a keep-alive ping: it would
  also keep Neon awake and use up its free compute hours.
- **Neon suspends the database when idle** and wakes it on the next query (a few seconds).
- **Brevo** sends at most 300 emails a day; beyond that emails are skipped and in-app
  notifications still work.
- **Gemini's free tier** has its own per-minute limits; when it is busy, AI answers "busy, try
  again in a minute".
- **The demo** is shared by all visitors and rebuilt every 24 hours (`DEMO_RESET_HOURS`).

## 6. Updating and rolling back

Push to `main`. GitHub Actions runs formatting, lint, types, the build and every test against a
throwaway PostgreSQL. Render then builds, migrates and starts the new version, and **Deploy
check** waits for `/api/v1/health/ready`. To roll back: Render → the service → Events → an older
deploy → **Rollback**.

## 7. Release checklist

- [ ] CI is green on the commit (GitHub → Actions).
- [ ] `git diff --cached .env.example` shows empty values only; no keys in any committed file.
- [ ] New environment variables are added on Render and in `.env.example` (empty).
- [ ] After the deploy: **Deploy check** passed, `/api/v1/health/ready` says `ready`.
- [ ] Try the demo once: board, a task, a comment, Insights.
- [ ] If payments changed: one test-mode checkout with card 4111 1111 1111 1111.

When something goes wrong, see the [runbooks](docs/runbooks/README.md).
