# NexusFlow — API

_Base path `/api/v1`. Generated OpenAPI spec (Phases 1–4, 92 operations): [`apps/api/openapi.json`](apps/api/openapi.json), served at `/api/v1/docs/openapi.json` outside production. Router: [`apps/api/src/routes.ts`](apps/api/src/routes.ts)._

## Conventions

- Success: `{ "success": true, "data": …, "meta"?: … }`. Error: `{ "success": false, "error": { "code", "message", "details"?, "requestId" } }`. Validation errors: 400 `VALIDATION_ERROR`, `details: [{ path: "body.email", message }]`.
- Auth: session cookie `nf_session` (set by register/login/Google). "Auth" = `requireAuth`; "Verified" = `requireVerified`; "Recent" = `requireRecentAuth` (call `POST /auth/reauthenticate` first, valid 5 min).
- **Every non-GET request must send `X-Requested-With: NexusFlow`** (else 403 `CSRF_HEADER_MISSING`); a foreign `Origin` → 403 `CSRF_ORIGIN_MISMATCH`.
- Rate limits: 300 req/min per IP on `/api/v1` (health exempt) → 429 `RATE_LIMITED`; auth limiter 10/min on login/register/reset/verify/Google/reauth/change-password/invitation preview.
- Org routes `/orgs/:orgSlug/...`: non-members (and unverified users) get **404**; members without the role get 403 `FORBIDDEN`. Plan limits → 402 `PLAN_LIMIT_REACHED` with `details {limit, current, max, planTier}`.

## Health (Phase 1, committed, tested)

| Method | Path                 | Auth | Notes                                          |
| ------ | -------------------- | ---- | ---------------------------------------------- |
| GET    | `/health`            | —    | `{status:"ok", app, uptimeSeconds, timestamp}` |
| GET    | `/health/ready`      | —    | Runs `SELECT 1`; 503 `DATABASE_UNAVAILABLE`    |
| GET    | `/docs/openapi.json` | —    | Non-production only                            |

## Auth (Phase 2, committed, tested) — `apps/api/src/modules/auth/auth.routes.ts`

| Method | Path                        | Auth | Body                             | Result                                                                          |
| ------ | --------------------------- | ---- | -------------------------------- | ------------------------------------------------------------------------------- |
| POST   | `/auth/register`            | —    | `{name, email, password}`        | 201 `{user}` + cookie; taken email → 200 `{user:null, message}` (owner emailed) |
| POST   | `/auth/login`               | —    | `{email, password}`              | `{user}` + cookie; 401 `INVALID_CREDENTIALS`; 429 `TOO_MANY_ATTEMPTS`           |
| POST   | `/auth/logout`              | Auth | —                                | `{loggedOut:true}`                                                              |
| POST   | `/auth/logout-all`          | Auth | —                                | ends all sessions                                                               |
| POST   | `/auth/verify-email`        | —    | `{token}`                        | `{user}`; 400 `TOKEN_INVALID` / `TOKEN_EXPIRED`                                 |
| POST   | `/auth/resend-verification` | Auth | —                                | 409 `ALREADY_VERIFIED`; 429 (1/min, 5/day)                                      |
| POST   | `/auth/forgot-password`     | —    | `{email}`                        | always 200 `{message}`                                                          |
| POST   | `/auth/reset-password`      | —    | `{token, password}`              | revokes all sessions                                                            |
| POST   | `/auth/reauthenticate`      | Auth | `{password}`                     | sets `session.reauthAt`                                                         |
| POST   | `/auth/change-password`     | Auth | `{currentPassword, newPassword}` | revokes other sessions; 409 `NO_PASSWORD`                                       |
| GET    | `/auth/sessions`            | Auth | —                                | `[{id, userAgent, ip, createdAt, lastSeenAt, current}]`                         |
| DELETE | `/auth/sessions/:sessionId` | Auth | —                                | 404 for others' sessions                                                        |
| GET    | `/auth/providers`           | —    | —                                | `{google, photoUpload}` booleans                                                |
| GET    | `/auth/google`              | —    | `?returnTo=`                     | 302 to Google; 404 if not configured                                            |
| GET    | `/auth/google/callback`     | —    | —                                | 302 into app or `/login?error=…`                                                |

## Users (Phase 2 + 3) — `apps/api/src/modules/users/users.routes.ts`

| Method | Path                       | Auth     | Notes                                                                                                              | Phase           |
| ------ | -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ | --------------- |
| GET    | `/users/me`                | Auth     | `CurrentUser {id, name, email, avatarUrl, timezone, emailVerified, hasPassword, lastActiveWorkspaceId, createdAt}` | 2 (+field in 3) |
| PATCH  | `/users/me`                | Auth     | `{name?, timezone?}`                                                                                               | 2               |
| DELETE | `/users/me`                | Recent   | 409 `SOLE_OWNER` with `details:[{name,slug}]`                                                                      | 2               |
| POST   | `/users/me/avatar/sign`    | Auth     | `{mimeType, sizeBytes}` → `{url, fields}`; 503 `STORAGE_NOT_CONFIGURED`                                            | 2               |
| POST   | `/users/me/avatar/confirm` | Auth     | `{publicId}`; 400 `UPLOAD_INVALID`                                                                                 | 2               |
| DELETE | `/users/me/avatar`         | Auth     |                                                                                                                    | 2               |
| GET    | `/users/me/organizations`  | Verified | `[{id,name,slug,logoUrl,role,planTier,workspaces:[WorkspaceSummary]}]`                                             | 3               |
| PUT    | `/users/me/last-workspace` | Verified | `{workspaceId}`; 404 if not accessible                                                                             | 3               |

## Organizations (Phase 3, 18/18 tests pass) — `apps/api/src/modules/organizations/organizations.routes.ts`

Response types are shared with the web app in `packages/shared/src/organizations.ts` (`OrganizationContext`, `OrgMember`, `InvitationSummary`, …).

`WorkspaceSummary = {id, name, slug, description, isDefault, archived, role}`.

| Method       | Path                                             | Permission               | Body / query                                                          | Result / errors                                                               |
| ------------ | ------------------------------------------------ | ------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| POST         | `/orgs`                                          | Verified                 | `{name, slug}`                                                        | 201 `{slug, name, workspaceSlug}`; 409 `SLUG_TAKEN`; 402 (5 owned orgs)       |
| GET          | `/orgs/:org/context`                             | member                   | —                                                                     | `{organization, role, permissions[], plan{tier,limits}, usage, workspaces[]}` |
| PATCH        | `/orgs/:org`                                     | org:update               | `{name?, slug?}`                                                      | slug change keeps old slug in `slugHistory`                                   |
| DELETE       | `/orgs/:org`                                     | org:delete + Recent      | `{confirmSlug}`                                                       | soft delete, slug freed                                                       |
| POST         | `/orgs/:org/transfer-ownership`                  | org:transfer + Recent    | `{userId}` (must be ADMIN)                                            |                                                                               |
| POST         | `/orgs/:org/leave`                               | member                   | —                                                                     | 409 `OWNER_CANNOT_LEAVE`                                                      |
| GET          | `/orgs/:org/usage`                               | usage:read               | —                                                                     | `{workspaces, members, guests, pendingMembers, pendingGuests, storageBytes}`  |
| GET          | `/orgs/:org/audit-logs`                          | audit:read               | `?action&cursor&limit`                                                | SECURITY+BILLING rows, `meta.nextCursor`                                      |
| GET          | `/orgs/:org/members`                             | members:read             | `?q&role&page&pageSize`                                               | `meta.total`                                                                  |
| PATCH        | `/orgs/:org/members/:userId`                     | members:manage           | `{role}`                                                              | rules: `canChangeRole` (PRD A-8)                                              |
| DELETE       | `/orgs/:org/members/:userId`                     | members:manage           | —                                                                     | removes workspace/team/project memberships + assignments                      |
| GET          | `/orgs/:org/invitations`                         | members:invite           | —                                                                     | pending list with `expired` flag                                              |
| POST         | `/orgs/:org/invitations`                         | members:invite           | `{invites:[{email, role: ADMIN\|MEMBER\|GUEST, workspaceId?}]}` (≤20) | 201 `{invited[], skipped[]}`; pending invites count toward plan               |
| POST         | `/orgs/:org/invitations/:id/resend`              | members:invite           | —                                                                     | new token, +7 days                                                            |
| DELETE       | `/orgs/:org/invitations/:id`                     | members:invite           | —                                                                     | REVOKED                                                                       |
| GET          | `/orgs/:org/workspaces`                          | member                   | —                                                                     | accessible workspaces                                                         |
| POST         | `/orgs/:org/workspaces`                          | workspace:create         | `{name, slug, description?}`                                          | 402 on FREE (1 workspace)                                                     |
| GET/PATCH    | `/orgs/:org/workspaces/:ws`                      | member / workspace admin | `{name?, slug?, description?}`                                        |                                                                               |
| POST         | `/orgs/:org/workspaces/:ws/archive` · `/restore` | workspace:create         | —                                                                     | 409 `LAST_WORKSPACE`                                                          |
| DELETE       | `/orgs/:org/workspaces/:ws`                      | workspace:create         | `{deleteContents?}` (body optional)                                   | 409 `LAST_WORKSPACE` / `WORKSPACE_NOT_EMPTY`                                  |
| GET/POST     | `/orgs/:org/workspaces/:ws/members`              | member / workspace admin | `{userId, role?}`                                                     | guests refused                                                                |
| PATCH/DELETE | `/orgs/:org/workspaces/:ws/members/:userId`      | workspace admin          | `{role}`                                                              |                                                                               |
| GET          | `/orgs/:org/workspaces/:ws/activity`             | member                   | `?cursor&limit`                                                       | DOMAIN rows                                                                   |

## Invitations (public side, Phase 3) — `invitations.routes.ts`

| Method | Path                          | Auth     | Result                                                                                        |
| ------ | ----------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| GET    | `/invitations/:token`         | —        | `{organization{name,logoUrl}, invitedBy, role, email}`; 404 invalid; 410 `INVITATION_EXPIRED` |
| POST   | `/invitations/:token/accept`  | Verified | `{orgSlug, workspaceSlug}`; 403 `INVITATION_EMAIL_MISMATCH`; 402 if plan full                 |
| POST   | `/invitations/:token/decline` | Auth     | `{declined:true}`                                                                             |

## Teams, projects, columns, milestones, labels (Phase 4) — `apps/api/src/modules/{teams,projects}/`

Project access follows PRD §12.4 (`packages/shared/src/projects.ts#projectAccess`): owners/admins and workspace admins manage every project; team leads manage team projects but cannot delete them or change columns/milestones; team members contribute; workspace members view WORKSPACE projects; guests only see projects they were added to (at most contributor). No access → 404. Every project answer includes `access {role, canManage, canAdminister, canContribute}`.

| Method                      | Path (under `/orgs/:org`)                        | Who                         | Notes                                                                       |
| --------------------------- | ------------------------------------------------ | --------------------------- | --------------------------------------------------------------------------- |
| GET / POST                  | `/workspaces/:ws/teams`                          | member / workspace admin    | `meta.canCreate`; POST `{name, slug, description?, leadId}`                 |
| GET / PATCH / DELETE        | `/teams/:teamId`                                 | member / lead / ws admin    | DELETE `{projectsAction: move\|archive}` (optional, default move)           |
| GET / POST / PATCH / DELETE | `/teams/:teamId/members[/:userId]`               | lead or ws admin            | 409 `LAST_LEAD`                                                             |
| GET / POST                  | `/workspaces/:ws/projects`                       | member (not guests)         | `?status&teamId&q&includeArchived`; 402 (3 active on FREE); 409 `KEY_TAKEN` |
| GET                         | `/workspaces/:ws/projects/by-key/:key`           | project access              |                                                                             |
| GET / PATCH / DELETE        | `/projects/:projectId`                           | access / manager / admin    | 409 `KEY_LOCKED`, `PROJECT_ARCHIVED`; DELETE → trash                        |
| POST                        | `/projects/:projectId/archive` · `/restore`      | manager                     | restore → previous status; 402 if over the limit                            |
| GET                         | `/projects/:projectId/activity`                  | access                      | `?cursor&limit`, `meta.nextCursor`                                          |
| GET / POST / PATCH / DELETE | `/projects/:projectId/members[/:userId]`         | manager                     | 409 `OWNER_IS_MANAGER`, `LAST_MANAGER`; guests allowed                      |
| GET / POST / PATCH / DELETE | `/projects/:projectId/statuses[/:statusId]`      | admin (not team lead)       | ≤ 50; DELETE `{targetStatusId}` moves tasks; 409 `STATUS_NAME_TAKEN`        |
| PUT                         | `/projects/:projectId/statuses/reorder`          | admin                       | `{statusIds[]}` — every column exactly once                                 |
| GET / POST / PATCH / DELETE | `/projects/:projectId/milestones[/:milestoneId]` | admin                       | answers the full list; `overdue` = open and past due                        |
| GET / POST                  | `/workspaces/:ws/labels`                         | member / ws admin or any PM | `meta.canManage`; 409 `LABEL_NAME_TAKEN`                                    |
| PATCH / DELETE              | `/labels/:labelId`                               | ws admin or PM in workspace |                                                                             |
| GET                         | `/trash` · POST `/projects/:projectId/undelete`  | org owner/admin             | 30 days; 402 on restore if over the limit                                   |

## Tasks (Phase 5) — `apps/api/src/modules/tasks/`

A task is visible exactly when its project is: every route loads the task's project first, so people without access get 404. Viewers read; contributors and managers write; contributors delete only tasks they created. Archived projects are read-only (409 `PROJECT_ARCHIVED`). Task answers carry a `version`: send it back with every change; a stale one gets 409 `VERSION_CONFLICT` and `error.details.current` holds the latest task. Dates are plain `YYYY-MM-DD`. Order inside a column is the text key `position` (sort as plain text).

| Method               | Path (under `/orgs/:org`)                     | Who                  | Notes                                                                                                                                                                                             |
| -------------------- | --------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET / POST           | `/projects/:projectId/tasks`                  | access / contributor | GET filters: `statusId category priority assigneeId=me\|unassigned labelId milestoneId parentTaskId=null dueFrom dueTo hasDueDate overdue q sort=-priority cursor limit(≤200)`; POST `{title, …}` |
| GET                  | `/projects/:projectId/board`                  | access               | every column: first 200 cards, `total`, `nextCursor` (continue with the task list: `statusId`, `parentTaskId=null`, `sort=position`, `cursor`)                                                    |
| GET                  | `/projects/:projectId/assignable`             | access               | contributors and managers (viewers cannot be assigned)                                                                                                                                            |
| POST                 | `/projects/:projectId/tasks/bulk`             | contributor          | `{taskIds ≤ 100, set{…}}` or `{taskIds, action:"delete"}`; one transaction, one history row per task                                                                                              |
| GET                  | `/projects/:projectId/tasks/trash`            | access               | deleted in the last 30 days                                                                                                                                                                       |
| GET                  | `/workspaces/:ws/tasks/by-key/:taskKey`       | access               | `NEX-42`, any letter case                                                                                                                                                                         |
| GET                  | `/workspaces/:ws/my-tasks`                    | member               | open tasks assigned to you, grouped Overdue / Today / This week / Later / No date in your time zone                                                                                               |
| GET / PATCH / DELETE | `/tasks/:taskId`                              | access / contributor | PATCH `{version, …}` (title, description, statusId, priority, assigneeIds, labelIds, milestoneId, dates, hours, parentTaskId); 400 `MAX_DEPTH`, `STATUS_NOT_IN_PROJECT`; DELETE → trash           |
| POST                 | `/tasks/:taskId/move`                         | contributor          | `{statusId, afterTaskId?, beforeTaskId?, version}`; `meta.renumbered` when the column's keys were rewritten                                                                                       |
| POST                 | `/tasks/:taskId/restore` · `/duplicate`       | contributor          | restore within 30 days (409 `PARENT_DELETED`); duplicate copies subtasks and labels, title gets "(copy)"                                                                                          |
| GET                  | `/tasks/:taskId/activity`                     | access               | `?cursor&limit`; one entry per request with a `changes[]` list of `{field, from, to}`                                                                                                             |
| POST / DELETE        | `/tasks/:taskId/dependencies[/:dependencyId]` | contributor          | `{otherTaskId, direction: BLOCKED_BY\|BLOCKS}`; 409 `DEPENDENCY_CYCLE`, `DEPENDENCY_EXISTS`                                                                                                       |

## Comments and reactions (Phase 6) — `apps/api/src/modules/comments/`

Comments belong to a task and are visible exactly when the task is (404 otherwise). Contributors and managers write; viewers read and react. The body is editor JSON (≤ 20 kB, same allow-list as descriptions); mentions `{type:"mention", attrs:{id,label}}` of people who cannot open the project are turned into plain "@name" text. Each new comment asks for notifications (MENTIONED for people mentioned, TASK_COMMENTED for assignees, the reporter and earlier commenters; never the author) through `apps/api/src/lib/notifications.ts`; Phase 7 delivers them.

| Method         | Path (under `/orgs/:org`)        | Who                        | Notes                                                                                                  |
| -------------- | -------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| GET / POST     | `/tasks/:taskId/comments`        | access / contributor       | oldest first with `replies[]`; POST `{body, parentCommentId?}`; 400 `MAX_DEPTH` for a reply to a reply |
| GET            | `/tasks/:taskId/mentionable`     | access                     | everyone who can open the project                                                                      |
| PATCH / DELETE | `/comments/:commentId`           | author / author or manager | PATCH `{body}` sets `editedAt`; DELETE leaves a "deleted" placeholder while replies exist              |
| POST           | `/comments/:commentId/reactions` | access                     | `{emoji}` toggles; answers the comment's `[{emoji, count, userIds}]`                                   |

## Notifications (Phase 7) — `apps/api/src/modules/notifications/`

Your own notifications, across your organizations (only organizations you still belong to). New ones also arrive live as `notification:new` in your `user:<id>` socket room. Preferences default to: everything in the app; email for assignment, mention, invitation, due soon and overdue.

| Method    | Path                                                                  | Notes                                                 |
| --------- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| GET       | `/notifications`                                                      | `?unread=true&mentions=true&orgId&cursor&limit(≤100)` |
| GET       | `/notifications/unread-count`                                         | `{total, byOrg: {orgId: count}}`                      |
| POST      | `/notifications/:id/read` · `/:id/unread` · `/notifications/read-all` | read-all `{orgId?}` → `{updated}`; others' ids → 404  |
| GET / PUT | `/users/me/notification-preferences`                                  | PUT `{preferences: [{type, inApp, email}]}`           |

Background jobs (`apps/api/src/lib/jobs.ts`, handlers in `apps/api/src/jobs/`): `email.notification`, hourly `reminders.due-soon`, `reminders.overdue`, `reminders.milestones`, `invitations.expire`, daily `notifications.retention` (90 days) and `trash.purge` (30 days).

## Live updates (Phase 6) — Socket.io at `/socket.io`, `apps/api/src/realtime/gateway.ts`

The browser connects with its normal `nf_session` cookie (same address as the API; Vite forwards `/socket.io` in development). No valid session or an unverified email → `connect_error` "UNAUTHENTICATED"; more than 10 connections per person → "TOO_MANY_CONNECTIONS". After connecting the server sends `session:ready {userId}` and puts the socket in the `user:<id>` room.

| Client → server                | Payload                                     | Notes                                                                                                   |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `room:join` / `room:leave`     | `{type: org\|workspace\|project\|task, id}` | join answers `{ok:true}` or `{ok:false, code:"FORBIDDEN"}`, with the same access checks as the HTTP API |
| `presence:ping`                | `{workspaceId}`                             | every 30 s while a workspace is open (joining the workspace room also counts)                           |
| `typing:start` / `typing:stop` | `{taskId}`                                  | relayed to the task room, at most once a second                                                         |

| Server → client                                                                                                                                        | Room                  | Payload                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `task:created`, `task:updated`, `task:moved`, `task:deleted`, `task:restored`, `task:dependency_added`, `task:dependency_removed`, `task:bulk-updated` | project (+ task)      | `{orgId, workspaceId, projectId, actorId, occurredAt, data}`; `data.taskId`, `data.fields` (changed fields) |
| `comment:created`, `comment:updated`, `comment:deleted`, `reaction:updated`                                                                            | project + task        | `data.taskId`, `data.comment` or `data.commentId`, `data.reactions`                                         |
| `task:viewers`                                                                                                                                         | task                  | `{taskId, userIds}`                                                                                         |
| `typing`                                                                                                                                               | task (not the sender) | `{taskId, userId, name, typing}`                                                                            |
| `presence:update`                                                                                                                                      | workspace             | `{workspaceId, online: userIds}`; offline 60 s after the last ping or when the last tab closes              |
| `access:revoked`                                                                                                                                       | the socket            | `{type, id}`: after a membership, role, team or visibility change the socket left that room                 |
| `session:ended`                                                                                                                                        | the socket            | the login session was ended; the socket is disconnected                                                     |

## Known API issues

1. Old organization slugs are stored in `slugHistory` but no redirect from old slugs exists yet.
2. Invitation expiry is applied when an invitation is opened; no background job marks them EXPIRED (Phase 7 jobs).
3. Trashed projects are not purged after 30 days yet (they just stop being restorable); the purge job comes with pg-boss in Phase 7.
4. Project cover upload (`/projects/:id/cover/sign|confirm`) is not built yet.
