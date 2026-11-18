# NexusFlow — API

_Base path `/api/v1`. Generated OpenAPI spec (Phases 1–3, 55 operations): [`apps/api/openapi.json`](apps/api/openapi.json), served at `/api/v1/docs/openapi.json` outside production. Router: [`apps/api/src/routes.ts`](apps/api/src/routes.ts)._

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

## Known API issues

1. Old organization slugs are stored in `slugHistory` but no redirect from old slugs exists yet.
2. Invitation expiry is applied when an invitation is opened; no background job marks them EXPIRED (Phase 7 jobs).
