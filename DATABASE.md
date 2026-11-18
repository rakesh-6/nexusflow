# NexusFlow — Database

_PostgreSQL 16 on Neon (free tier, US East). Schema: [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma). Design source: PRD §17._

## Connections

| Variable (in `.env`, never committed) | Points to                                  | Used by                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                        | Neon `dev` branch, pooled (`-pooler` host) | the app (`apps/api/src/lib/prisma.ts`, `@prisma/adapter-pg`, 15 s connect timeout, transaction maxWait/timeout 15 s)                                                              |
| `DIRECT_DATABASE_URL`                 | same `dev` branch, direct                  | Prisma CLI migrations (`apps/api/prisma.config.ts`)                                                                                                                               |
| `TEST_DATABASE_URL`                   | Neon `test` branch, direct                 | tests (`apps/api/vitest.config.ts` refuses to run if it points at the dev database; `tests/globalSetup.ts` applies migrations and rebuilds the DB after an interrupted migration) |

CI uses a throwaway `postgres:16` service instead (`.github/workflows/ci.yml`).

## Migrations completed (all applied to the current dev branch)

| Migration                                        | Contents                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261113100220_p1_identity_and_tenants`         | Extensions `citext`, `pg_trgm`; enums; User, OAuthAccount, Session, VerificationToken, NotificationPreference, Organization, OrganizationMember, Workspace, WorkspaceMember, Team, TeamMember, Invitation; partial unique indexes (one OWNER per org, one default workspace per org, one PENDING invitation per email per org)                                  |
| `20261113101449_p1_projects_and_tasks`           | Project, ProjectMember, TaskStatus, Label, Milestone, Task, TaskAssignee, TaskLabel, TaskDependency, TaskTemplate; one default status per project                                                                                                                                                                                                               |
| `20261113124111_p1_collaboration_billing_search` | Comment, CommentReaction, Attachment, Notification, ActivityLog, Subscription, BillingProfile, Payment, Invoice, WebhookEvent, SalesLead, Automation, AutomationExecution, AiUsage; **hand-edited**: generated `searchVector` tsvector columns (Project, Task, Team, Comment) + GIN indexes, trigram indexes on Task.title / Project.name, 15 CHECK constraints |

No schema changes were needed for Phase 2 or Phase 3.

## Models (36) and relationships

All ids are UUID v7 (`@default(uuid(7))`), timestamps `timestamptz(3)`. Tenant tables carry `organizationId` (cascade delete from Organization).

**Identity**: `User` (email citext unique, passwordHash nullable for Google-only users, `lastActiveWorkspaceId`, soft delete `deletedAt` + PII scrub) → `OAuthAccount`, `Session` (tokenHash unique, `reauthAt`, `revokedAt`), `VerificationToken` (EMAIL_VERIFY | PASSWORD_RESET, hashed, single use), `NotificationPreference`.

**Tenant core**: `Organization` (slug unique, `slugHistory[]`, `ownerId` → User RESTRICT, `settings` JSON, `storageUsedBytes`, soft delete + `purgeAfter`) → `OrganizationMember` (role OWNER|ADMIN|MEMBER|GUEST, status), `Workspace` (slug unique per org, `isDefault`, `archivedAt`, `deletedAt`) → `WorkspaceMember` (WORKSPACE_ADMIN|WORKSPACE_MEMBER), `Team` → `TeamMember` (LEAD|MEMBER), `Invitation` (email citext, role ≠ OWNER CHECK, tokenHash unique, status PENDING|ACCEPTED|DECLINED|REVOKED|EXPIRED, 7-day expiry, optional workspaceId SET NULL), `Subscription` (one per org, planTier FREE default).

**Projects & tasks** (used from Phase 4): `Project` (key unique per workspace, `taskSequence`, status/priority/visibility, soft delete) → `ProjectMember` (PROJECT_MANAGER|CONTRIBUTOR|VIEWER), `TaskStatus` (category BACKLOG…DONE), `Milestone`, `Task` (number unique per project, `position` fractional key, `version`, `parentTaskId` subtasks, `completedAt`), `TaskAssignee`, `TaskLabel` (composite PK), `TaskDependency` (no self-block CHECK), `Label` (per workspace), `TaskTemplate`.

**Collaboration & other** (later phases): `Comment` (exactly one of taskId/projectId CHECK, replies via parentCommentId), `CommentReaction`, `Attachment` (Cloudinary publicId, purpose CHECK), `Notification`, `ActivityLog` (append-only; category DOMAIN|SECURITY|BILLING; `organizationId` nullable for pre-org auth events), billing (`BillingProfile`, `Payment`, `Invoice`, `WebhookEvent`, `SalesLead`), `Automation`, `AutomationExecution`, `AiUsage`.

Delete behavior: Organization delete cascades all tenant rows; `Task.statusId` is NO ACTION (status with tasks cannot be deleted alone; project delete removes both); user/reporter/author FKs RESTRICT (users are soft-deleted, never hard-deleted in normal use).

## Seed data (`pnpm db:seed`, dev only)

`apps/api/prisma/seed.ts` (idempotent, refuses `NODE_ENV=production`): **Acme Studio** (`acme`, PRO test subscription, 8 people named after PRD personas, 2 workspaces, 3 teams, 5 projects, 200 tasks, comments, labels, milestones, a pending invitation) and **Globex** (`globex`, FREE, 2 people, 40 tasks) for isolation tests. All sample users: password `Acme-demo-2026` (e.g. `aarav@acme.example`, the Acme owner).

## Commands

```bash
pnpm db:migrate                               # create + apply a migration in dev (asks for a name; regenerates client)
pnpm --filter @nexusflow/api db:deploy        # apply existing migrations (new/empty database)
pnpm db:seed                                  # sample data
pnpm db:studio                                # browse data
pnpm db:generate                              # regenerate the Prisma client
```

When creating a migration that touches tables with hand-written SQL: use `--create-only`, review the SQL, apply, then confirm `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` prints an empty migration.

## Pending database changes

None required for Phase 3 or 4. Possible later: Postgres RLS (PRD §20, Phase 12), ActivityLog partitioning, `AiReport` table (Phase 11).
