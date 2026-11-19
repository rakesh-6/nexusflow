# NexusFlow — TODO

_Order matters: finish each block before the next. Requirements: [PRD.md](PRD.md). Rules for working on this repo: [CLAUDE.md](CLAUDE.md)._

## 1. Immediate next tasks

1. **Try Phase 5 in the browser** (`pnpm dev`, http://localhost:5173, log in as `aarav@acme.example` / `Acme-demo-2026`): open a project → Board (drag a card to another column; press C for a new task; open a card), List (sort, edit a priority inline, select rows for the bulk bar, Columns menu), Calendar (drag a task to another day, click an empty day), My tasks, and a task page such as `/acme/general/tasks/NEX-1`.
2. **Try Phase 6 in two browsers** (Aarav in one, Rohan in a private window): move a card, comment with the @ button, react, watch "is typing…", "also viewing" and the online avatars. Its 10 API tests pass.
3. **Commit and push** when the user says "commit" (full test run and secret scan first), then confirm CI.
4. **Phase 7.4 attachments** (Cloudinary; notifications 7.1–7.3 are done). Try the Inbox: assign Rohan a task as Aarav, then sign in as Rohan.

## Deferred from Phase 5 (listed in the PRD §27 Phase 5 tracker)

- ⌘K command palette (Phase 8), live updates through sockets (Phase 6; `emitEvent` is ready), a trash page for deleted tasks (API exists), drag-and-drop column order, group-by on the board (Post-MVP), measured performance runs (500-task board, 5,000-row list), Playwright E2E.

## Deferred from Phase 4 (listed in the PRD §27 Phase 4 tracker)

- Project cover upload, project health (Phase 8), trash purge job (Phase 7), team activity/analytics tabs (Phase 8), real-time `project:created` (Phase 6), Playwright E2E.

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
