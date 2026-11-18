# NexusFlow — TODO

_Order matters: finish each block before the next. Requirements: [PRD.md](PRD.md). Rules for working on this repo: [CLAUDE.md](CLAUDE.md)._

## 1. Immediate next tasks

1. **Try Phase 3 in the browser** (`pnpm dev`, http://localhost:5173): log in as `aarav@acme.example` / `Acme-demo-2026`; switch workspaces; open Settings → Members / Invitations / Usage / Audit log; create a new account and an organization via onboarding; invite it from Acme and accept in a private window (the invite link prints in the API terminal).
2. **Start Phase 4** (teams, projects, labels, statuses, milestones; PRD §27).

## 2. Deferred from Phase 3 (listed in PRD §27 Phase 3 tracker)

- Organization/workspace logo upload, workspace branding color.
- Workspace activity page in the web app (API: `GET /orgs/:org/workspaces/:ws/activity`).
- Audit-log CSV export.
- Background job that marks invitations EXPIRED (Phase 7, pg-boss).
- Redirect from old organization slugs (`slugHistory`).
- Prisma tenant extension (PRD §20.3).
- Playwright E2E journey (create org → invite → accept → switch → change role → audit entry).

## 3. Pending phases (from PRD §27)

| Phase | Content                                                                                                   | Depends on |
| ----- | --------------------------------------------------------------------------------------------------------- | ---------- |
| 4     | Teams, projects (create, key, statuses, milestones, archive, trash), labels; project shortcuts in sidebar | Phase 3    |
| 5     | Tasks: numbering, statuses, assignees, subtasks, dependencies, Kanban (dnd-kit), List, Calendar, My Tasks | Phase 4    |
| 6     | Comments, reactions, Socket.io real-time, presence                                                        | Phase 5    |
| 7     | Notifications (in-app + email, reminders, pg-boss jobs), file attachments (Cloudinary)                    | Phase 6    |
| 8     | Dashboard/analytics, global search (⌘K), pricing page — **MVP exit**                                      | 5–7        |
| 5b    | Gantt/timeline, task templates, recurring tasks                                                           | 8          |
| 9     | Razorpay billing (test mode)                                                                              | 3, 7, 8    |
| 10    | Automation engine                                                                                         | 5, 7, 9    |
| 11    | AI features (Gemini)                                                                                      | 5, 8, 9    |
| 12    | Hardening, load tests, deployment to Render + Neon, demo mode, portfolio README                           | all        |

## 4. Optional setup (by the developer, free)

- Brevo API key (`MAIL_PROVIDER=brevo`) for real emails.
- Cloudinary keys for profile photos.
- Google Cloud OAuth client for "Continue with Google" (redirect URI `http://localhost:5173/api/v1/auth/google/callback`).
- Reset the Neon password before making anything public (it was pasted in chat), and paste new strings only into `.env`.
