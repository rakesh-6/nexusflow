

# NexusFlow — Product Requirements Document (PRD)

| Field | Value |
|---|---|
| Product | NexusFlow — Multi-tenant SaaS Project Management and Team Collaboration Platform |
| Document version | 1.1 |
| Date | 2026-11-12 |
| Status | Approved for implementation; all decisions resolved for a zero-cost portfolio build (Appendix A) |
| Audience | Product, engineering (human or AI coding agents), QA, DevOps |
| Source of truth | This file. Any change in scope or design must be reflected here first. |

## Document Conventions

- **MVP** = the first shippable release = Development Phases 1–8 (see §27). Anything tagged **Post-MVP** is fully specified here but built after the MVP ships.
- **MUST / SHOULD / MAY** follow RFC 2119 meaning. A MUST that is Post-MVP is mandatory for *that* phase, not for the MVP.
- Identifier prefixes: `US-` user story, `FR-` functional requirement, `NFR-` non-functional requirement, `AC-` acceptance criterion, `R-` risk, `D-` open decision, `A-` assumption.
- Naming conventions used throughout: database models in `PascalCase` (`TaskStatus`), enum values in `UPPER_SNAKE_CASE` (`IN_PROGRESS`), API paths plural kebab-case (`/task-statuses`), JSON fields `camelCase`.
- "Organization" (org) is the tenant and billing account. "Workspace" is a container inside an organization. The UI shows the user their current *workspace* and offers switching across all workspaces of all organizations they belong to.
- Priorities: **P0** required for the MVP exit criteria, **P1** required for the MVP but can slip within the MVP window if P0 is at risk, **P2** Post-MVP.
- Dates are written ISO-8601. All server timestamps are stored in UTC.

## Table of Contents

1. Executive Summary · 2. Product Vision · 3. Problem Statement · 4. Product Goals · 5. Non-Goals · 6. Target Audience · 7. User Personas · 8. User Stories · 9. Functional Requirements · 10. Non-Functional Requirements · 11. Feature Specifications · 12. User Roles and Permissions Matrix · 13. Application Workflows · 14. UI/UX Requirements · 15. System Architecture · 16. Technology Stack · 17. Database Schema and ERD Description · 18. API Requirements · 19. Authentication and Authorization · 20. Multi-Tenant Architecture · 21. Security Requirements · 22. Third-Party Integrations · 23. Subscription and Billing · 24. AI Features · 25. Testing Strategy · 26. Deployment Strategy · 27. Development Roadmap · 28. Acceptance Criteria · 29. Risks and Mitigation · 30. Future Enhancements · Appendix A. Assumptions and Unresolved Decisions · Appendix B. Glossary · Appendix C. Requirement Traceability · Appendix D. Environment Variables

---

## 1. Executive Summary

NexusFlow is a multi-tenant, subscription-based SaaS platform for managing projects, tasks and team collaboration in one workspace. It targets individuals, startups, project managers, software, design and marketing teams, and enterprises, and competes functionally with Linear, ClickUp, Jira, Trello and Asana while keeping a calmer, keyboard-first, faster experience.

Each customer is an **Organization** (the tenant and billing account) containing one or more **Workspaces**, each holding **Teams** and **Projects**, which hold **Tasks**. Access is governed by organization roles (Owner, Admin, Member, Guest), workspace roles and project roles (Project Manager, Contributor, Viewer), all enforced on the server. Real-time collaboration (task updates, comments, presence, notifications) runs over Socket.io with authenticated, tenant-scoped rooms.

The platform is delivered as a pnpm monorepo: a React 19 + TypeScript + Vite + Tailwind + shadcn/ui frontend and a Node.js + Express + TypeScript + Prisma + Socket.io backend, deployed together as one Render free web service with a free Neon PostgreSQL database. NexusFlow is built as a portfolio project with a zero-cost constraint: every service runs on a free tier (§26.1), and a "Try the demo" login lets reviewers explore it without signing up (§26.8). Attachments are stored in Cloudinary through server-signed direct uploads; billing uses Razorpay Subscriptions in test mode, so the full checkout and webhook flow is demonstrable without real money; AI features default to the free Gemini API and are strictly optional.

**MVP (Phases 1–8)** delivers authentication (email/password + Google), organizations, workspaces, invitations, teams, projects, a complete task system with Kanban, List and Calendar views, comments with mentions and reactions, real-time updates, in-app and email notifications, file attachments, an analytics dashboard, global search, FREE-plan limit enforcement and an organization admin panel. **Post-MVP (Phases 9–12 and 5b)** adds Razorpay billing, the automation engine, AI features, the Gantt/timeline view, task templates and recurring tasks, then hardening and release engineering.

Indicative effort for a two-developer team is about 22 weeks for all 12 phases, of which roughly 14 weeks are MVP (Appendix A, A-20). All earlier open decisions (pricing, trial, tax, AI provider, email, hosting, domain) are resolved in Appendix A for the zero-cost profile.

---

## 2. Product Vision

### 2.1 Vision statement

> One calm, fast workspace where any team, from a solo freelancer to a 1,000-person enterprise, can plan work, do it together in real time, and see how it is going, without stitching five tools together.

### 2.2 What NexusFlow takes from the market and what it does differently

| Reference product | What NexusFlow adopts | What NexusFlow deliberately changes |
|---|---|---|
| Linear | Speed, keyboard-first navigation (⌘K command palette), project keys and task numbers (`NEX-42`), opinionated defaults | Adds Guests, per-project roles, multiple views (Calendar, Gantt) and an automation builder that Linear keeps minimal |
| ClickUp | Hierarchy (Workspace → Teams → Projects), multiple views on the same data, custom statuses | Far fewer configuration knobs; one default status set per project with a fixed category mapping so analytics and automations always work |
| Jira | Project roles, issue dependencies, audit trail, admin panel | No scheme/workflow-configuration maze; statuses are per project and editable inline |
| Trello | Approachable Kanban, drag-and-drop simplicity, cards with checklists (subtasks) | Kanban is one of several views over a real relational task model, not the model itself |
| Asana | My Tasks, Inbox, project membership and guests, clean light UI | Adds team workload and productivity analytics in the base product |

### 2.3 Product principles

1. **Server is the gatekeeper.** Every permission, plan limit and tenant boundary is enforced in the API. The UI only mirrors it.
2. **One data model, many views.** Kanban, List, Calendar, Timeline and Dashboard are projections of the same tasks; a change in one is live in all.
3. **Fast by default.** Optimistic UI, cursor pagination, indexed queries, and real-time patches instead of polling.
4. **Progressive depth.** A solo user can create a task within two minutes of signing up; an enterprise admin can audit everything. Advanced features (automations, AI, Gantt) never get in the way of the basics.
5. **Optional intelligence.** AI assists with drafting and summarizing, never silently changes data, and can be switched off per organization without affecting anything else.
6. **Tenant isolation is not negotiable.** No request, socket, file URL or search result ever crosses an organization boundary.

### 2.4 Product identity

- Name: **NexusFlow**. Tagline (working): "Where work flows together."
- Visual language: light, airy default theme; indigo primary; neutral greys; semantic colors reserved for priority and status; rounded 10px cards with subtle layered shadows; Inter typography. Optional dark theme.
- Signature surfaces: **Home** (My Focus: tasks due this week, assigned to me, mentions), **Inbox** (notifications), **⌘K command palette** (navigate, create, search), **Board / List / Calendar / Timeline** tabs on every project, **Insights** dashboard.

---

## 3. Problem Statement

Teams typically run work across a task tracker, a chat tool, a spreadsheet for reporting and a calendar for deadlines. The resulting problems:

1. **Fragmented context.** Task state, discussion, files and decisions live in different tools; onboarding a new member means reconstructing history from chat scrollback.
2. **No live picture.** Managers learn about slippage in weekly status meetings because trackers do not surface overdue work, workload imbalance or project health automatically.
3. **Tools that are either too simple or too heavy.** Lightweight boards (Trello-style) collapse past ~20 people; enterprise trackers (Jira-style) need an administrator to configure before anyone can file a task.
4. **Weak multi-organization support.** Agencies, consultants and freelancers belong to several organizations and must juggle separate logins, while clients need limited guest access without seeing internal work.
5. **Security and isolation gaps in small SaaS tools.** Many products rely on front-end checks or leak existence of resources across tenants; enterprise buyers require server-side RBAC, audit logs and clear data boundaries.
6. **Manual, repetitive coordination.** "Notify the PM when a task is done", "remind before the deadline" and "close the project when all tasks are done" are done by hand or not at all.

NexusFlow addresses these with a single relational model for organizations, workspaces, teams, projects and tasks; real-time collaboration on top of it; analytics computed from actual records; an automation engine for routine coordination; and multi-tenant security designed in from the first migration.

---

## 4. Product Goals

| ID | Goal | Measure (how we will know) |
|---|---|---|
| G-1 | Fast time-to-value | A new user can register, create an organization and a project, and create and assign a task in under 3 minutes (measured in E2E test and onboarding analytics). |
| G-2 | True multi-tenant security | Zero cross-tenant data exposure. Automated cross-tenant tests for every tenant-scoped endpoint, socket room and file URL pass in CI. |
| G-3 | Real-time collaboration that feels instant | Task and comment updates reach other connected members within 500 ms (p95) on a single-region deployment. |
| G-4 | Complete task management in the MVP | All task properties, statuses, priorities, subtasks, dependencies, labels, attachments, comments and activity listed in §9 are available in the MVP; Kanban, List and Calendar views ship in the MVP. |
| G-5 | Accurate analytics | Every dashboard number is computed from database records with the formulas in §11.11; a reconciliation test compares dashboard totals to raw counts. |
| G-6 | Commercial readiness after MVP | Razorpay subscriptions with webhook-verified state, plan limit enforcement for all four tiers, billing history and invoices (Phase 9). |
| G-7 | Maintainability | Modular backend (routes/controllers/services/repositories), shared validation schemas, ≥ 80% unit test coverage on services and permission logic, CI green on every PR. |
| G-8 | Premium UX | Lighthouse Performance ≥ 90 and Accessibility ≥ 95 on the dashboard and board pages; responsive from 360 px to 1920 px wide. |

---

## 5. Non-Goals

The following are explicitly out of scope for versions covered by this PRD (MVP through Phase 12). They may appear in §30 Future Enhancements.

1. Native mobile or desktop applications (the web app is responsive instead).
2. Offline mode or local-first sync.
3. Built-in chat/messaging channels (comments and mentions cover task-centric discussion).
4. Document/wiki editor beyond rich-text task and project descriptions.
5. Time-tracking timers and timesheets (manual `actualHours` only).
6. Custom fields on tasks, custom workflows with transition rules, or per-organization custom roles beyond the "custom permissions" toggles of the BUSINESS plan.
7. Sprints/cycles, story points, burndown charts (milestones and dates cover planning).
8. SSO (SAML/OIDC enterprise federation), SCIM provisioning, MFA. (MFA is the first planned enhancement.)
9. Public REST API keys, outbound webhooks and a marketplace of integrations.
10. Importers from Jira/Trello/Asana and data export beyond CSV of audit logs and tasks.
11. Internationalization: the UI ships in English only; dates and numbers are localized by the browser locale.
12. Audio/video processing for meeting-notes summarization (text input only).
13. A public "platform super-admin" web console (minimal internal endpoints only, see §11.16).
14. Multi-region deployment and data residency controls.

---

## 6. Target Audience

| Segment | Typical size | Primary jobs to be done | Plan fit |
|---|---|---|---|
| Individual users (freelancers, students, solo developers) | 1 | Track personal and client work, deadlines, simple Kanban | FREE |
| Startup founders | 2–15 | Run product, hiring and ops projects in one place; see what the team is doing without meetings | FREE → PRO |
| Project managers (agencies, consultancies) | 5–50, several clients | Multiple projects, client guests, milestones, progress reports, timeline | PRO / BUSINESS |
| Software development teams | 5–100 | Backlog, statuses, dependencies, subtasks, priorities, estimates, activity trail | PRO / BUSINESS |
| Designers | 2–20 | Visual boards, attachments and previews, review workflow (In Review status), comments with mentions | PRO |
| Marketing teams | 3–30 | Calendar view for campaigns, recurring tasks, labels, workload | PRO / BUSINESS |
| Enterprise organizations | 100–5,000 | Many workspaces and teams, admin panel, audit logs, usage, custom permissions, priority support | BUSINESS / ENTERPRISE |

Geography and currency: the initial market is India (Razorpay, INR pricing). The product itself is region-agnostic; see Appendix A (A-3, A-13).

---

## 7. User Personas

Pronouns for all personas are they/them.

### 7.1 Aarav — Freelance full-stack developer (Individual user)
- **Context:** Works alone for 3–4 clients at a time; previously used Trello and a notes app.
- **Goals:** One board per client, due dates on a calendar, quick capture of tasks from the keyboard, zero setup.
- **Pains:** Paying per seat for tools built for teams; losing track of deadlines across clients.
- **Key flows:** Register with Google → auto-created organization and default workspace → create project → add tasks with due dates → Calendar view → mark done. Later invites a client as a Guest on one project.
- **Success:** Uses NexusFlow daily on the FREE plan; upgrades when a client asks to collaborate.

### 7.2 Meera — Startup founder (12-person company)
- **Context:** Runs product, growth and hiring; the team is split between engineering and operations.
- **Goals:** See every project's status on one dashboard; assign and re-prioritize work quickly; avoid status meetings.
- **Pains:** Jira felt heavy; Notion boards did not show overdue or workload.
- **Key flows:** Create organization → invite 12 members by email → create "Engineering" and "Ops" teams → team projects → Dashboard (project health, overdue, workload) → upgrade to PRO when the 5-member FREE limit is hit.

### 7.3 Rohan — Project manager at a digital agency
- **Context:** Manages 6 client projects with 20 internal colleagues and 10 client stakeholders.
- **Goals:** Milestones and timeline per project; clients see only their project; weekly progress reports.
- **Pains:** Clients accidentally seeing internal projects; manual weekly status emails.
- **Key flows:** Workspace per client group → Project Manager role → invite clients as Guests → milestones → Timeline view → AI weekly report (Post-MVP) → automation "notify me when a task is completed".

### 7.4 Sana — Engineering lead (40-person engineering org)
- **Context:** Four squads, shared backlog, dependencies between squads.
- **Goals:** Dependencies and blocked tasks visible; In Review workflow; estimates vs actuals; per-team productivity.
- **Pains:** Hidden blockers; nobody updates the board; tools without an API-grade activity trail.
- **Key flows:** Teams with leads → project statuses customized per squad → dependencies → Blocked status → List view with bulk updates → Team analytics.

### 7.5 Dev — Product designer
- **Context:** Works across two product teams; delivers mock-ups, collects feedback.
- **Goals:** Attach images and PDFs with inline previews; a visual board; comment threads with mentions and reactions.
- **Pains:** Feedback scattered across chat; no preview without downloading.
- **Key flows:** Task with attachments → In Review → mention the PM → reactions → Done.

### 7.6 Kavya — Marketing lead
- **Context:** Campaign calendar, recurring content tasks, external freelancers.
- **Goals:** Monthly calendar of campaign tasks; recurring tasks ("weekly newsletter"); labels per channel; freelancers as Guests.
- **Pains:** Rebuilding the same checklist every week; no single calendar.
- **Key flows:** Calendar view → task templates and recurring tasks (Post-MVP) → labels → Guest access.

### 7.7 Ishaan — Enterprise IT administrator
- **Context:** Responsible for 600 employees across 5 departments; must satisfy security review.
- **Goals:** Central member management, role control, audit logs, usage statistics, billing under one account; multiple workspaces per department.
- **Pains:** Tools where any member can invite anyone; no audit trail; billing scattered across teams.
- **Key flows:** Enterprise plan → multiple workspaces → Admin panel → audit log filters and CSV export → usage statistics → custom permission toggles (BUSINESS+).

---

## 8. User Stories

Format: *As a ⟨role⟩, I want ⟨capability⟩ so that ⟨outcome⟩.* Priority P0/P1 = MVP, P2 = Post-MVP. Each story links to the feature specification section that defines its behavior and acceptance criteria.

### 8.1 Authentication and account (§11.1)

| ID | Story | Priority |
|---|---|---|
| US-AUTH-01 | As a visitor, I want to register with name, email and password so that I can create an account. | P0 |
| US-AUTH-02 | As a new user, I want to receive a verification email and verify my address so that my account is trusted. | P0 |
| US-AUTH-03 | As a user, I want to log in and log out securely so that only I can access my data. | P0 |
| US-AUTH-04 | As a user who forgot their password, I want to request a reset link by email and set a new password. | P0 |
| US-AUTH-05 | As a visitor, I want to sign up or log in with Google so that I do not need another password. | P0 |
| US-AUTH-06 | As a user, I want to edit my profile (name, avatar, timezone) so that colleagues recognize me. | P0 |
| US-AUTH-07 | As a user, I want to see and revoke my active sessions so that I can secure my account. | P1 |
| US-AUTH-08 | As a user, I want to change my password with re-authentication. | P1 |
| US-AUTH-09 | As a user, I want to delete my account and have my personal data removed. | P1 |
| US-AUTH-10 | As a user, I want to enable multi-factor authentication. | P2 (Future) |

### 8.2 Organizations, workspaces and membership (§11.2, §11.3)

| ID | Story | Priority |
|---|---|---|
| US-ORG-01 | As a new user, I want to create an organization during onboarding so that I have a place to work. | P0 |
| US-ORG-02 | As an Owner/Admin, I want to update organization name, slug and logo. | P0 |
| US-ORG-03 | As an Owner, I want to delete the organization after confirmation so that all data is removed. | P1 |
| US-ORG-04 | As an Owner, I want to transfer ownership to another Admin. | P1 |
| US-ORG-05 | As an Owner/Admin, I want to invite people by email with a role so that they can join. | P0 |
| US-ORG-06 | As an invitee, I want to accept or decline an invitation, creating an account if I do not have one. | P0 |
| US-ORG-07 | As an Owner/Admin, I want to view, resend and revoke pending invitations. | P0 |
| US-ORG-08 | As an Owner/Admin, I want to change a member's role or remove them. | P0 |
| US-ORG-09 | As a member of several organizations, I want to switch workspaces from a single switcher. | P0 |
| US-ORG-10 | As an Owner/Admin, I want to create, rename, archive and delete workspaces within plan limits. | P0 |
| US-ORG-11 | As a Workspace Admin, I want to manage workspace members and settings (name, logo, description). | P0 |
| US-ORG-12 | As an Owner/Admin, I want to view workspace activity history so that I know what changed and by whom. | P1 |
| US-ORG-13 | As an Owner/Admin, I want workspace branding (logo, accent color) so that the space feels like ours. | P1 |

### 8.3 Teams (§11.4)

| ID | Story | Priority |
|---|---|---|
| US-TEAM-01 | As a Workspace Admin, I want to create teams with a name, description and lead. | P0 |
| US-TEAM-02 | As a Team Lead, I want to add and remove team members. | P0 |
| US-TEAM-03 | As a Team Lead, I want to create team projects visible to all team members. | P0 |
| US-TEAM-04 | As a Team Lead, I want to see team activity and productivity analytics. | P1 |
| US-TEAM-05 | As a Workspace Admin, I want to delete a team, choosing what happens to its projects. | P1 |

### 8.4 Projects (§11.5)

| ID | Story | Priority |
|---|---|---|
| US-PROJ-01 | As a Member, I want to create a project with name, key, description, dates, priority and status. | P0 |
| US-PROJ-02 | As a Project Manager, I want to edit project details and upload a cover image. | P0 |
| US-PROJ-03 | As a Project Manager, I want to add members with Project Manager / Contributor / Viewer roles. | P0 |
| US-PROJ-04 | As a Project Manager, I want to archive and restore a project. | P0 |
| US-PROJ-05 | As a Project Manager, I want to delete a project with confirmation. | P0 |
| US-PROJ-06 | As a Project Manager, I want to create milestones with due dates and attach tasks to them. | P0 |
| US-PROJ-07 | As a project member, I want to see progress percentage and a health indicator. | P0 |
| US-PROJ-08 | As a project member, I want to see the project activity history. | P0 |
| US-PROJ-09 | As a Project Manager, I want to customize task statuses (columns) for my project. | P0 |
| US-PROJ-10 | As a project member, I want project discussions (threaded, not tied to a task). | P2 |

### 8.5 Tasks (§11.6)

| ID | Story | Priority |
|---|---|---|
| US-TASK-01 | As a Contributor, I want to create a task with title, description, assignees, priority, status, dates, estimate and labels. | P0 |
| US-TASK-02 | As a Contributor, I want each task to have a human-readable ID like `NEX-42`. | P0 |
| US-TASK-03 | As a Contributor, I want to edit any field inline and see the change reflected for others instantly. | P0 |
| US-TASK-04 | As a Contributor, I want to add subtasks and see parent progress. | P0 |
| US-TASK-05 | As a Contributor, I want to mark a task as blocked by another task and see blockers. | P0 |
| US-TASK-06 | As a Contributor, I want to attach files to a task. | P0 |
| US-TASK-07 | As a Contributor, I want to filter, sort and search tasks within a project. | P0 |
| US-TASK-08 | As a Contributor, I want to drag tasks between statuses and reorder them. | P0 |
| US-TASK-09 | As a Contributor, I want to duplicate a task. | P1 |
| US-TASK-10 | As a Contributor, I want to bulk-update status, priority, assignee or labels for selected tasks. | P1 |
| US-TASK-11 | As a Contributor, I want to log actual hours against the estimate. | P1 |
| US-TASK-12 | As a project member, I want to see a task's full activity timeline. | P0 |
| US-TASK-13 | As a Project Manager, I want to create task templates and create tasks from them. | P2 |
| US-TASK-14 | As a Contributor, I want recurring tasks that re-create themselves on a schedule. | P2 |
| US-TASK-15 | As a Project Manager, I want to manage workspace labels (name, color). | P0 |
| US-TASK-16 | As a user, I want a "My Tasks" page across all projects I am assigned to. | P0 |

### 8.6 Project views (§11.7)

| ID | Story | Priority |
|---|---|---|
| US-VIEW-01 | As a project member, I want a Kanban board with columns per status, priority indicators and assignee avatars. | P0 |
| US-VIEW-02 | As a project member, I want a sortable, filterable list/table with inline editing and bulk actions. | P0 |
| US-VIEW-03 | As a project member, I want a monthly and weekly calendar of due dates and milestones. | P0 |
| US-VIEW-04 | As a project member, I want a timeline/Gantt with task bars, milestones and dependency lines. | P2 |
| US-VIEW-05 | As a project member, I want a project overview with statistics, completion, workload and health. | P0 |
| US-VIEW-06 | As a user, I want the view and filters I last used on a project remembered on my device. | P1 |

### 8.7 Comments and real-time collaboration (§11.8, §11.9)

| ID | Story | Priority |
|---|---|---|
| US-COMM-01 | As a project member, I want to comment on a task with rich text and attachments. | P0 |
| US-COMM-02 | As a project member, I want to reply in a thread. | P0 |
| US-COMM-03 | As a project member, I want to mention a colleague with @ so that they are notified. | P0 |
| US-COMM-04 | As a project member, I want to react to a comment with an emoji. | P0 |
| US-COMM-05 | As the author, I want to edit or delete my comment; as a PM, delete any comment. | P0 |
| US-RT-01 | As a project member, I want to see task changes made by others appear on my board without refreshing. | P0 |
| US-RT-02 | As a project member, I want to see who is online and who is viewing the same task. | P1 |
| US-RT-03 | As a user, I want notifications to arrive live in the app. | P0 |

### 8.8 Notifications (§11.10)

| ID | Story | Priority |
|---|---|---|
| US-NOTIF-01 | As a user, I want an Inbox listing notifications with unread counts. | P0 |
| US-NOTIF-02 | As a user, I want to mark notifications read/unread individually or all at once. | P0 |
| US-NOTIF-03 | As an assignee, I want to be notified when a task is assigned to me, or its status/due date changes. | P0 |
| US-NOTIF-04 | As a user, I want deadline reminders before and when a task becomes overdue. | P0 |
| US-NOTIF-05 | As a user, I want email notifications for important events, with per-type preferences. | P0 |
| US-NOTIF-06 | As a user, I want to be notified when I am mentioned, invited, or when someone comments on my task. | P0 |

### 8.9 Files (§11.11)

| ID | Story | Priority |
|---|---|---|
| US-FILE-01 | As a Contributor, I want to upload attachments up to my plan's size limit with progress indication. | P0 |
| US-FILE-02 | As a project member, I want to preview images, PDFs and videos inline and download other files. | P0 |
| US-FILE-03 | As the uploader or a PM, I want to delete an attachment. | P0 |
| US-FILE-04 | As an Owner/Admin, I want to see storage usage against my plan. | P1 |

### 8.10 Dashboard, analytics and search (§11.12, §11.13)

| ID | Story | Priority |
|---|---|---|
| US-DASH-01 | As a user, I want a workspace dashboard with project and task counts, overdue tasks, upcoming deadlines and recent activity. | P0 |
| US-DASH-02 | As a Manager, I want charts for completion trend, status and priority distribution, project progress and team workload with date-range filters. | P0 |
| US-DASH-03 | As a Team Lead, I want team and individual productivity metrics. | P1 |
| US-SRCH-01 | As a user, I want ⌘K global search across projects, tasks, teams, users and comments. | P0 |
| US-SRCH-02 | As a user, I want advanced filters (status, priority, assignee, project, team, due date, labels, created date) with pagination. | P0 |

### 8.11 Subscription and billing (§11.14) — Post-MVP except plan limits

| ID | Story | Priority |
|---|---|---|
| US-BILL-01 | As a visitor, I want a pricing page comparing FREE, PRO, BUSINESS and ENTERPRISE. | P1 |
| US-BILL-02 | As an Owner, I want FREE limits enforced with clear "upgrade" messaging when I hit them. | P0 |
| US-BILL-03 | As an Owner, I want to subscribe to PRO or BUSINESS with Razorpay checkout. | P2 |
| US-BILL-04 | As an Owner, I want to upgrade, downgrade or cancel and understand when changes take effect. | P2 |
| US-BILL-05 | As an Owner, I want billing history, invoices and payment status. | P2 |
| US-BILL-06 | As an Owner, I want to see usage against limits (members, workspaces, projects, storage). | P1 |
| US-BILL-07 | As an Enterprise buyer, I want a contact-sales flow. | P2 |

### 8.12 Automation (§11.15) — Post-MVP

| ID | Story | Priority |
|---|---|---|
| US-AUTO-01 | As a Project Manager, I want to create rules with a trigger, conditions and actions. | P2 |
| US-AUTO-02 | As a Project Manager, I want ready-made recipes (notify PM on completion, deadline reminder, notify assignee, urgent escalation, auto-complete project). | P2 |
| US-AUTO-03 | As a Project Manager, I want to see an execution log and disable a rule. | P2 |

### 8.13 AI (§11.16) — Post-MVP

| ID | Story | Priority |
|---|---|---|
| US-AI-01 | As a Contributor, I want AI to draft a task description from the title. | P2 |
| US-AI-02 | As a Contributor, I want AI to break a task into suggested subtasks that I can accept or edit. | P2 |
| US-AI-03 | As a Project Manager, I want AI project planning suggestions, summaries and weekly reports. | P2 |
| US-AI-04 | As a user, I want AI to summarize pasted meeting notes into action items. | P2 |
| US-AI-05 | As a Manager, I want AI productivity insights and deadline recommendations. | P2 |
| US-AI-06 | As an Owner, I want to turn AI features off for my organization. | P2 |

### 8.14 Administration (§11.17)

| ID | Story | Priority |
|---|---|---|
| US-ADM-01 | As an Owner/Admin, I want an admin panel for members, invitations, teams, projects, roles and settings. | P0 |
| US-ADM-02 | As an Owner/Admin, I want usage statistics for the organization. | P1 |
| US-ADM-03 | As an Owner/Admin, I want filterable audit logs with CSV export. | P1 |
| US-ADM-04 | As an Owner, I want to manage the subscription from the admin panel. | P2 |
| US-ADM-05 | As an Owner on BUSINESS+, I want to toggle custom permissions (e.g., members can invite, members can create projects). | P2 |

---

## 9. Functional Requirements

Each requirement is testable and tagged MVP or Post-MVP. Detailed behavior lives in §11; API surface in §18; data in §17.

### 9.1 Multi-tenancy and organizations (request §3, §6)

| ID | Requirement | Scope |
|---|---|---|
| FR-ORG-01 | The system MUST support unlimited organizations; each has independent settings, members, roles, workspaces, teams, projects, subscription and analytics. | MVP |
| FR-ORG-02 | Every tenant-scoped record MUST carry `organizationId`; every read/write MUST be scoped to the caller's organization membership (§20). | MVP |
| FR-ORG-03 | A user MUST be able to belong to many organizations and switch between their workspaces without re-login. | MVP |
| FR-ORG-04 | Creating an organization MUST create a default workspace named "General", assign the creator as OWNER, and create a FREE subscription record. | MVP |
| FR-ORG-05 | Organizations MUST have a unique URL slug (3–40 chars, `[a-z0-9-]`), name, optional logo, settings (JSON) and a billing profile. | MVP |
| FR-ORG-06 | Only the OWNER MUST be able to delete the organization or transfer ownership; deletion requires typing the organization slug and runs as a background purge job. | MVP |
| FR-ORG-07 | Organization-level analytics MUST aggregate across all workspaces the caller can access. | MVP |

### 9.2 Authentication (request §4) — see §19

| ID | Requirement | Scope |
|---|---|---|
| FR-AUTH-01 | Registration with name, email, password (min 8 chars, max 128, at least one letter and one number) MUST create an unverified user and send a verification email. | MVP |
| FR-AUTH-02 | Email verification links MUST expire after 24 h and be single-use; verification MUST be required before accessing any organization. | MVP |
| FR-AUTH-03 | Login MUST issue a server-side session delivered in an HTTP-only, Secure, SameSite=Lax cookie; logout MUST revoke that session. | MVP |
| FR-AUTH-04 | Forgot-password MUST send a single-use link valid for 1 h; successful reset MUST revoke all other sessions. | MVP |
| FR-AUTH-05 | Google OAuth (Authorization Code + PKCE) MUST sign in an existing user with the same verified email or create a verified user. | MVP |
| FR-AUTH-06 | Profile management MUST support name, avatar upload (Cloudinary, ≤ 5 MB, JPEG/PNG/WebP, cropped to 256×256), timezone and password change with re-authentication. | MVP |
| FR-AUTH-07 | Account deletion MUST require password or OAuth re-authentication, MUST be blocked while the user is the sole OWNER of any organization, and MUST scrub PII while preserving authored content as "Deleted User". | MVP |
| FR-AUTH-08 | Login, registration, verification and reset endpoints MUST be rate-limited per IP and per account (§21). | MVP |
| FR-AUTH-09 | Multi-factor authentication (TOTP) is a Future Enhancement; the schema MUST not prevent adding it. | Future |

### 9.3 Role-based access control (request §5) — see §12

| ID | Requirement | Scope |
|---|---|---|
| FR-RBAC-01 | Organization roles OWNER, ADMIN, MEMBER, GUEST; workspace roles WORKSPACE_ADMIN, WORKSPACE_MEMBER; project roles PROJECT_MANAGER, CONTRIBUTOR, VIEWER; team roles LEAD, MEMBER. | MVP |
| FR-RBAC-02 | All permissions in §12 MUST be enforced by server-side middleware/services; the frontend only hides or disables controls. | MVP |
| FR-RBAC-03 | Exactly one OWNER per organization; OWNER cannot be removed or demoted except through ownership transfer. | MVP |
| FR-RBAC-04 | GUEST users MUST only see projects they are explicitly added to, MUST NOT see the member directory, teams or workspace dashboards, and MUST NOT create projects. | MVP |
| FR-RBAC-05 | BUSINESS and ENTERPRISE organizations MAY toggle custom permission settings (members can invite, members can create projects, guests can comment). | Post-MVP |

### 9.4 Workspace management (request §6)

| ID | Requirement | Scope |
|---|---|---|
| FR-WS-01 | OWNER/ADMIN MUST be able to create workspaces (name, slug unique per org, description, logo, accent color) within the plan's workspace limit. | MVP |
| FR-WS-02 | Workspace membership MUST be a subset of organization membership; OWNER/ADMIN are implicit WORKSPACE_ADMIN of every workspace. | MVP |
| FR-WS-03 | Workspaces MUST support update, archive and delete (delete requires no active projects or an explicit "delete all contents" confirmation). | MVP |
| FR-WS-04 | The default workspace cannot be deleted while it is the only workspace. | MVP |
| FR-WS-05 | Workspace switching MUST update the URL (`/:orgSlug/:workspaceSlug/...`) and remember the last active workspace per user. | MVP |
| FR-WS-06 | Workspace activity history MUST list domain events (project/team/member changes) with actor, timestamp and diff, paginated. | MVP |
| FR-WS-07 | Invitations (§11.3) MAY target a specific workspace in addition to the organization role. | MVP |

### 9.5 Team management (request §7)

| ID | Requirement | Scope |
|---|---|---|
| FR-TEAM-01 | Teams belong to one workspace; fields: name, slug (unique per workspace), description, lead (a workspace member), members. | MVP |
| FR-TEAM-02 | WORKSPACE_ADMIN creates/updates/deletes teams; LEAD manages members and team projects. | MVP |
| FR-TEAM-03 | Team projects (`Project.teamId`) MUST grant all team members CONTRIBUTOR access by default (implicit, overridable by explicit project role). | MVP |
| FR-TEAM-04 | Team activity feed and productivity analytics (tasks completed, throughput, workload per member). | MVP (basic) / Post-MVP (advanced) |
| FR-TEAM-05 | Deleting a team MUST either reassign its projects to the workspace (`teamId = null`) or archive them, chosen by the caller. | MVP |

### 9.6 Project management (request §8)

| ID | Requirement | Scope |
|---|---|---|
| FR-PROJ-01 | Project fields: name, key (2–6 uppercase letters/digits, unique per workspace, immutable after first task), description (rich text), cover image, start/end dates, priority (LOW/MEDIUM/HIGH/URGENT), status (PLANNING/ACTIVE/ON_HOLD/COMPLETED/ARCHIVED), owner, members, team (optional), visibility (WORKSPACE or PRIVATE). | MVP |
| FR-PROJ-02 | Creating a project MUST seed the default status set (§11.6.2) and add the creator as PROJECT_MANAGER and owner. | MVP |
| FR-PROJ-03 | Archive sets status ARCHIVED and makes the project read-only; restore returns it to its previous status. | MVP |
| FR-PROJ-04 | Delete is a soft delete (`deletedAt`); contents are purged after 30 days by a job. OWNER/ADMIN/PROJECT_MANAGER only. | MVP |
| FR-PROJ-05 | Milestones: name, description, due date, status (OPEN/COMPLETED), ordered; tasks may reference one milestone. | MVP |
| FR-PROJ-06 | Progress = completed tasks ÷ total non-deleted tasks (subtasks included) ×100, computed on read; health indicator per §11.12.3. | MVP |
| FR-PROJ-07 | Project activity history from `ActivityLog` filtered by project. | MVP |
| FR-PROJ-08 | Active-project count per workspace MUST respect the plan limit (§23). | MVP |

### 9.7 Task management (request §9)

| ID | Requirement | Scope |
|---|---|---|
| FR-TASK-01 | Task fields: title (1–200 chars), description (rich text), key (`KEY-n`), assignees (0..n), reporter, priority, status (project status), start date, due date, estimated hours (0–9999, 0.25 step), actual hours, labels, attachments, subtasks, dependencies, comments, activity, milestone, position. | MVP |
| FR-TASK-02 | Statuses are per project; each maps to one category: BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, BLOCKED, DONE. Moving to a DONE-category status sets `completedAt`; leaving it clears `completedAt`. | MVP |
| FR-TASK-03 | Subtasks are tasks with `parentTaskId` (one level deep); parent cards show `done/total` subtask counts. | MVP |
| FR-TASK-04 | Dependencies: "A blocks B"; cycles MUST be rejected (409); a task with open blockers shows a "blocked by" indicator and MAY be moved to a BLOCKED-category status automatically (§11.15 recipe). | MVP |
| FR-TASK-05 | Drag-and-drop between statuses and reorder within a status using fractional index positions; the server validates the target status belongs to the project. | MVP |
| FR-TASK-06 | Filtering by status, priority, assignee, label, milestone, due date range, created date range, has-attachments, text; sorting by any scalar field; cursor pagination. | MVP |
| FR-TASK-07 | Bulk update (status, priority, assignees, labels, due date, delete) for up to 100 selected tasks in one request, applied transactionally. | MVP |
| FR-TASK-08 | Duplicate copies title, description, priority, labels, estimate, subtasks (as new tasks) and milestone; not comments, attachments, actual hours or dependencies. | MVP |
| FR-TASK-09 | Task templates per workspace/project (title pattern, description, priority, labels, estimate, subtasks). | Post-MVP |
| FR-TASK-10 | Recurring tasks: RRULE-based schedule creating the next occurrence when the current one is completed or on schedule, whichever the rule says. | Post-MVP |
| FR-TASK-11 | Labels are workspace-scoped (name unique per workspace, color), attachable to any task in the workspace. | MVP |
| FR-TASK-12 | Every change to a task MUST write an `ActivityLog` entry (field, old value, new value, actor) and emit a real-time event. | MVP |
| FR-TASK-13 | Task updates MUST use optimistic concurrency (`version`); a stale write returns 409 with the current record. | MVP |

### 9.8 Project views (request §10)

| ID | Requirement | Scope |
|---|---|---|
| FR-VIEW-01 | Kanban: one column per status in order; column reorder, rename, color, add/delete (delete requires choosing a target status for existing tasks); cards show key, title, priority icon, assignee avatars, due date, label chips, subtask count, attachment count, comment count. | MVP |
| FR-VIEW-02 | List: virtualized table (title, key, status, priority, assignees, due date, labels, estimate, milestone, created), column visibility, multi-sort, inline editing for status/priority/assignees/due date/labels/title, row selection with bulk actions. | MVP |
| FR-VIEW-03 | Calendar: month and week grids showing tasks by due date and milestones; drag to change due date; create task on a day; "unscheduled" side list. | MVP |
| FR-VIEW-04 | Timeline/Gantt: task bars from start to due date, milestones as diamonds, dependency arrows, drag to move/resize, zoom day/week/month, today marker. | Post-MVP (Phase 5b) |
| FR-VIEW-05 | Dashboard (project overview): statistics, completion, workload, health, milestones, recent activity (§11.12). | MVP |
| FR-VIEW-06 | All views share the same filter bar and update live via sockets. | MVP |

### 9.9 Real-time collaboration (request §11)

| ID | Requirement | Scope |
|---|---|---|
| FR-RT-01 | Socket.io connection authenticated by the session cookie; unauthenticated handshakes are rejected. | MVP |
| FR-RT-02 | Clients join rooms only after a server-side membership check; rooms are `org`, `workspace`, `project`, `task`, `user`. | MVP |
| FR-RT-03 | Server emits task, comment, reaction, attachment, project, member and notification events after the DB transaction commits (§18.9). | MVP |
| FR-RT-04 | Presence: online members per workspace and viewers per task; typing indicator in comment composer. | MVP (online) / P1 (viewers, typing) |
| FR-RT-05 | Client reconnection MUST re-join rooms and refetch stale queries. | MVP |

### 9.10 Comments and communication (request §12)

| ID | Requirement | Scope |
|---|---|---|
| FR-COMM-01 | Task comments with rich text (bold, italic, lists, code, links, mentions), attachments, one level of threaded replies. | MVP |
| FR-COMM-02 | Mentions resolve to project members only; each mention creates a MENTIONED notification. | MVP |
| FR-COMM-03 | Emoji reactions (one per user per emoji per comment) with counts. | MVP |
| FR-COMM-04 | Edit own comment (shows "edited"), delete own comment; PROJECT_MANAGER deletes any; deleted comments show a tombstone if they have replies. | MVP |
| FR-COMM-05 | Project discussions (top-level comments on a project with threads). | Post-MVP |
| FR-COMM-06 | All comment actions are logged in `ActivityLog`. | MVP |

### 9.11 Notifications (request §13)

| ID | Requirement | Scope |
|---|---|---|
| FR-NOTIF-01 | In-app notifications persisted per user with type, title, body, link data, read state; delivered live over sockets. | MVP |
| FR-NOTIF-02 | Email notifications via a transactional provider, sent from a background job, with unsubscribe/preferences link. | MVP |
| FR-NOTIF-03 | Types: TASK_ASSIGNED, TASK_UNASSIGNED, TASK_STATUS_CHANGED, TASK_DUE_SOON, TASK_OVERDUE, TASK_COMMENTED, MENTIONED, PROJECT_ADDED, PROJECT_STATUS_CHANGED, MILESTONE_DUE_SOON, ORG_INVITATION, MEMBER_JOINED, AUTOMATION_ALERT, BILLING_EVENT. | MVP (billing/automation types Post-MVP) |
| FR-NOTIF-04 | Deadline reminders: TASK_DUE_SOON 24 h before the due date (once) and TASK_OVERDUE on the day after the due date (once), to assignees. | MVP |
| FR-NOTIF-05 | Preferences per type and channel (in-app, email); defaults: all in-app on; email on for assignment, mention, invitation, due-soon, overdue. | MVP |
| FR-NOTIF-06 | Mark one/all as read or unread; unread badge count; pagination. | MVP |
| FR-NOTIF-07 | Actors never receive notifications for their own actions. | MVP |

### 9.12 File management (request §14)

| ID | Requirement | Scope |
|---|---|---|
| FR-FILE-01 | Browser uploads directly to Cloudinary using server-generated signatures that encode folder, resource type, allowed formats and a 10-minute expiry. | MVP |
| FR-FILE-02 | Allowed types: images (jpeg, png, gif, webp, svg sanitized), pdf, text/markdown/csv, office documents (docx, xlsx, pptx), zip, mp4/webm (≤ plan limit). Executables and scripts are rejected. | MVP |
| FR-FILE-03 | Per-file size limit by plan (FREE 10 MB, PRO 25 MB, BUSINESS 100 MB — A-6) and org storage quota; both enforced at signing and at confirm. | MVP |
| FR-FILE-04 | The server MUST confirm each upload (verify resource exists, bytes and format) before creating the `Attachment` row; unconfirmed uploads are cleaned up after 1 h. | MVP |
| FR-FILE-05 | Delivery through short-lived signed URLs (15 min) generated only after a permission check; no public URLs. | MVP |
| FR-FILE-06 | Previews for images, PDFs (first page), video; download for others; delete by uploader or PROJECT_MANAGER removes the Cloudinary resource asynchronously. | MVP |
| FR-FILE-07 | File metadata (name, mime, bytes, width/height, uploader, target) stored in the database. | MVP |

### 9.13 Dashboard and analytics (request §15)

| ID | Requirement | Scope |
|---|---|---|
| FR-DASH-01 | Workspace dashboard tiles: total/active/completed projects, total/pending/overdue/completed tasks, upcoming deadlines (7 days), recent activity (20). | MVP |
| FR-DASH-02 | Charts: task completion trend (daily/weekly), project progress (bar), task distribution by status category, priority distribution, team performance (completed per team), weekly productivity (per member), monthly project statistics. | MVP |
| FR-DASH-03 | Date range filter (`from`, `to`, presets 7/30/90 days, this month, custom) applied to all time-based metrics; FREE plan limited to 30 days of history (A-6). | MVP |
| FR-DASH-04 | Team and individual productivity (completed tasks, hours, on-time rate) with workload (open tasks and estimated hours per member vs 40 h/week capacity). | MVP basic / Post-MVP advanced |
| FR-DASH-05 | All metrics computed from database aggregates with the formulas in §11.12; no client-side estimation. | MVP |

### 9.14 Search and filtering (request §16)

| ID | Requirement | Scope |
|---|---|---|
| FR-SRCH-01 | Global search endpoint across projects, tasks, teams, users and comments the caller can access, grouped by type, 5 per group by default, "see all" pagination. | MVP |
| FR-SRCH-02 | Postgres full-text search (`tsvector`, GIN) with prefix matching and `pg_trgm` similarity for typos; task key exact match ranks first. | MVP |
| FR-SRCH-03 | Advanced task filters per FR-TASK-06 across a workspace (not just one project) with cursor pagination. | MVP |
| FR-SRCH-04 | p95 search latency ≤ 300 ms at 100k tasks per organization. | MVP |

### 9.15 Subscription and billing (request §17) — see §23

| ID | Requirement | Scope |
|---|---|---|
| FR-BILL-01 | Four plans (FREE, PRO, BUSINESS, ENTERPRISE) with limits defined in code (§23.1); every org has exactly one subscription record. | MVP (FREE enforcement) |
| FR-BILL-02 | Plan limits enforced server-side at creation points (workspace, member, project, attachment, automation, AI request) returning HTTP 402 `PLAN_LIMIT_REACHED`. | MVP |
| FR-BILL-03 | Pricing page (public) and in-app upgrade prompts. | MVP (static) |
| FR-BILL-04 | Razorpay Subscriptions checkout, webhook-verified activation, upgrades (immediate), downgrades and cancellation (end of cycle), billing history, invoices, payment status, usage page. | Post-MVP |
| FR-BILL-05 | Payment status MUST only change through verified webhooks or server-side API reconciliation, never from client input. | Post-MVP |

### 9.16 Automation engine (request §18) — see §11.15

| ID | Requirement | Scope |
|---|---|---|
| FR-AUTO-01 | Rules = trigger + conditions (all must match) + ordered actions, scoped to a project or a workspace. | Post-MVP |
| FR-AUTO-02 | Triggers: TASK_CREATED, TASK_STATUS_CHANGED, TASK_ASSIGNED, TASK_PRIORITY_CHANGED, TASK_DUE_SOON, TASK_COMPLETED, ALL_PROJECT_TASKS_COMPLETED, COMMENT_ADDED. | Post-MVP |
| FR-AUTO-03 | Actions: NOTIFY (users/roles), SEND_EMAIL, SET_STATUS, SET_PRIORITY, SET_ASSIGNEES, ADD_LABEL, SET_DUE_DATE, ADD_COMMENT, UPDATE_PROJECT_STATUS. | Post-MVP |
| FR-AUTO-04 | Asynchronous execution with per-rule execution log, retry (3×), loop protection and per-org rate limit. | Post-MVP |

### 9.17 AI features (request §19) — see §24

| ID | Requirement | Scope |
|---|---|---|
| FR-AI-01 | AI features are gated by plan, organization setting and explicit user action; the application MUST work fully with AI disabled or the provider down. | Post-MVP |
| FR-AI-02 | Features: task description generation, project planning suggestions, task breakdown into subtasks, project summaries, meeting-notes summarization, productivity insights, deadline recommendations, weekly reports. | Post-MVP |
| FR-AI-03 | Provider-agnostic adapter (Gemini, OpenAI, Anthropic) selected by environment configuration; usage tracked per org/user. | Post-MVP |

### 9.18 Administration (request §20)

| ID | Requirement | Scope |
|---|---|---|
| FR-ADM-01 | Organization admin panel: members, invitations, teams, projects, roles/permissions, subscription, usage statistics, audit logs, settings. | MVP (billing tab Post-MVP) |
| FR-ADM-02 | Audit logs = `ActivityLog` entries of category SECURITY and BILLING plus membership/role changes; filter by actor, action, date; CSV export. | MVP (export P1) |
| FR-ADM-03 | Platform administration: `User.isPlatformAdmin` flag and internal read-only endpoints under `/api/internal/*`, restricted by flag and IP allowlist; no UI in scope. | Post-MVP |

---

## 10. Non-Functional Requirements

| ID | Category | Requirement | Target / Verification |
|---|---|---|---|
| NFR-01 | Performance (API) | List endpoints (tasks, projects, notifications, activity) respond fast at scale. | p95 ≤ 300 ms with 10,000 tasks in a project and 100,000 tasks in an org; load test in Phase 12 |
| NFR-02 | Performance (API) | Write endpoints (create/update task, comment) respond fast. | p95 ≤ 200 ms excluding network |
| NFR-03 | Performance (web) | Dashboard and board pages load fast on a mid-range laptop over 4G. | LCP ≤ 2.5 s, TTI ≤ 3.5 s, Lighthouse Performance ≥ 90; route-level code splitting; initial JS ≤ 350 kB gzipped |
| NFR-04 | Performance (real-time) | Socket events are delivered promptly. | p95 ≤ 500 ms from commit to client receipt in the same region |
| NFR-05 | Performance (data) | No N+1 queries; every list is paginated; every filter column indexed. | Prisma query logging review per phase; max page size 100 |
| NFR-06 | Scalability | Stateless API processes; horizontal scaling blocked only by Socket.io adapter (Redis adapter documented). | 1,000 concurrent socket connections per instance; 50 req/s sustained per instance |
| NFR-07 | Availability | Best effort on free hosting. | No uptime SLA; the free Render service sleeps after 15 min idle and wakes in about 30–60 s while the SPA shows a wake-up screen (§26.1) |
| NFR-08 | Durability | Backups and recovery. | Neon's free restore window plus a weekly encrypted `pg_dump` from GitHub Actions (§26.6); RPO ≤ 7 days; one restore test in Phase 12 |
| NFR-09 | Security | Requirements in §21 implemented and verified. | OWASP ASVS L2 checklist pass; dependency audit in CI; cross-tenant test suite |
| NFR-10 | Accessibility | WCAG 2.1 AA for all core flows. | Keyboard-operable board (dnd-kit keyboard sensor), focus management in dialogs, ARIA labels, color contrast ≥ 4.5:1; axe checks in Playwright |
| NFR-11 | Responsiveness | Usable from 360 px to 1920 px. | Breakpoints 640/768/1024/1280; Playwright viewports mobile/tablet/desktop |
| NFR-12 | Maintainability | Modular code, typed end to end, shared schemas. | ESLint + TypeScript strict pass; module boundaries per §15; ≥ 80% unit coverage on services and permission logic |
| NFR-13 | Testability | Every module has unit and integration tests; E2E covers MVP exit criteria. | CI gates in §25.6 |
| NFR-14 | Reliability | Background jobs are at-least-once with idempotent handlers; webhooks deduplicated. | pg-boss retries; `WebhookEvent` unique provider event id |
| NFR-15 | Observability | Structured logs with request id, user id, org id; error tracking. | pino JSON logs; Sentry (optional) with release tags; slow-query log > 500 ms |
| NFR-16 | Caching | Cache only where measured. | Session lookup may be cached in memory (60 s); analytics responses cached 60 s per org+query; no other caching in MVP |
| NFR-17 | Data limits | Protect the service from abuse. | Request body ≤ 1 MB (JSON); rich text ≤ 50 kB; bulk ops ≤ 100 items; 100 labels per workspace; 50 statuses per project; 500 members per org (soft) |
| NFR-18 | Compatibility | Last 2 versions of Chrome, Edge, Firefox, Safari; iOS Safari 16+. | Playwright on Chromium + WebKit |
| NFR-19 | Privacy | Personal data minimized; deletion honored. | Account deletion scrubs PII within 24 h; DPDP/GDPR notes in A-18 |
| NFR-20 | Internationalization readiness | English only, but no hard-coded date/number formats. | `Intl` APIs; user timezone in profile |

---

## 11. Feature Specifications

Each subsection defines behavior, rules, edge cases and acceptance criteria (`AC-`). "Actor" means the authenticated user; permission names refer to §12.

### 11.1 Authentication and account

**11.1.1 Registration**
- Inputs: `name` (1–80), `email` (RFC 5322, stored lowercase, unique case-insensitively), `password` (8–128, ≥ 1 letter, ≥ 1 digit, checked against a list of the 10,000 most common passwords).
- On success: user created with `emailVerifiedAt = null`, verification token (random 32 bytes, SHA-256 hash stored, 24 h expiry) emailed, session issued, response 201 with the user profile.
- If the email already exists: respond 200 with the same generic message ("If this email is new, we sent a verification link") to prevent enumeration; send an "account already exists" email instead.
- Invitation-aware: if the registration URL carries `?invite=<token>`, the invitation is accepted automatically after verification (§11.3).

**11.1.2 Email verification**
- `GET /verify-email?token=` from the email → frontend page → `POST /auth/verify-email`. Token hash lookup, expiry check, single use; sets `emailVerifiedAt`, deletes the token.
- Unverified users can log in but every organization route returns 403 `EMAIL_NOT_VERIFIED`; the app shows a "Verify your email" gate with resend (rate-limited to 1 per 60 s, 5 per day).

**11.1.3 Login, sessions, logout**
- `POST /auth/login` with email + password → Argon2id verify (time-constant failure path) → `Session` row (random 32-byte token, SHA-256 hash stored, `expiresAt = now + 30 days`, absolute max 90 days from creation, `lastSeenAt` updated at most once per 5 minutes) → cookie `nf_session` (HttpOnly, Secure, SameSite=Lax, Path=/, host-only with no `Domain` attribute).
- Failed logins: 5 failures per account in 15 minutes → 15-minute lockout (429 `TOO_MANY_ATTEMPTS`); 20 per IP per 15 minutes.
- Logout revokes the current session; "log out everywhere" revokes all sessions of the user.
- Session list shows device (user agent), IP, created, last seen, with per-session revoke.

**11.1.4 Forgot / reset password**
- `POST /auth/forgot-password` always returns 200. If the user exists, email a link with a single-use token (1 h). `POST /auth/reset-password` validates, sets the new hash, revokes all sessions, emails a confirmation.

**11.1.5 Google OAuth**
- `GET /auth/google` → redirect with `state` (signed, 10 min) and PKCE verifier stored in a short-lived cookie → callback exchanges the code server side → Google profile `{ sub, email, email_verified, name, picture }`.
- Rules: `email_verified` must be true. If an `OAuthAccount(provider='google', providerAccountId=sub)` exists → log in. Else if a user with that email exists → link the account (only because Google asserts the verified email) → log in. Else → create user with `emailVerifiedAt = now`, avatar from `picture`.
- Users created via Google have no password; "Set a password" is available in Security settings via the reset flow.

**11.1.6 Profile**
- Fields: name, avatar, timezone (IANA), locale (read-only, from browser), notification preferences link.
- Avatar upload uses the Cloudinary signed-upload flow (§11.11) with transformation `c_fill,g_face,w_256,h_256,f_auto,q_auto`; previous avatar is destroyed asynchronously.

**11.1.7 Account deletion**
- Preconditions: re-authentication (password or fresh Google login within 5 minutes); user is not the sole OWNER of any organization (list the blocking orgs with "transfer or delete" links).
- Effect: `deletedAt` set; `email` → `deleted+<id>@deleted.invalid`; `name` → "Deleted User"; avatar removed; all sessions and OAuth accounts deleted; memberships, team memberships, project memberships, assignees and notification preferences deleted; invitations sent by the user kept; authored tasks, comments and activity kept with the scrubbed author.

**Acceptance criteria**
- AC-AUTH-01: Registering with a new email returns 201, creates a user with no verified timestamp and sends exactly one verification email (captured by the test mail sink).
- AC-AUTH-02: Registering with an existing email returns 200 with the generic message and does not create a second user.
- AC-AUTH-03: A verification token works once; the second use returns 400 `TOKEN_INVALID`; a token older than 24 h returns 400 `TOKEN_EXPIRED`.
- AC-AUTH-04: Login sets an HttpOnly, Secure, SameSite=Lax cookie and returns the profile; a request with no cookie to `/users/me` returns 401.
- AC-AUTH-05: After 5 failed logins within 15 minutes, the 6th attempt returns 429 even with the correct password.
- AC-AUTH-06: Password reset invalidates all existing sessions; the old cookie returns 401 afterwards.
- AC-AUTH-07: Google login with an email that already has a password account links the Google account and logs in without creating a duplicate user.
- AC-AUTH-08: Account deletion is refused with 409 `SOLE_OWNER` when the user solely owns an organization; after a successful deletion, the user's tasks still exist with author "Deleted User" and the email can be used to register again.

### 11.2 Organizations and workspaces

**11.2.1 Creating an organization (onboarding)**
- Triggered after first verification or from the switcher ("Create organization"). Inputs: name (2–60), slug (auto-suggested from name, editable, unique globally), optional logo.
- Effects in one transaction: `Organization`, `OrganizationMember(role=OWNER)`, `Workspace(name="General", slug="general", isDefault=true)`, `WorkspaceMember(role=WORKSPACE_ADMIN)`, `Subscription(planTier=FREE, status=ACTIVE)`, `ActivityLog(ORG_CREATED)`.
- A user may create at most 5 organizations on FREE (abuse guard, A-7).

**11.2.2 Organization settings**
- General: name, slug (changing the slug updates all URLs; old slug redirects for 30 days via a `slugHistory` array), logo, default workspace, timezone for reports.
- Security (Post-MVP): allowed email domains for invitations; require re-authentication for billing.
- Danger zone: transfer ownership (select an ADMIN; requires OWNER password), delete organization (type slug; soft delete, purge job after 7 days; all members notified).

**11.2.3 Workspace switcher**
- Lists every workspace of every organization the user belongs to, grouped by organization, with the plan badge and unread counts. Selecting one navigates to `/:orgSlug/:workspaceSlug/home` and stores `lastActiveWorkspaceId` on the user.
- Opening `/` redirects to the last active workspace, else the first available, else onboarding.

**11.2.4 Workspaces**
- Create (OWNER/ADMIN): name (2–60), slug (unique per org), description, logo, accent color. Plan guard: `count(workspaces where archivedAt is null) < plan.maxWorkspaces` else 402.
- Members: WORKSPACE_ADMIN adds org members (not GUESTs) to the workspace with a workspace role; OWNER/ADMIN are implicit admins and are not listed as explicit members unless added.
- Archive: hides the workspace from switchers; projects become read-only. Delete: allowed when the workspace has no non-deleted projects, or with "delete all contents" confirmation (soft delete + purge job).
- Workspace activity: `ActivityLog` where `workspaceId = X and category = DOMAIN`, cursor-paginated, filterable by actor and entity type.

**Acceptance criteria**
- AC-ORG-01: Creating an organization creates the General workspace, the OWNER membership and a FREE subscription in one transaction (verified by querying all four records).
- AC-ORG-02: A FREE organization that already has 1 workspace receives 402 `PLAN_LIMIT_REACHED` with `{ limit: "maxWorkspaces", current: 1, max: 1 }` when creating another.
- AC-ORG-03: A user who belongs to two organizations sees both groups in the switcher and switching updates the URL and `lastActiveWorkspaceId`.
- AC-ORG-04: A non-member requesting `/orgs/{slug}/workspaces` receives 404; a GUEST receives 403 for workspace settings endpoints.
- AC-ORG-05: Deleting the last workspace returns 409 `LAST_WORKSPACE`.

### 11.3 Invitations and membership

- OWNER/ADMIN invite by email (up to 20 per request) with an org role (ADMIN, MEMBER or GUEST), optional workspace, and for GUEST an optional list of projects. Plan guard on `members + pending invitations`.
- `Invitation` has a random token (hash stored), 7-day expiry, status PENDING/ACCEPTED/DECLINED/REVOKED/EXPIRED. One PENDING invitation per (org, email); re-inviting resends and resets expiry.
- Email contains the accept link `/invite/<token>`. The accept page shows org name, inviter and role.
  - Logged-in user with matching email → accept creates memberships → redirect into the workspace.
  - Logged-in user with a different email → warning "This invitation is for x@y; log out to continue".
  - Logged-out existing user → login then accept. New user → registration pre-filled with email, accept after verification.
- Decline marks DECLINED and notifies the inviter. Revoke by OWNER/ADMIN. Expired invitations are marked by a daily job.
- Accepting creates `OrganizationMember`, `WorkspaceMember` (if a workspace was specified or the default workspace for MEMBER role), `ProjectMember(CONTRIBUTOR)` for GUEST project lists, a MEMBER_JOINED notification to the inviter and an `ActivityLog` entry.
- Member management: list (search, role filter, pagination), change role (ADMIN cannot promote to OWNER or change another ADMIN unless they are OWNER — A-8), remove (removes all workspace/team/project memberships and unassigns tasks, logged), suspend (Post-MVP).

**Acceptance criteria**
- AC-INV-01: Inviting an email creates one PENDING invitation and one email; inviting again within the expiry reuses the record and resends.
- AC-INV-02: Accepting with a different logged-in email returns 403 `INVITATION_EMAIL_MISMATCH`.
- AC-INV-03: Accepting an expired token returns 410 `INVITATION_EXPIRED`.
- AC-INV-04: Accepting a GUEST invitation with two projects creates exactly two `ProjectMember` rows and no `WorkspaceMember` row.
- AC-INV-05: Removing a member unassigns them from all tasks in the organization and revokes their access to sockets within 5 seconds (server emits `member:removed` and disconnects their sockets from org rooms).

### 11.4 Teams

- Create (WORKSPACE_ADMIN): name (2–60), slug unique per workspace, description, lead (must be a workspace member; becomes LEAD team member). Update: same fields. Delete: choose "move projects to workspace" or "archive projects".
- Members: LEAD or WORKSPACE_ADMIN adds workspace members; a team member with role LEAD can be changed; at least one LEAD per team.
- Team projects: created by LEAD or WORKSPACE_ADMIN; all current and future team members get implicit CONTRIBUTOR access; explicit project roles override.
- Team page: members, projects, activity feed, analytics tab (completed tasks per member for the range, open workload, throughput trend).

**Acceptance criteria**
- AC-TEAM-01: A workspace member who is not a LEAD or admin receives 403 when adding team members.
- AC-TEAM-02: Adding a user to a team gives them access to the team's projects immediately (GET project returns 200) and removing them revokes it (404) unless they hold an explicit project role.
- AC-TEAM-03: Deleting a team with "move projects" sets `teamId = null` on its projects; "archive" sets their status to ARCHIVED.

### 11.5 Projects

**11.5.1 Create / edit**
- Inputs: name (2–100), key (auto-suggested from name, 2–6 `[A-Z0-9]`, unique per workspace, editable until the first task exists), description (Tiptap JSON ≤ 50 kB), cover image (Cloudinary, ≤ 5 MB, resized to 1600×400), start/end dates (end ≥ start), priority, status (default PLANNING), owner (default creator), team (optional), visibility (WORKSPACE: visible to all workspace members as VIEWER; PRIVATE: members only).
- Plan guard: active projects (status ≠ ARCHIVED, not deleted) per workspace < `plan.maxActiveProjects` (FREE 3).
- On create: default statuses seeded, creator becomes PROJECT_MANAGER, `ActivityLog(PROJECT_CREATED)`, event `project:created` to the workspace room.

**11.5.2 Status lifecycle**
- PLANNING → ACTIVE → (ON_HOLD ⇄ ACTIVE) → COMPLETED → ARCHIVED; any status → ARCHIVED (archive) and ARCHIVED → previous (restore). COMPLETED can be set manually or by the "all tasks completed" automation (Post-MVP).
- ARCHIVED projects are read-only (all mutation endpoints return 409 `PROJECT_ARCHIVED` except restore and delete).

**11.5.3 Members and roles**
- PROJECT_MANAGER adds workspace members (MEMBER role) or GUESTs with a project role; the owner is always PROJECT_MANAGER; at least one PROJECT_MANAGER remains.
- Effective access = §12.4 resolution.

**11.5.4 Milestones**
- Fields: name (1–100), description, due date, status OPEN/COMPLETED, `position`. Milestone progress = done tasks ÷ tasks linked to it. Overdue milestone = due date passed and OPEN.

**11.5.5 Progress and health**
- See §11.12.3 for formulas. Shown on the project header, project cards and the dashboard.

**11.5.6 Delete / restore**
- Soft delete (`deletedAt`); project disappears from lists; 30-day restore from "Trash" (admin panel); purge job hard-deletes tasks, comments, attachments (Cloudinary destroy) and activity.

**Acceptance criteria**
- AC-PROJ-01: Creating a project seeds exactly six default statuses in the order Backlog, Todo, In Progress, In Review, Blocked, Done with the matching categories.
- AC-PROJ-02: A FREE workspace with 3 active projects gets 402 on the 4th; archiving one allows creation again.
- AC-PROJ-03: Changing the key after a task exists returns 409 `KEY_LOCKED`.
- AC-PROJ-04: A workspace member who is not a project member can read a WORKSPACE-visibility project (200, role VIEWER) but not a PRIVATE one (404).
- AC-PROJ-05: Mutating an archived project returns 409 `PROJECT_ARCHIVED`; restore returns it to the previous status recorded in `ActivityLog`.
- AC-PROJ-06: Project progress equals `round(done/total*100)` computed from a fresh count, including subtasks.

### 11.6 Tasks

**11.6.1 Creation and key**
- Minimum input: title. Defaults: status = project's default (`isDefault`), priority MEDIUM, reporter = actor, position = last in column.
- Key: `Project.taskSequence` is incremented with `UPDATE ... SET task_sequence = task_sequence + 1 RETURNING task_sequence` inside the insert transaction; `number` is unique per project; `key = {PROJECT_KEY}-{number}` is computed in responses and indexed through `(projectId, number)`.

**11.6.2 Statuses**
- Default set per project: Backlog (BACKLOG, grey), Todo (TODO, blue), In Progress (IN_PROGRESS, indigo), In Review (IN_REVIEW, violet), Blocked (BLOCKED, red), Done (DONE, green). PROJECT_MANAGER can rename, recolor, reorder, add (≤ 50) and delete statuses; deleting requires a target status for existing tasks; at least one status per category DONE and one non-DONE must exist.
- Category drives: `completedAt`, analytics, automations, "blocked" semantics, calendar coloring.

**11.6.3 Assignees, reporter, priority, dates, hours, labels, milestone**
- Assignees: 0..n project members with CONTRIBUTOR or PROJECT_MANAGER role (VIEWERs cannot be assigned). Each assignment creates TASK_ASSIGNED; removal TASK_UNASSIGNED.
- Priority LOW/MEDIUM/HIGH/URGENT with icons (▽, —, △, ‼) and colors (grey, blue, orange, red).
- Dates are date-only (`DATE`); due < start is rejected (400). Overdue = due date < today in the viewer's timezone and category ≠ DONE.
- `estimatedHours`/`actualHours`: decimal(7,2) ≥ 0; actual hours are entered manually (no timer).
- Labels: ≤ 20 per task; milestone must belong to the same project.

**11.6.4 Subtasks**
- `parentTaskId` set at creation or by "convert to subtask" (only if the task has no subtasks of its own); subtasks share the project; a subtask cannot have subtasks (400 `MAX_DEPTH`). Parent shows `completed/total`. Completing a parent does not auto-complete subtasks (prompt in UI offers it).

**11.6.5 Dependencies**
- `TaskDependency(blockingTaskId, blockedTaskId)` within the same project (cross-project Post-MVP). Adding runs a depth-first check for cycles (409 `DEPENDENCY_CYCLE`). The task detail shows "Blocked by" and "Blocks" lists; the board card shows a chain icon when it has open blockers (blocking task category ≠ DONE).

**11.6.6 Ordering and drag-and-drop**
- `position` is a fractional-index string (`fractional-indexing` package). Move request: `{ statusId, beforeTaskId?, afterTaskId?, version }`; the server computes the new key between neighbours, validates both neighbours are in the target status and project, writes status + position atomically, logs, emits `task:moved`. Re-index the column when key length > 50.

**11.6.7 Editing, concurrency, activity**
- `PATCH /tasks/:id` accepts partial fields plus `version`; mismatch returns 409 `VERSION_CONFLICT` with the current task. Every changed field becomes one `ActivityLog` entry (`task.updated`, `{ field, from, to }`), batched in one row per request with a `changes` array. Events: `task:updated` with the changed fields.

**11.6.8 Filtering, sorting, searching**
- Query params: `statusId[]`, `category[]`, `priority[]`, `assigneeId[]` (`me`, `unassigned` supported), `labelId[]`, `milestoneId[]`, `parentTaskId` (`null` for top-level), `dueFrom`, `dueTo`, `createdFrom`, `createdTo`, `overdue=true`, `hasAttachments`, `q` (full-text), `sort` (`position`, `priority`, `dueDate`, `createdAt`, `updatedAt`, `title`, `estimatedHours`; prefix `-` for desc; multiple), `cursor`, `limit` (≤ 100, default 50).

**11.6.9 Bulk updates, duplication**
- `POST /tasks/bulk` `{ taskIds[≤100], set: { statusId?, priority?, addAssigneeIds?, removeAssigneeIds?, addLabelIds?, removeLabelIds?, dueDate?, milestoneId? } }` or `{ taskIds, action: "delete" | "archive" }`; permission checked per task; applied in one transaction; one activity row per task; one `task:bulk-updated` event.
- Duplicate per FR-TASK-08; new key; title suffixed "(copy)".

**11.6.10 Deletion**
- Soft delete with `deletedAt`; subtasks deleted with the parent; dependencies removed; restore within 30 days from Trash; purge job afterwards. Contributors delete tasks they created; PROJECT_MANAGER deletes any.

**11.6.11 My Tasks**
- `/my-tasks`: tasks assigned to the actor across all accessible projects, grouped by due (Overdue, Today, This week, Later, No date), with quick status change.

**Acceptance criteria**
- AC-TASK-01: Two concurrent task creations in the same project receive consecutive numbers with no gaps or duplicates (tested with 50 parallel requests).
- AC-TASK-02: Moving a task into a status of another project returns 400 `STATUS_NOT_IN_PROJECT`.
- AC-TASK-03: Adding dependency B→A when A→B exists returns 409 `DEPENDENCY_CYCLE`; the same holds for a 3-node cycle.
- AC-TASK-04: Updating with a stale `version` returns 409 and the response body contains the current task.
- AC-TASK-05: Moving a task to a DONE-category status sets `completedAt`; moving it back clears it; both actions appear in the activity timeline.
- AC-TASK-06: Bulk updating 100 tasks succeeds in one transaction; a request with 101 IDs returns 400.
- AC-TASK-07: A VIEWER receives 403 for task creation and update; a GUEST CONTRIBUTOR on project P cannot read tasks of project Q (404).
- AC-TASK-08: Filtering by `assigneeId=me&overdue=true` returns only tasks assigned to the actor whose due date is before today (actor timezone) and whose status category is not DONE.

### 11.7 Project views

**11.7.1 Kanban board**
- Columns = project statuses in `position` order; column header shows name, color dot, count, WIP badge (Post-MVP); "+" quick-add at column bottom; collapse column.
- Cards: key, title (2 lines), priority icon, due date (red if overdue, amber if today), assignee avatars (max 3 + count), labels (max 3 + count), subtask progress, attachment and comment counts, blocked icon.
- Drag between/within columns (pointer and keyboard sensors); optimistic move with rollback on error; others' moves animate in from `task:moved` events.
- Filter bar (shared): quick filters (My tasks, Overdue, Unassigned), full filter popover, search, group by (status default; assignee and priority Post-MVP).
- Column management (PROJECT_MANAGER): add, rename, recolor, reorder (drag), delete with reassignment dialog.
- Performance: columns render up to 200 cards each without virtualization; above that the column shows a "Load more" footer (cursor pagination per status).

**11.7.2 List view**
- TanStack Table with row virtualization (`@tanstack/react-virtual`); columns configurable and persisted per user per project in `localStorage`; multi-column sort; inline editors (status select, priority select, assignee picker, date picker, label picker, title text); selection checkboxes with a floating bulk-action bar (status, priority, assignee, labels, due date, delete); keyboard navigation (arrow keys, Enter to open, Space to select).

**11.7.3 Calendar view**
- Month grid (6 rows) and week view (7 columns with task chips); chips show key + title + priority color; milestones rendered as diamonds on their due date; drag chip to another day → `PATCH dueDate`; click empty day → quick-create with due date; unscheduled tasks in a collapsible side panel (drag onto a day to schedule); navigate by month/week, "Today" button; respects filter bar.

**11.7.4 Timeline / Gantt (Post-MVP, Phase 5b)**
- Rows = tasks (grouped by milestone or status), bars from `startDate` to `dueDate` (tasks without start date render as 1-day bars at due date), milestones as diamonds, dependency arrows from blocker end to blocked start, today line, zoom day/week/month, drag to move, resize edges to change dates, click to open task. Horizontal virtualization for ≥ 1,000 tasks. Read-only on screens < 768 px.

**11.7.5 Project overview (dashboard view)**
- Tiles: total tasks, completed %, overdue count, due this week, unassigned; progress ring; health badge; milestone list with progress; status distribution donut; workload bar per assignee (open tasks, estimated hours); recent activity (10); members list.

**Acceptance criteria**
- AC-VIEW-01: Dragging a card to another column updates the task's status for a second user within 500 ms without refresh (Playwright two-context test).
- AC-VIEW-02: Deleting a column with tasks requires a target column; tasks are moved there in one transaction.
- AC-VIEW-03: In List view, editing the priority inline persists and the activity timeline records the change.
- AC-VIEW-04: Dragging a task chip in the calendar to another day updates `dueDate` and the chip appears on the new day for other users.
- AC-VIEW-05: The board with 500 tasks in one column renders the first 200 and a "Load more" control; scrolling performance stays ≥ 50 FPS in a Lighthouse trace.

### 11.8 Real-time collaboration

**11.8.1 Connection**
- Socket.io server mounted on the API process at path `/socket.io`, CORS restricted to the web origin, transports `websocket` first with polling fallback. The handshake reads the `nf_session` cookie, validates the session (same code path as HTTP auth) and attaches `{ userId }` to the socket; failures disconnect with `UNAUTHENTICATED`.
- Per-user connection cap: 10 sockets (additional connections are refused).

**11.8.2 Rooms**
- `room:join { type: 'org'|'workspace'|'project'|'task', id }` → server checks membership/permission (§12.4) → joins `org:<id>` etc. and acknowledges `{ ok: true }` or `{ ok: false, code }`. `room:leave` mirrors it. The `user:<id>` room is joined automatically on connect for notifications.
- The web client joins the org and workspace rooms when a workspace is opened, the project room when a project view is opened, and the task room when a task detail is opened; it leaves on navigation.
- Membership changes (member removed, project access revoked) cause the server to call `socket.leave` for affected rooms and emit `access:revoked` to the user room.

**11.8.3 Events (server → client)** — full contract in §18.9. Every payload has `{ orgId, workspaceId?, projectId?, actorId, occurredAt, data }`. Emission happens after the database transaction commits (service layer emits via an `EventBus` that the socket gateway and the job queue subscribe to).

**11.8.4 Presence and indicators**
- `presence:ping` every 30 s from clients; the server keeps `Map<workspaceId, Map<userId, { lastSeen, taskId? }>>` in memory and broadcasts `presence:update` to the workspace room when a user comes online/offline (TTL 60 s) and `task:viewers` to task rooms when viewers change.
- `typing:start/stop { taskId }` relayed to the task room (throttled 1/s per user).

**11.8.5 Client behavior**
- Socket events patch TanStack Query caches (task lists, task detail, comments, notifications) or invalidate when the patch is ambiguous (bulk updates, moves with unknown neighbours). On reconnect: re-join rooms and invalidate all queries for the current project.

**Acceptance criteria**
- AC-RT-01: A handshake without a valid session cookie is rejected; with a valid cookie it is accepted and the `user:<id>` room is joined.
- AC-RT-02: `room:join` for a project the user cannot access acknowledges `{ ok: false, code: 'FORBIDDEN' }` and no events from that project are delivered afterwards (asserted by emitting a task update and waiting 1 s).
- AC-RT-03: A task update by user A is received by user B's socket in the project room with the changed fields and `actorId = A`.
- AC-RT-04: Removing user B from the project results in B's socket leaving the project room within 5 s; subsequent events are not delivered.
- AC-RT-05: Presence shows a user online while they ping and offline within 60 s of the last ping.

### 11.9 Comments and reactions

- Comment body: Tiptap JSON (bold, italic, strike, code, code block, bullet/ordered list, link, mention node `{ type: 'mention', attrs: { id, label } }`), ≤ 20 kB; server validates the node schema with a whitelist and extracts mention user ids; mentions must be project members else they are converted to plain text.
- Create on a task (CONTRIBUTOR+; GUEST per plan setting "guests can comment", default true for GUEST CONTRIBUTORs — A-9); `parentCommentId` for a reply (replies cannot nest further: 400 `MAX_DEPTH`).
- Attachments on comments through the attachment flow with `commentId`.
- Edit: author only, within any time; sets `editedAt`. Delete: author or PROJECT_MANAGER; if the comment has replies it becomes a tombstone ("Comment deleted") preserving the thread; otherwise it is removed (soft delete).
- Reactions: `POST /comments/:id/reactions { emoji }` toggles; emoji restricted to a curated set of 24 plus any single Unicode emoji grapheme; counts and "reacted by" list in responses.
- Notifications: TASK_COMMENTED to assignees + reporter + participants (anyone who commented on the task) excluding the actor; MENTIONED to mentioned users (de-duplicated against TASK_COMMENTED).
- Events: `comment:created|updated|deleted`, `reaction:updated` to the task room and the project room (project room receives counts only).
- Project discussions (Post-MVP): `Comment.projectId` set and `taskId` null; a "Discussions" tab on the project lists top-level comments with threads; same permissions as task comments.

**Acceptance criteria**
- AC-COMM-01: Mentioning a user who is not a project member stores plain text and sends no notification.
- AC-COMM-02: A reply to a reply returns 400 `MAX_DEPTH`.
- AC-COMM-03: Deleting a parent comment with replies returns the tombstone in subsequent reads; deleting a childless comment removes it from reads.
- AC-COMM-04: Reacting twice with the same emoji removes the reaction (toggle); counts are correct for 3 users reacting.
- AC-COMM-05: The comment author does not receive TASK_COMMENTED or MENTIONED for their own comment.

### 11.10 Notifications

**11.10.1 Creation pipeline**
- Domain services call `notificationService.notify({ type, recipients, data, orgId })`. The service removes the actor, de-duplicates recipients, filters by each recipient's preferences, inserts `Notification` rows in one batch, emits `notification:new` to each `user:<id>` room, and enqueues `email.notification` jobs for recipients with email enabled for the type.
- Email jobs render templates (React Email or MJML, A-5) and send through the provider; failures retry 3 times with exponential backoff; permanent failures are logged.

**11.10.2 Inbox**
- `/inbox`: tabs All / Unread / Mentions; each item shows icon by type, title, body excerpt, project and task key, relative time; click navigates to the target and marks read; "Mark all as read"; per-item read/unread toggle; cursor pagination (30 per page); unread badge in the sidebar from `GET /notifications/unread-count` plus live increments.

**11.10.3 Reminder jobs**
- `reminders.due-soon` runs hourly: for tasks with `dueDate = tomorrow` (in each assignee's timezone, evaluated at 09:00 local) and no `dueSoonNotifiedAt`, notify assignees and set the marker. `reminders.overdue` runs hourly: tasks with `dueDate < today` (assignee timezone), category ≠ DONE, no `overdueNotifiedAt` → notify and mark. Milestones: MILESTONE_DUE_SOON to the project managers 3 days before.

**11.10.4 Preferences**
- `NotificationPreference(userId, type, inApp, email)`; defaults per FR-NOTIF-05; settings page lists types grouped (Tasks, Comments, Projects, Membership, Billing) with two toggles each; "Email digest" (daily summary) is Post-MVP.

**Acceptance criteria**
- AC-NOTIF-01: Assigning a task creates one TASK_ASSIGNED notification for the assignee, emits it over the socket and enqueues one email when the preference is enabled; with email disabled no job is enqueued.
- AC-NOTIF-02: A task due tomorrow produces exactly one TASK_DUE_SOON per assignee even if the job runs 24 times.
- AC-NOTIF-03: Marking all as read sets `readAt` on all unread notifications of that user only.
- AC-NOTIF-04: Unread count equals the number of rows with `readAt IS NULL` for the user (reconciliation test).

### 11.11 File management (Cloudinary)

**11.11.1 Upload flow**
1. Client calls `POST /orgs/:org/attachments/sign` with `{ target: { taskId | commentId | projectId | 'avatar' | 'cover' }, fileName, mimeType, sizeBytes }`.
2. Server checks permission on the target, validates mime/extension against the allowlist, checks `sizeBytes ≤ plan.maxFileBytes` and `org.storageUsedBytes + sizeBytes ≤ plan.maxStorageBytes`, creates an `Attachment` row with `status = PENDING`, and returns Cloudinary upload parameters: `cloudName`, `apiKey`, `timestamp`, `signature` (SHA-1/SHA-256 of the sorted params with the API secret), `folder = nexusflow/{env}/orgs/{orgId}/{targetType}/{targetId}`, `public_id = <attachmentId>`, `resource_type` (`image`, `video` or `raw`), `type = authenticated`, and for images `allowed_formats`.
3. Client uploads directly to `https://api.cloudinary.com/v1_1/{cloudName}/{resource_type}/upload` with progress UI.
4. Client calls `POST /attachments/:id/confirm` with the upload response. Server fetches the resource via the Cloudinary Admin API (`resource(public_id, { type: 'authenticated', resource_type })`), verifies `bytes` (≤ limit), `format`/mime, dimensions for images, sets `status = READY`, stores `bytes`, `format`, `width`, `height`, `version`, increments `Organization.storageUsedBytes` atomically, logs activity and emits `attachment:created`. Any mismatch → destroy the resource, delete the row, 400 `UPLOAD_INVALID`.
5. A cleanup job deletes PENDING rows older than 1 h (and their Cloudinary resources if present).

**11.11.2 Access**
- `GET /attachments/:id/url?variant=original|preview|thumb` → permission check → signed URL (`sign_url: true`, `type: 'authenticated'`, expiry 15 min) with transformations for `preview` (images: `w_1200,q_auto,f_auto`; PDF: `pg_1,f_jpg,w_800`; video: `so_0,f_jpg` poster plus streaming URL) and `thumb` (`c_fill,w_160,h_160`). Raw files return a download URL with `attachment` disposition.
- Attachment lists on task/comment include only metadata; URLs are fetched lazily.

**11.11.3 Delete**
- Uploader or PROJECT_MANAGER (or OWNER/ADMIN) → soft delete, decrement `storageUsedBytes`, enqueue `storage.destroy` job (`destroy(public_id, { type, resource_type, invalidate: true })`).

**11.11.4 Validation and safety**
- Allowlist (extension + declared mime + Cloudinary-detected format must agree): `jpg jpeg png gif webp svg pdf txt md csv json docx xlsx pptx zip mp4 webm`. SVG is served only as `attachment` download or rasterized preview (never inline) to avoid script execution. Max 10 attachments per request; 50 per task.
- File names sanitized (strip path separators and control characters, 1–255 chars); stored as `originalName`.

**Acceptance criteria**
- AC-FILE-01: Signing a 30 MB file on a FREE org returns 402 `PLAN_LIMIT_REACHED` with `limit: "maxFileBytes"`.
- AC-FILE-02: Confirming an upload whose Cloudinary `bytes` exceeds the limit destroys the resource and returns 400 `UPLOAD_INVALID`; `storageUsedBytes` is unchanged.
- AC-FILE-03: A user without project access requesting `/attachments/:id/url` receives 404; a member receives a URL that expires within 15 minutes.
- AC-FILE-04: Deleting an attachment decrements the storage counter and enqueues exactly one destroy job.
- AC-FILE-05: Uploading `evil.exe` (or a `.jpg` whose detected format is not an image) is rejected.

### 11.12 Dashboard and analytics

**11.12.1 Scope and filters**
- Scopes: workspace (default), project, team, user ("my productivity"), organization (admin panel). Access: metrics include only projects the caller can access; OWNER/ADMIN see everything.
- Parameters: `from`, `to` (inclusive dates, default last 30 days, max range 366 days; FREE max 30 days), `tz` (defaults to the user profile timezone; bucketing uses it), `granularity = day | week | month` (auto by range length).

**11.12.2 Metric definitions**

| Metric | Definition (SQL-level) |
|---|---|
| Total projects | `count(Project where deletedAt is null)` in scope |
| Active projects | status = ACTIVE |
| Completed projects | status = COMPLETED (in range by `completedAt` for trend tiles, overall for totals) |
| Total tasks | `count(Task where deletedAt is null)`; subtasks included; templates excluded |
| Pending tasks | status category ∉ {DONE} |
| Overdue tasks | `dueDate < current_date (tz)` and category ≠ DONE |
| Completed tasks | category = DONE (in range by `completedAt` for trend, overall for totals) |
| Task completion trend | `count(Task) group by date_trunc(granularity, completedAt at tz)` for `completedAt` in range |
| Project progress | per project: `done / total * 100` (0 when total = 0) |
| Task distribution by status | count by status category (and by status for the project scope) |
| Priority distribution | count of open tasks by priority |
| Team performance | per team: tasks completed in range, on-time rate = completed with `completedAt::date ≤ dueDate` ÷ completed with a due date |
| Weekly productivity | per member: tasks completed per ISO week in range, `sum(actualHours)` |
| Monthly project statistics | per month: projects created, projects completed, tasks created, tasks completed |
| Individual productivity | completed tasks, actual hours, on-time rate, average cycle time = `avg(completedAt − createdAt)` |
| Team workload | per member: open tasks assigned, `sum(estimatedHours)` of open tasks, utilization = estimated hours due within 7 days ÷ 40 h (A-10) |
| Upcoming deadlines | tasks with `dueDate` in `[today, today+7]`, open, ordered by due date, limit 10 |
| Recent activities | last 20 `ActivityLog` rows in scope, category DOMAIN |

**11.12.3 Project health**
- Inputs: `progress` (0–100), `elapsed` = days since `startDate` ÷ total days (`endDate − startDate`), `overdueRatio` = overdue open tasks ÷ open tasks.
- OFF_TRACK if `endDate < today and progress < 100`, or `overdueRatio ≥ 0.2`, or (`elapsed − progress/100 ≥ 0.25`).
- AT_RISK if `overdueRatio ≥ 0.1` or (`elapsed − progress/100 ≥ 0.1`).
- ON_TRACK otherwise. NOT_SCHEDULED when start or end date is missing (then only the overdue rule applies).
- Thresholds are constants in `packages/shared/src/analytics.ts` (configurable per org Post-MVP).

**11.12.4 Implementation notes**
- Aggregations run as parameterized SQL (Prisma `$queryRaw` with tagged templates) over indexed columns (`(organizationId, completedAt)`, `(projectId, statusId)`, `(dueDate)`); results cached 60 s in-process keyed by scope + params; the dashboard issues at most 6 requests (tiles, trend, distribution, progress, workload, activity) in parallel.
- Charts (Recharts): line/area (trend), stacked bar (status by project), donut (distribution), horizontal bar (workload), with tooltips, legends, empty states and skeletons.

**Acceptance criteria**
- AC-DASH-01: With a seeded dataset (fixtures of 3 projects / 40 tasks with known states) every tile equals the fixture's expected counts.
- AC-DASH-02: Changing `from/to` changes the trend series and leaves totals unchanged.
- AC-DASH-03: A MEMBER who can access 1 of 3 projects sees metrics for that project only; an ADMIN sees all.
- AC-DASH-04: A FREE org requesting a 90-day range receives 402 `PLAN_LIMIT_REACHED` with `limit: "analyticsHistoryDays"`.
- AC-DASH-05: Project health returns OFF_TRACK for a project whose end date passed with progress 80%.

### 11.13 Search and filtering

- Indexing: generated `tsvector` columns — `Task.searchVector` (title weight A, key weight A, descriptionText weight C), `Project.searchVector` (name A, key A, descriptionText C), `Team.searchVector` (name A, description C), `Comment.searchVector` (bodyText B), `User` searched via `name ilike` + `email ilike` within organization members; GIN indexes; `pg_trgm` GIN index on `Task.title`, `Project.name` for fuzzy prefix.
- Ranking: exact key match first, then `ts_rank_cd` with `websearch_to_tsquery('simple', q)` OR prefix query, then `similarity() > 0.3`.
- Global endpoint `GET /orgs/:org/search?q=&types=task,project,team,user,comment&workspaceId=&limit=5` returns `{ tasks: { items, total }, projects: {…}, … }` filtered to accessible projects (`EXISTS` on the access CTE from §12.4); comments link to their task.
- Advanced task filter endpoint reuses §11.6.8 across a workspace (`GET /orgs/:org/workspaces/:ws/tasks`).
- Command palette (⌘K): local navigation commands plus debounced (200 ms) global search; recent items in `localStorage`.

**Acceptance criteria**
- AC-SRCH-01: Searching `NEX-12` returns that task first; searching `nex 12` still finds it through prefix matching.
- AC-SRCH-02: A GUEST searching a term present in a project they do not belong to gets no result from that project.
- AC-SRCH-03: Search over 100,000 tasks responds in ≤ 300 ms p95 (Phase 12 load test).
- AC-SRCH-04: Workspace-wide filter `labelId[]=X&priority[]=URGENT&dueTo=<date>` returns exactly the matching fixtures with a valid `nextCursor`.

### 11.14 Subscription and billing (Razorpay) — Post-MVP except FREE enforcement

**11.14.1 Plans and enforcement (MVP)**
- Plan config in `packages/shared/src/plans.ts` (§23.1). `PlanGuard.assert(org, limitKey, currentUsage)` is called by services before creating workspaces, members/invitations, projects, attachments (bytes), automations, AI requests and when requesting analytics ranges. Failures throw `PlanLimitError` → HTTP 402 `{ code: 'PLAN_LIMIT_REACHED', limit, current, max, upgradeUrl }`.
- Feature flags per plan (`features` set) gate endpoints (`requirePlanFeature('automations')`) → 402 `PLAN_FEATURE_REQUIRED`.

**11.14.2 Pricing page (MVP static)**
- Public `/pricing`: four columns with limits from the shared config and prices from `PLAN_PRICES` (placeholders, A-1), monthly/yearly toggle, FAQ, "Contact sales" form for ENTERPRISE (stores a `SalesLead` row and emails sales — Post-MVP; MVP shows a mailto).

**11.14.3 Checkout (Phase 9)**
1. OWNER opens Billing → chooses PRO/BUSINESS + interval → `POST /billing/checkout { planTier, interval }`.
2. Server ensures a Razorpay Customer (`providerCustomerId`), creates a Razorpay Subscription (`plan_id` from config, `total_count` 120 months / 10 years, `quantity` 1 for flat pricing, `notes: { orgId }`), stores `providerSubscriptionId` with status `INCOMPLETE`, returns `{ subscriptionId, keyId }`.
3. Frontend opens Razorpay Checkout.js with `subscription_id`; on the handler callback the client posts `razorpay_payment_id`, `razorpay_subscription_id`, `razorpay_signature` to `POST /billing/checkout/verify` which verifies HMAC-SHA256(`payment_id|subscription_id`, key secret) and shows "Processing" — **this does not activate the plan**.
4. Webhook `subscription.activated` (and `subscription.charged`) → verified → `Subscription.status = ACTIVE`, `planTier`, `currentPeriodStart/End` set → `BILLING_EVENT` notification → `billing:updated` socket event → UI unlocks.

**11.14.4 Webhooks**
- Endpoint `POST /api/v1/billing/webhooks/razorpay` uses the raw body, verifies `X-Razorpay-Signature` (HMAC-SHA256 with the webhook secret, constant-time compare), stores `WebhookEvent(provider, providerEventId = X-Razorpay-Event-Id, type, payload)` with a unique constraint (duplicates → 200 immediately), processes synchronously within 5 s or enqueues, marks `processedAt`/`error`.
- Handled events and effects: `subscription.authenticated` (status AUTHENTICATED), `subscription.activated` (ACTIVE, period), `subscription.charged` (ACTIVE, extend period, create `Payment` and `Invoice`), `subscription.pending` (PAST_DUE, notify OWNER), `subscription.halted` (UNPAID → read-only mode after 7 days), `subscription.cancelled` (CANCELED at period end → FREE), `subscription.completed` (CANCELED), `subscription.paused/resumed`, `payment.failed` (Payment FAILED, notify), `invoice.paid` (Invoice PAID, `pdfUrl` from `short_url`).

**11.14.5 Changes and cancellation**
- Upgrade (PRO → BUSINESS, or monthly → yearly): `PATCH /billing/subscription { planTier, interval }` → Razorpay update with `schedule_change_at: 'now'`, `customer_notify: 1`; status stays ACTIVE; proration follows Razorpay's behavior (A-2 to verify in Phase 9).
- Downgrade: guard — if current usage exceeds target limits respond 409 `DOWNGRADE_BLOCKED` listing the over-limit resources; else schedule with `schedule_change_at: 'cycle_end'`, store `scheduledPlanTier`; applied when `subscription.charged` arrives for the new plan or at period end by a daily reconciliation job.
- Cancel: `POST /billing/subscription/cancel` → Razorpay cancel with `cancel_at_cycle_end: 1`; `cancelAtPeriodEnd = true`; at period end the subscription becomes CANCELED and the org reverts to FREE: resources over FREE limits become read-only (projects beyond 3 are marked `isReadOnly` by the reconciliation job; members beyond 5 keep access but no new members can be added; AI/automations disabled).
- Reactivate before period end: `POST /billing/subscription/resume` (Razorpay has no "un-cancel", so this creates a new subscription starting at period end — documented limitation, A-2).

**11.14.6 Billing page**
- Current plan, status, renewal date, "Manage" actions, usage bars (workspaces, members, projects, storage, automations, AI), payment method note (managed on Razorpay's hosted page), invoices table (number, date, amount, status, PDF link), payments table, billing profile (legal name, address, GSTIN optional — A-3), billing email.

**Acceptance criteria**
- AC-BILL-01: Any creation exceeding a FREE limit returns 402 with the structured limit payload (tested for workspaces, members, projects, file size, analytics range).
- AC-BILL-02: A webhook with an invalid signature returns 400 and creates no `WebhookEvent`; a valid one is stored and processed; a replay with the same event id returns 200 without re-processing.
- AC-BILL-03: `checkout/verify` with a valid signature does not change `Subscription.status`; only the `subscription.activated` webhook does.
- AC-BILL-04: A downgrade request while 10 active projects exist against a target limit of 3 returns 409 `DOWNGRADE_BLOCKED` with the list of over-limit resources.
- AC-BILL-05: After `subscription.cancelled` and period end, `planTier` is FREE and project creation returns 402 when 3 active projects exist.

### 11.15 Automation engine — Post-MVP (Phase 10)

**11.15.1 Model**
- `Automation { scope: workspaceId + optional projectId, name, isEnabled, trigger: { type, params }, conditions: Condition[], actions: Action[] }`.
- Condition: `{ field: 'status.category' | 'statusId' | 'priority' | 'assigneeIds' | 'labelIds' | 'projectId' | 'dueDate' | 'estimatedHours', op: 'eq' | 'neq' | 'in' | 'notIn' | 'contains' | 'gte' | 'lte' | 'isEmpty' | 'isNotEmpty', value }`; all conditions must pass (AND); OR groups are Post-Phase-10.
- Action: `{ type: 'NOTIFY', recipients: { roles: ['PROJECT_MANAGER' | 'ORG_ADMINS' | 'ASSIGNEES' | 'REPORTER'], userIds: [] }, message }`, `{ type: 'SEND_EMAIL', … }`, `{ type: 'SET_STATUS', statusId | category }`, `{ type: 'SET_PRIORITY', priority }`, `{ type: 'SET_ASSIGNEES', userIds, mode: 'replace' | 'add' }`, `{ type: 'ADD_LABEL', labelId }`, `{ type: 'SET_DUE_DATE', relativeDays | date }`, `{ type: 'ADD_COMMENT', body }`, `{ type: 'UPDATE_PROJECT_STATUS', status }`.

**11.15.2 Execution**
- Domain events (`task.created`, `task.updated` with changed fields, `task.completed`, `comment.created`, scheduled `task.due-soon`, derived `project.all-tasks-completed` evaluated after each completion) are published on the in-process `EventBus` and persisted as `automation.evaluate` jobs (pg-boss) with the event payload.
- The worker loads enabled automations for the event's project and workspace, matches trigger type and params (e.g., `TASK_STATUS_CHANGED` with `toCategory = DONE`), evaluates conditions against the task snapshot, executes actions sequentially as the system actor (`actorId = null`, `origin = automationId`), writes `AutomationExecution { status, result, error }`.
- Loop protection: events whose origin chain already contains the same automation id are skipped; chain depth ≤ 3; per-org cap 1,000 executions/hour (BUSINESS 10,000); failures retry 3× with backoff; disabled after 20 consecutive failures with a notification to the creator.

**11.15.3 Presets (recipes)**
1. When a task is completed → notify the project manager(s).
2. When a task is due in 24 h → remind assignees (built-in reminders already do this; the recipe adds a custom message or extra recipients).
3. When a task is assigned → notify the assignee (built-in; recipe adds email template or message).
4. When priority becomes URGENT → notify organization admins.
5. When all project tasks are completed → set project status COMPLETED and notify the owner.
Also: when a blocking task is completed → comment on blocked tasks; when a task enters BLOCKED → notify PM.

**11.15.4 Builder UI**
- Three-step form (trigger → conditions → actions) with live summary sentence ("When a task's status changes to Done, if priority is Urgent, then notify Project Managers"), test-run against a chosen task (dry run returns which actions would fire), execution log with filters.

**Acceptance criteria**
- AC-AUTO-01: Recipe 1 creates a notification for every PROJECT_MANAGER when a task moves to a DONE-category status and none for other statuses.
- AC-AUTO-02: An automation that sets status DONE for tasks entering DONE (self-trigger) executes once and is skipped on the second evaluation (loop guard), with an execution row of status SKIPPED.
- AC-AUTO-03: Recipe 5 marks the project COMPLETED only when the last open task completes; reopening a task does not revert the project automatically.
- AC-AUTO-04: A FREE org receives 402 `PLAN_FEATURE_REQUIRED` on automation creation.

### 11.16 AI features — Post-MVP (Phase 11)

**11.16.1 Gating and privacy**
- Enabled only when `plan.features` includes `ai`, `Organization.settings.aiEnabled = true` (OWNER toggle, default on for eligible plans), and the user explicitly clicks an AI action. Monthly quota per org from the plan; per-user rate limit 20 requests/hour.
- Data sent to the provider: only the fields needed (task title/description, project name/description, task list with status/dates for summaries, pasted notes). Never attachments, emails, or other organizations' data. A notice is shown before first use; prompts include an instruction that output is a suggestion.
- All AI output is shown as a preview the user accepts, edits or discards; nothing is written without acceptance (except scheduled weekly reports stored as drafts).
- Failures (timeout 30 s, provider error, quota) show an inline message; the rest of the UI is unaffected. If no provider key is configured, AI UI is hidden entirely.

**11.16.2 Features**

| Feature | Input | Output | Entry point |
|---|---|---|---|
| Task description generation | task title, project context | Tiptap-compatible description with goal, acceptance checklist | Task editor "✨ Draft description" |
| Task breakdown | task title + description | 3–10 subtasks with titles, estimates | Task detail "✨ Suggest subtasks" (creates after accept) |
| Project planning suggestions | project name, description, dates | milestones + initial tasks | Project create/empty state |
| Project summary | tasks, statuses, recent activity, milestones | 150–300 word status summary, risks | Project overview "✨ Summarize" |
| Meeting notes summarization | pasted text ≤ 20 kB | summary, decisions, action items (each convertible to a task) | ⌘K "Summarize notes" |
| Productivity insights | analytics series | 3–5 bullet insights with numbers | Dashboard "✨ Insights" |
| Deadline recommendations | task estimate, assignee workload, dependencies | suggested due date with rationale | Task due-date picker |
| Weekly report | project/workspace metrics of the week | report (markdown) emailed to PMs/owners and stored | Scheduled Monday 08:00 org time; manual "Generate" |

**11.16.3 Implementation**
- `AiProvider` interface `{ complete(request: { system, prompt, schema?, maxTokens }): Promise<{ text | json, usage }> }` with adapters for Gemini, OpenAI and Anthropic chosen by `AI_PROVIDER` (A-4); JSON outputs validated with Zod; `AiUsage` row per request (feature, model, tokens, latency, status); prompts versioned in `apps/api/src/modules/ai/prompts/`.

**Acceptance criteria**
- AC-AI-01: With `AI_PROVIDER` unset, no AI endpoints are registered (404) and the UI shows no AI controls.
- AC-AI-02: A FREE org calling an AI endpoint receives 402; a PRO user over the hourly limit receives 429.
- AC-AI-03: Task breakdown returns a validated JSON array; invalid provider output yields 502 `AI_INVALID_OUTPUT` and no subtasks are created.
- AC-AI-04: Accepting a breakdown creates subtasks with the actor as reporter and logs `AiUsage`.

### 11.17 Administration

**11.17.1 Organization admin panel** (`/:org/settings/org/*`, OWNER/ADMIN)
- Members: table (name, email, role, workspaces, teams, last active, status), search, role change, remove, export CSV (P1).
- Invitations: pending list with resend/revoke; bulk invite textarea.
- Teams: all teams across workspaces with lead, member count, project count; edit/delete.
- Projects: all projects (including PRIVATE) across workspaces with status, owner, task counts; archive/restore/delete; Trash tab (30-day restore).
- Roles and permissions: read-only matrix (§12) plus BUSINESS+ toggles (members can invite, members can create projects, guests can comment, guests can upload).
- Subscription: §11.14.6 (Phase 9).
- Usage: members / workspaces / active projects / storage / automations / AI requests vs limits; 12-month task creation and completion sparkline.
- Audit logs: `ActivityLog` with category SECURITY or BILLING plus `member.*`, `role.*`, `invitation.*`, `project.deleted`, `workspace.*`, `settings.*`; filters by actor, action, date range, entity; CSV export (P1); retention per plan (A-11).
- Settings: §11.2.2.

**11.17.2 Platform administration (Post-MVP, minimal)**
- `User.isPlatformAdmin` set manually in the database. Endpoints under `/api/internal/*` (list organizations with plan/status/usage, view subscription and webhook events, disable an organization) require the flag and an IP allowlist (`INTERNAL_IP_ALLOWLIST`), log every call as SECURITY activity and are excluded from the public API docs. No UI.

**Acceptance criteria**
- AC-ADM-01: A MEMBER requesting any `/orgs/:org/admin/*` endpoint receives 403; an ADMIN receives 200; billing endpoints additionally require OWNER.
- AC-ADM-02: Changing a member's role writes an `ActivityLog` row with category SECURITY containing actor, target, from and to roles.
- AC-ADM-03: Audit log filtering by `action = member.role_changed` and a date range returns only matching rows; CSV export contains the same rows.
- AC-ADM-04: `/api/internal/organizations` returns 403 for a platform admin calling from a non-allowlisted IP and 404 for non-admins.

---

## 12. User Roles and Permissions Matrix

### 12.1 Role definitions

| Level | Role | Who | Summary |
|---|---|---|---|
| Organization | OWNER | Exactly one per org (creator by default) | Everything, including billing, deletion, ownership transfer |
| Organization | ADMIN | Appointed by OWNER/ADMIN | Everything except billing, org deletion, ownership transfer, and changing other ADMINs/OWNER |
| Organization | MEMBER | Regular employee | Works in workspaces they belong to; creates projects; no org administration |
| Organization | GUEST | External collaborator (client, freelancer) | Only explicitly shared projects; no directory, teams, dashboards or project creation |
| Workspace | WORKSPACE_ADMIN | Set per workspace; OWNER/ADMIN implicit | Manages workspace settings, members, teams, labels; implicit PROJECT_MANAGER on workspace projects |
| Workspace | WORKSPACE_MEMBER | Default for MEMBERs added to the workspace | Sees WORKSPACE-visibility projects as VIEWER, creates projects, joins teams |
| Team | LEAD | ≥ 1 per team | Manages team members and team projects |
| Team | MEMBER | | Implicit CONTRIBUTOR on team projects |
| Project | PROJECT_MANAGER | Owner + appointed | Manages project settings, members, statuses, milestones, automations; deletes anything in the project |
| Project | CONTRIBUTOR | | Creates/edits tasks, comments, attachments; deletes own |
| Project | VIEWER | | Read-only |

### 12.2 Organization-level permissions

| Permission | OWNER | ADMIN | MEMBER | GUEST |
|---|---|---|---|---|
| View organization profile and own memberships | ✓ | ✓ | ✓ | ✓ |
| Update organization settings and branding | ✓ | ✓ | ✗ | ✗ |
| Manage billing (checkout, plan changes, invoices, billing profile) | ✓ | ✗ | ✗ | ✗ |
| View usage statistics | ✓ | ✓ | ✗ | ✗ |
| Delete organization / transfer ownership | ✓ | ✗ | ✗ | ✗ |
| Invite members (ADMIN, MEMBER, GUEST) | ✓ | ✓ | ✗ (BUSINESS+ toggle: ✓) | ✗ |
| View member directory | ✓ | ✓ | ✓ | ✗ |
| Change member roles | ✓ (any) | ✓ (MEMBER⇄GUEST, promote to ADMIN) | ✗ | ✗ |
| Remove members | ✓ (any except self) | ✓ (MEMBER, GUEST) | ✗ | ✗ |
| Create / archive / delete workspaces | ✓ | ✓ | ✗ | ✗ |
| View audit logs | ✓ | ✓ | ✗ | ✗ |
| Manage org-wide automations and AI settings | ✓ | ✓ | ✗ | ✗ |
| Access organization-level analytics | ✓ | ✓ | ✗ | ✗ |
| Leave organization | ✗ (must transfer first) | ✓ | ✓ | ✓ |

### 12.3 Workspace, team and project permissions

| Permission | OWNER / ADMIN | WORKSPACE_ADMIN | WORKSPACE_MEMBER | Team LEAD | PROJECT_MANAGER | CONTRIBUTOR | VIEWER | GUEST (with project role) |
|---|---|---|---|---|---|---|---|---|
| Update workspace settings / branding | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Manage workspace members | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| View workspace dashboard and activity | ✓ | ✓ | ✓ | ✓ | ✓ (project scope) | ✓ (project scope) | ✓ (project scope) | ✗ (project overview only) |
| Create / edit / delete teams | ✓ | ✓ | ✗ | edit own team | ✗ | ✗ | ✗ | ✗ |
| Manage team members | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Manage labels | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Create projects | ✓ | ✓ | ✓ (BUSINESS+ toggle may restrict) | ✓ (team projects) | — | — | — | ✗ |
| Edit project settings, cover, dates, status | ✓ | ✓ | ✗ | ✓ (team projects) | ✓ | ✗ | ✗ | per project role |
| Archive / restore project | ✓ | ✓ | ✗ | ✓ (team projects) | ✓ | ✗ | ✗ | ✗ |
| Delete project | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Manage project members and roles | ✓ | ✓ | ✗ | ✓ (team projects) | ✓ | ✗ | ✗ | ✗ |
| Manage task statuses and milestones | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| View project and tasks | ✓ | ✓ | WORKSPACE-visibility only | team projects | ✓ | ✓ | ✓ | ✓ |
| Create tasks | ✓ | ✓ | ✗ (unless project role) | team projects | ✓ | ✓ | ✗ | per role |
| Update any task (fields, status, move) | ✓ | ✓ | ✗ | team projects | ✓ | ✓ | ✗ | per role |
| Assign tasks | ✓ | ✓ | ✗ | team projects | ✓ | ✓ | ✗ | per role |
| Delete tasks | ✓ | ✓ | ✗ | own | any | own | ✗ | own |
| Bulk update tasks | ✓ | ✓ | ✗ | team projects | ✓ | ✓ | ✗ | per role |
| Comment, react, upload attachments | ✓ | ✓ | ✗ | team projects | ✓ | ✓ | ✗ | per role (uploads: BUSINESS+ toggle) |
| Edit / delete comments | any delete | any delete | — | own | any delete | own | ✗ | own |
| View project reports / overview | ✓ | ✓ | WORKSPACE-visibility only | ✓ | ✓ | ✓ | ✓ | ✓ |
| Manage project automations | ✓ | ✓ | ✗ | team projects | ✓ | ✗ | ✗ | ✗ |
| Use AI actions | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |

### 12.4 Resolution rules (implemented in `permissionService.resolve(user, org, resource)`)

1. Load `OrganizationMember` for `(userId, orgId)`; none → 404 for every tenant route.
2. OWNER and ADMIN: `effectiveProjectRole = PROJECT_MANAGER` for every project in the org; `effectiveWorkspaceRole = WORKSPACE_ADMIN` for every workspace.
3. GUEST: workspace access none; project access only via `ProjectMember`; effective role = the project role, capped at CONTRIBUTOR.
4. MEMBER: workspace access via `WorkspaceMember`; project access = max of (a) explicit `ProjectMember.role`, (b) CONTRIBUTOR if the project has `teamId` and the user is a `TeamMember`, (c) VIEWER if the project `visibility = WORKSPACE` and the user is a workspace member, (d) PROJECT_MANAGER if the user is `WORKSPACE_ADMIN` of that workspace or LEAD of the project's team. No match → 404 for the project.
5. Role ordering for "max": PROJECT_MANAGER > CONTRIBUTOR > VIEWER.
6. Plan toggles (BUSINESS+) are read from `Organization.settings.permissions` and only ever grant or restrict the specific permissions listed in §12.2/§12.3.
7. The resolver returns a `PermissionContext { orgRole, workspaceRole?, projectRole?, teamRole?, flags }` cached per request; `authorize('task:update')` middleware maps permission keys to the matrix above.
8. Decisions are deny-by-default; new endpoints must declare a permission key or they fail a startup check.

### 12.5 Accessible-projects query (used by lists, search, analytics)

```sql
-- $1 = userId, $2 = organizationId
SELECT p.id FROM "Project" p
WHERE p."organizationId" = $2 AND p."deletedAt" IS NULL AND (
  EXISTS (SELECT 1 FROM "OrganizationMember" om WHERE om."organizationId" = $2 AND om."userId" = $1 AND om.role IN ('OWNER','ADMIN'))
  OR EXISTS (SELECT 1 FROM "ProjectMember" pm WHERE pm."projectId" = p.id AND pm."userId" = $1)
  OR (p."teamId" IS NOT NULL AND EXISTS (SELECT 1 FROM "TeamMember" tm WHERE tm."teamId" = p."teamId" AND tm."userId" = $1))
  OR (p.visibility = 'WORKSPACE' AND EXISTS (SELECT 1 FROM "WorkspaceMember" wm WHERE wm."workspaceId" = p."workspaceId" AND wm."userId" = $1))
);
```

---

## 13. Application Workflows

### 13.1 Registration and onboarding
1. Visitor opens `/register`, enters name, email, password (or clicks "Continue with Google").
2. API creates the user, sends the verification email, sets the session cookie; the app shows "Check your inbox".
3. User clicks the link → `/verify-email?token=…` → API verifies → app redirects to `/onboarding`.
4. Onboarding step 1: organization name + slug (auto) + optional logo; step 2 (optional): invite teammates (emails + role); step 3 (optional): first project name.
5. API creates org + General workspace + FREE subscription (+ invitations + project). App lands on `/:org/general/home` with an empty-state checklist (create task, invite team, try the board).
6. If the user arrived through an invitation link, steps 4–5 are skipped: the invitation is accepted and they land in the inviter's workspace.

### 13.2 Invitation acceptance (existing vs new user)
1. OWNER/ADMIN enters emails + role (+ workspace / projects for GUEST) → API creates invitations and emails links.
2. Invitee opens `/invite/<token>` → page shows org, inviter, role.
3. Not logged in: "Log in" or "Create account" (email pre-filled, locked). New users verify email first; the token is kept in `sessionStorage` and re-submitted after verification.
4. Logged in with matching email: "Accept" → memberships created → redirect to the workspace. Mismatched email: message with "switch account".
5. Inviter receives MEMBER_JOINED; the member list and sockets (`member:joined`) update live.

### 13.3 Workspace switching
1. User opens the switcher (sidebar top or `⌘⇧O`); sees organizations and their workspaces with unread badges.
2. Selecting a workspace navigates to `/:org/:ws/home`; the app loads the tenant context (`GET /orgs/:org/context` returns org, membership, workspaces, permissions, plan), joins the org and workspace socket rooms, and stores `lastActiveWorkspaceId`.
3. Direct links to another org's resources work when the user is a member; otherwise 404 page "Not found or no access".

### 13.4 Project creation
1. "New project" (sidebar, ⌘K or empty state) → dialog: name, key (auto), team (optional), visibility, dates, priority, description.
2. API checks the plan guard, creates the project with default statuses and PM membership, emits `project:created`.
3. App opens the Board view with a guided empty state (add first task, customize columns, invite members).

### 13.5 Task lifecycle with real-time collaboration
1. Contributor presses `C` on the board (or "+" in a column) → quick-create card (title, Enter to save; `⌘Enter` opens full editor).
2. API creates `NEX-n`, logs, emits `task:created`; everyone in the project room sees the card appear.
3. Assign via avatar picker → TASK_ASSIGNED notification (in-app live + email per preference).
4. Assignee drags to In Progress → `task:moved`; works; attaches a screenshot; comments "@Rohan ready for review" → MENTIONED to Rohan.
5. Rohan drags to In Review → reviews → moves to Done → `completedAt` set; parent subtask counter updates; automation recipe (Post-MVP) notifies the PM; dashboard tiles reflect the change on next load (≤ 60 s cache).

### 13.6 Mention → notification → email
1. Comment with a mention is posted → API validates membership, creates the comment, emits `comment:created`, creates MENTIONED notification, emits `notification:new`, enqueues email if enabled.
2. Worker renders the email ("Dev mentioned you in NEX-42") with a deep link; the link opens the task detail with the comment highlighted and marks the notification read.

### 13.7 File upload
1. User drops a file on the task → client requests a signature → API validates target, type, size and quota, creates a PENDING attachment.
2. Browser uploads to Cloudinary with progress; on completion the client confirms; API verifies via Admin API and marks READY; `attachment:created` updates other viewers; thumbnails load via signed URLs.
3. Failure at any step shows a toast with retry; PENDING rows are cleaned up by the hourly job.

### 13.8 Plan limit reached
1. A FREE org with 5 members invites a 6th → API returns 402 `PLAN_LIMIT_REACHED { limit: 'maxMembers', current: 5, max: 5 }`.
2. UI shows an "Upgrade to PRO" dialog with the specific limit, a comparison and a link to Billing (OWNER) or "Ask your owner to upgrade" (others). Nothing is created.

### 13.9 Subscription checkout → webhook → unlock (Phase 9)
1. OWNER picks PRO monthly → API creates the Razorpay subscription → Checkout.js opens.
2. Payment succeeds → client calls verify (signature OK) → UI shows "Activating…" and subscribes to `billing:updated`.
3. Razorpay sends `subscription.activated` → API verifies signature, stores the event, updates the subscription, notifies, emits.
4. UI unlocks PRO limits; a BILLING_EVENT notification and a receipt email are sent. If no webhook arrives within 2 minutes the UI offers "Refresh status" which triggers a server-side fetch of the subscription from Razorpay (reconciliation).

### 13.10 Downgrade and cancellation (Phase 9)
1. OWNER requests a downgrade → API compares usage with target limits → 409 with a checklist if over limits, else schedules the change at cycle end and shows the effective date.
2. Cancellation sets cancel-at-cycle-end; the billing page shows "Reverts to FREE on <date>"; at period end the reconciliation job applies FREE rules (read-only excess projects).

### 13.11 Automation run (Phase 10)
1. PM creates "When status → Done, notify PMs" from a recipe; dry run against NEX-42 shows "Would notify: Rohan".
2. A task completes → `task.completed` event → job → evaluator matches → NOTIFY action → execution log SUCCESS.

### 13.12 AI task breakdown (Phase 11)
1. Contributor opens NEX-50 and clicks "Suggest subtasks" → consent notice (first time) → request with title/description.
2. Provider returns JSON → validated → preview list with checkboxes and editable titles/estimates → "Create 6 subtasks" → tasks created with reporter = actor; usage recorded.

### 13.13 Password reset
1. `/forgot-password` → email → generic confirmation.
2. Link `/reset-password?token=…` → new password twice → API resets, revokes all sessions, emails confirmation → user logs in.

### 13.14 Account deletion
1. Settings → Security → "Delete account" → re-authenticate → list of blocking organizations (sole OWNER) if any.
2. Confirm by typing "DELETE" → API scrubs PII, revokes sessions, removes memberships → redirect to `/goodbye`.

---

## 14. UI/UX Requirements

### 14.1 Application shell
- **Left sidebar** (240 px, collapsible to 64 px icons, drawer on < 768 px): workspace switcher (org logo, workspace name, plan badge) → primary nav: Home, My Tasks, Inbox (unread badge), Projects (favorites + recent, "All projects"), Teams, Insights (dashboard) → bottom: Settings, Help, user avatar menu (profile, theme, log out).
- **Top bar**: breadcrumbs (Workspace / Project / View), global search trigger (⌘K), "New" button (task, project, team, invite), notifications bell (opens Inbox popover), presence avatars on project pages.
- **Content area**: page header (title, actions, view tabs: Board · List · Calendar · Timeline · Overview), filter bar, content.
- **Task detail**: opens as a right-side panel (720 px) over the board/list keeping context; full-page route `/tasks/:key` also works for deep links; sections: title, properties grid (status, priority, assignees, dates, estimate/actual, labels, milestone, parent), description, subtasks, dependencies, attachments, activity + comments tabs.
- **Dialogs** for create flows; **Sheets** for settings on mobile; **Command palette** (`cmdk`) for navigation, create actions and search.

### 14.2 Route map

| Route | Page | Access |
|---|---|---|
| `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/invite/:token`, `/pricing`, `/goodbye` | Public/auth pages | Public |
| `/onboarding` | Create first organization | Verified user |
| `/` | Redirect to last workspace | Auth |
| `/:org/:ws/home` | Home (My Focus: due today/this week, assigned, mentions, recent projects) | Workspace access |
| `/:org/:ws/my-tasks` | My Tasks across projects | Auth |
| `/:org/:ws/inbox` | Notifications | Auth |
| `/:org/:ws/projects` | Project list/grid with filters | Workspace access |
| `/:org/:ws/projects/:key/(board\|list\|calendar\|timeline\|overview\|settings)` | Project views | Project access |
| `/:org/:ws/tasks/:taskKey` | Task detail full page | Project access |
| `/:org/:ws/teams`, `/:org/:ws/teams/:slug` | Teams | Workspace members |
| `/:org/:ws/insights` | Workspace dashboard | Workspace members |
| `/:org/:ws/search?q=` | Search results | Auth |
| `/:org/settings/profile`, `/notifications`, `/security` | User settings | Auth |
| `/:org/settings/org/(general\|members\|invitations\|teams\|projects\|permissions\|billing\|usage\|audit\|automations\|ai)` | Org admin | OWNER/ADMIN (billing: OWNER) |
| `/:org/:ws/settings` | Workspace settings (general, members, labels, branding) | WORKSPACE_ADMIN |

### 14.3 Design system
- **Typography**: Inter (variable), sizes 12/13/14/16/20/24/30 px, line-height 1.5, tabular numerals in tables.
- **Spacing**: 4 px base, 8 px grid; page gutters 24 px desktop, 16 px mobile.
- **Radius**: 6 px controls, 10 px cards, 14 px dialogs. **Shadows**: `sm` for cards, `md` for popovers, `lg` for dialogs; no heavy drop shadows.
- **Color tokens (CSS variables, light default)**: `--background #FFFFFF`, `--surface #F8FAFC`, `--border #E2E8F0`, `--text #0F172A`, `--muted #64748B`, `--primary #4F46E5` (indigo-600) with hover `#4338CA`, `--success #16A34A`, `--warning #D97706`, `--danger #DC2626`, `--info #2563EB`. Dark theme overrides via `.dark` class on `<html>` (`--background #0B1220`, `--surface #111827`, `--border #1F2937`, `--text #E5E7EB`, `--primary #818CF8`). Theme choice: system / light / dark, persisted in `localStorage`.
- **Semantic colors**: priority LOW grey, MEDIUM blue, HIGH orange, URGENT red; status categories BACKLOG grey, TODO blue, IN_PROGRESS indigo, IN_REVIEW violet, BLOCKED red, DONE green (user-customizable per status).
- **Motion**: 150–200 ms ease-out transitions; drag overlays with slight scale and shadow; `prefers-reduced-motion` respected.
- **Components (shadcn/ui + Radix)**: Button, Input, Textarea, Select, Combobox (cmdk), Dialog, Sheet, Popover, DropdownMenu, ContextMenu, Tooltip, Tabs, Badge, Avatar + AvatarGroup, Checkbox, Switch, RadioGroup, Calendar/DatePicker, Table, Skeleton, Toast (sonner), Progress, Separator, ScrollArea, Command. Custom: KanbanBoard/Column/Card, TaskRow, PriorityIcon, StatusBadge, LabelChip, UserPicker, DateRangePicker, RichTextEditor (Tiptap), FileDropzone, EmptyState, StatTile, ChartCard.

### 14.4 States and feedback
- **Loading**: route-level skeletons matching layout (board columns with 3 ghost cards; table rows; dashboard tiles); inline spinners only inside buttons.
- **Empty states**: illustration + one-line explanation + primary action (e.g., "No tasks yet — Create your first task or import"); distinct copy for filtered-empty ("No tasks match these filters — Clear filters").
- **Errors**: field-level validation (React Hook Form + Zod, same schemas as the API), toast for action failures with retry, full-page error boundary with "Reload" and error id, 404 page, offline banner when the socket is disconnected > 5 s.
- **Optimistic UI**: task moves, status/priority/assignee changes, reactions, read/unread; rollback with toast on failure.
- **Confirmation**: destructive actions use a dialog; organization/project deletion require typing the name/slug; undo toast (5 s) for task deletion and bulk changes.

### 14.5 Responsiveness
- Breakpoints: `sm 640`, `md 768`, `lg 1024`, `xl 1280`. < 768: sidebar drawer, single-column pages, Kanban horizontally scrollable with snap, task detail full-screen sheet, List becomes card list with key fields, Calendar week view only, Timeline read-only summary; 768–1024: collapsed icon sidebar, two-column dashboards; ≥ 1024: full layout.
- Touch targets ≥ 44 px; drag-and-drop with touch sensor and long-press (250 ms).

### 14.6 Accessibility
- Semantic landmarks, skip link, visible focus rings, `aria-live` for toasts and board announcements ("Moved NEX-42 to In Review"), dialogs trap focus and restore it, all icons have labels, color never the only indicator (priority icons + text), contrast ≥ 4.5:1, keyboard shortcuts documented (`?` opens the cheat sheet: `C` create task, `/` search, `G then B` board, `E` edit, `⌘Enter` submit).

### 14.7 Performance budget (frontend)
- Route-based code splitting; charts, Tiptap, calendar and Gantt lazy-loaded; images via Cloudinary `f_auto,q_auto` with explicit dimensions; TanStack Query `staleTime` 30 s with socket-driven invalidation; virtualization for lists > 50 rows; avoid layout shift (reserved skeleton heights).

---

## 15. System Architecture

### 15.1 Component overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Browser (React + Vite SPA)  ── same origin, served by the API service       │
│  TanStack Query · Zustand · Socket.io client · Razorpay Checkout.js          │
└───────────────┬───────────────────────────────┬──────────────────────────────┘
                │ HTTPS /api/v1 (cookie auth)   │ WSS /socket.io (cookie auth)
┌───────────────▼───────────────────────────────▼──────────────────────────────┐
│  API service (Node 24 + Express + TS) ── <app>.onrender.com (Render free)     │
│  ├─ middleware: requestId · pino-http · helmet · cors · rateLimit · session    │
│  │              tenant(orgSlug) · authorize(permission) · validate(zod)        │
│  ├─ modules: auth users orgs members invitations workspaces teams projects    │
│  │           statuses labels milestones tasks comments attachments            │
│  │           notifications search analytics activity billing automations ai  │
│  │           (routes → controllers → services → repositories)                 │
│  ├─ EventBus (in-process) → Socket gateway (rooms) + Job enqueuer             │
│  ├─ Workers (pg-boss, same process in MVP): email · reminders · cleanup ·      │
│  │           storage.destroy · automation.evaluate · ai.weekly-report ·        │
│  │           billing.reconcile · purge                                         │
│  └─ lib: prisma · storage(Cloudinary) · payments(Razorpay) · mail · ai        │
└───────┬───────────────┬──────────────┬──────────────┬──────────────┬─────────┘
        │               │              │              │              │
 ┌──────▼──────┐ ┌──────▼──────┐ ┌─────▼─────┐ ┌──────▼──────┐ ┌─────▼─────┐
 │ PostgreSQL  │ │ Cloudinary  │ │ Razorpay  │ │ Email API   │ │ LLM API   │
 │ (Neon free) │ │ (files)     │ │ (test)    │ │ (Brevo)     │ │ (Gemini)  │
 └─────────────┘ └─────────────┘ └───────────┘ └─────────────┘ └───────────┘
        ▲ webhooks: Razorpay → /billing/webhooks/razorpay (signature verified)
```

### 15.2 Monorepo layout

```
nexusflow/
├─ apps/
│  ├─ web/                      # React + Vite + TS + Tailwind + shadcn/ui
│  │  └─ src/
│  │     ├─ app/                # router.tsx, providers.tsx, layouts/
│  │     ├─ features/<feature>/ # api/ (query hooks), components/, pages/, store/
│  │     ├─ components/ui/      # shadcn primitives
│  │     ├─ components/common/  # EmptyState, StatTile, UserAvatar, …
│  │     ├─ lib/                # apiClient.ts, socket.ts, queryClient.ts, utils
│  │     ├─ stores/             # zustand: session, ui (theme, sidebar), workspace
│  │     └─ hooks/, styles/, types/
│  └─ api/                      # Express + TS + Prisma + Socket.io
│     ├─ prisma/                # schema.prisma, migrations/, seed.ts
│     ├─ src/
│     │  ├─ config/             # env.ts (zod-validated), constants.ts
│     │  ├─ app.ts, server.ts   # express app factory; http + socket bootstrap
│     │  ├─ middleware/         # auth, tenant, authorize, validate, rateLimit, errorHandler, requestId
│     │  ├─ modules/<module>/   # <m>.routes.ts, <m>.controller.ts, <m>.service.ts, <m>.repository.ts, <m>.schemas.ts, <m>.events.ts, <m>.test.ts
│     │  ├─ sockets/            # gateway.ts (auth, rooms), emitters.ts
│     │  ├─ jobs/               # queue.ts (pg-boss), handlers/*.job.ts, schedules.ts
│     │  ├─ lib/                # prisma.ts (+ tenant extension), logger.ts, mail/, storage/, payments/, ai/, eventBus.ts
│     │  ├─ utils/              # errors.ts, response.ts, pagination.ts, crypto.ts
│     │  └─ types/
│     └─ tests/                 # integration/, fixtures/, setup.ts
├─ packages/
│  ├─ shared/                   # zod schemas, DTO types, enums, plans.ts, permissions.ts, analytics constants
│  (eslint, prettier and tsconfig presets live in the repository root: eslint.config.mjs, .prettierrc.json, tsconfig.base.json)
├─ e2e/                         # Playwright specs
├─ .github/workflows/ci.yml
├─ .env.example                 # documents every variable; the real .env is never committed
├─ pnpm-workspace.yaml, package.json, turbo.json (optional)
└─ PRD.md
```

### 15.3 Request lifecycle (HTTP)
1. `requestId` → `pino-http` log → `helmet` → `cors` (allowlist) → JSON body parser (1 MB; raw body for webhook route) → cookie parser.
2. `rateLimit` (keyed by user id when authenticated, else IP).
3. `auth`: read `nf_session`, look up the session (hash), load the user (cached 60 s), attach `req.user`; `requireAuth` on protected routes; `requireVerified` on tenant routes.
4. `tenant`: resolve `:orgSlug` → organization + membership → `req.tenant = { org, membership, plan }`; 404 when absent.
5. `authorize('<permission>')`: resolves the `PermissionContext` (§12.4) for the target resource (`:workspaceSlug`, `:projectKey`, `:taskId` loaded by param middleware with tenant scoping).
6. The handler calls `validateRequest(req, { params, query, body })`, which parses each part with shared Zod schemas, strips unknown fields, and returns typed values or throws one 400 `VALIDATION_ERROR` listing every problem. (A helper instead of middleware, because Express 5 makes `req.query` read-only and the helper keeps full typing.) Query booleans use `z.stringbool()`, never `z.coerce.boolean()`.
7. Controller → service (business rules, plan guard, transactions) → repository (Prisma, always scoped by `organizationId`) → service publishes domain events after commit → controller responds with the envelope.
8. `errorHandler` maps `AppError` subclasses to HTTP codes, logs with request id, never leaks stack traces in production.

### 15.4 Real-time, jobs and events
- `EventBus` (typed emitter) is the single integration point: services publish `{ type, orgId, payload }` after commit; the socket gateway maps events to rooms (§18.9); the job enqueuer persists events that require async work (`email.*`, `automation.evaluate`); handlers are idempotent (job keys like `notification:<id>`).
- pg-boss runs inside the API process (`WORKERS_ENABLED=true`), which fits the single free Render service. On paid hosting the same code could run as a separate worker with `HTTP_ENABLED=false`. Because the free service sleeps, schedules catch up on startup (§26.1). Scheduled jobs: reminders hourly, cleanup hourly, purge daily 03:00 UTC, billing reconcile daily, weekly reports Monday 08:00 org time (Phase 11).
- Socket.io scales horizontally only with the Redis adapter; this is deferred until a second API instance is needed (§26.7).

### 15.5 Tenant isolation layers
See §20 — URL tenant context, membership-gated middleware, Prisma tenant extension, scoped sockets, scoped storage paths, scoped search CTE, and optional Postgres RLS.

### 15.6 Frontend architecture
- Data: TanStack Query for all server state (query keys namespaced by org/workspace/project); Zustand for session, UI and ephemeral board state; no global Redux.
- API client: `fetch` wrapper with `credentials: 'include'`, envelope unwrapping, `AppError` typing, 401 → redirect to login, 402 → plan-limit dialog, 409 version conflict → refetch + toast.
- Forms: React Hook Form + Zod resolvers with schemas imported from `@nexusflow/shared`.
- Sockets: one connection per tab; `useRoom(type, id)` hook joins/leaves with ref counting; event handlers update caches.
- Routing: React Router v6 data routers with lazy routes and loaders only for tenant context.

---

## 16. Technology Stack

| Layer | Choice | Notes / rationale |
|---|---|---|
| Language | TypeScript 5.x (strict) everywhere | Shared types and Zod schemas between web and api |
| Package manager / monorepo | pnpm workspaces (+ Turborepo optional for caching) | Single install, shared package |
| Frontend framework | React 19, Vite 8 | Fast dev server; the built SPA is served by the Express API on the same origin |
| Styling / components | Tailwind CSS 4 (CSS-first config: tokens in `apps/web/src/styles/index.css`, `@tailwindcss/vite` plugin), shadcn/ui (Radix primitives), lucide-react icons, `class-variance-authority`, `tailwind-merge` | Premium, consistent, accessible primitives |
| Routing | React Router 6.2x (data APIs) | Nested layouts per org/workspace |
| Server state | TanStack Query 5 | Caching, optimistic updates, socket invalidation |
| Client state | Zustand 4 | Session, UI, board interactions |
| Forms / validation | React Hook Form 7 + Zod 3 (shared schemas) | Same rules client and server |
| Drag-and-drop | `@dnd-kit/core` + `@dnd-kit/sortable` | Keyboard and touch sensors, performant |
| Tables / virtualization | TanStack Table 8 + TanStack Virtual 3 | List view |
| Rich text | Tiptap 3 (StarterKit, which includes Link, plus Placeholder; Mention arrives with comments in Phase 6) | JSON storage, mentions. Version 3 is current; the PRD said 2 (changed in Phase 5, approved by the developer) |
| Charts | Recharts 2 | Dashboard charts |
| Dates | Own small helpers in `packages/shared/src/dates.ts` plus the browser's `Intl` (instead of `date-fns`, decided in Phase 5) | Due dates are plain `YYYY-MM-DD` text, so adding days and comparing needs no library; only "today" depends on the person's time zone |
| Calendar | Custom month/week grid built on the date helpers above (no heavy dependency) | Fits design system; drag via dnd-kit |
| Gantt (Phase 5b) | Custom SVG/Canvas timeline (A-12 evaluates `gantt-task-react` as an alternative) | Dependency arrows, virtualization |
| Command palette | `cmdk` | ⌘K. Moved from Phase 5 to Phase 8, where global search is built; until then Ctrl+K opens the search page |
| Toasts | `sonner` | |
| Backend framework | Node.js 24 LTS, Express 5 | Node runs the API's TypeScript directly through built-in type stripping, so the API has no build step; Express 5 forwards errors from async handlers automatically |
| ORM / DB | Prisma 7 ORM (`prisma-client` generator, `@prisma/adapter-pg` driver adapter, `prisma.config.ts`), PostgreSQL 16 | Migrations, typed client, raw SQL for analytics; the generated client is TypeScript that Node runs directly |
| Real-time | Socket.io 4 (server and client) | Rooms, reconnection, fallback |
| Background jobs | `pg-boss` 9 | Postgres-backed queue and cron; no Redis in MVP |
| Validation | Zod | Request validation middleware |
| Auth | Argon2 (`argon2`), opaque sessions, `cookie-parser`, Google OAuth via `openid-client` (PKCE) | No JWT in MVP (revocable sessions) |
| Security | `helmet`, `express-rate-limit`, `cors`, DOMPurify (server-side via `isomorphic-dompurify` for any HTML export), `zod` | §21 |
| Logging | `pino`, `pino-http`; Sentry SDK optional | Structured JSON logs |
| Email | Brevo transactional HTTP API (free plan) + React Email templates; a console mail provider prints emails to the terminal in development | Free, no domain needed; an HTTP API avoids SMTP port restrictions on free hosting |
| Storage | Cloudinary Node SDK (`cloudinary` v2) behind `StorageProvider` | Signed uploads, authenticated delivery |
| Payments | Razorpay Node SDK (`razorpay`) behind `PaymentProvider` | Subscriptions, webhooks |
| AI | Gemini API free tier as the default `AiProvider` adapter; OpenAI and Anthropic adapters optional | Phase 11; free key from Google AI Studio |
| Search | PostgreSQL FTS (`tsvector`, GIN) + `pg_trgm` | No external search engine |
| Testing | Vitest 2 (unit + integration), Supertest, `socket.io-client`, Playwright 1.4x, `@axe-core/playwright`, MSW/`nock` for third-party HTTP | Vitest chosen over Jest for Vite alignment and speed |
| Lint / format | ESLint 9 (typescript-eslint, react-hooks, jsx-a11y), Prettier 3 | Shared presets |
| CI/CD | GitHub Actions (free on a public repository); Render auto-deploy from `main` | §26 |
| Hosting | One Render free Web Service serving the SPA, API and Socket.io; Neon free PostgreSQL | US East (Ohio) region for both, so the app and database stay close; zero cost (§26.1) |
| Local dev | No Docker: a free Neon `dev` branch as the database, console mail provider, `.env.example`, Vite proxy `/api` → `localhost:4000` | Nothing to install besides Node and pnpm; needs internet; same-origin cookies locally |

---

## 17. Database Schema and ERD Description

PostgreSQL 16 via Prisma. All ids are `uuid` (v7 generated in the application for index locality, A-14). All timestamps are `timestamptz`; `date` is used for calendar dates. Extensions required: `citext`, `pg_trgm`. Deviations from the entity list in the request are explained in §17.6.

### 17.1 ERD (text form)

```
User 1──* OAuthAccount          User 1──* Session          User 1──* VerificationToken
User 1──* NotificationPreference                            User 1──* Notification

User *──* Organization        via OrganizationMember(role)
Organization 1──1 Subscription      Organization 1──1 BillingProfile
Organization 1──* Payment           Organization 1──* Invoice
Organization 1──* Invitation        Organization 1──* ActivityLog
Organization 1──* Workspace
   Workspace *──* User            via WorkspaceMember(role)
   Workspace 1──* Team            Team *──* User via TeamMember(role)
   Workspace 1──* Label
   Workspace 1──* Project         (Project *──1 Team optional)
      Project *──* User           via ProjectMember(role)
      Project 1──* TaskStatus     Project 1──* Milestone
      Project 1──* Task           Task *──1 TaskStatus, Task *──1 Milestone (optional)
         Task 1──* Task           (parentTaskId → subtasks, depth 1)
         Task *──* User           via TaskAssignee
         Task *──* Label          via TaskLabel
         Task *──* Task           via TaskDependency(blocking → blocked)
         Task 1──* Comment        Comment 1──* Comment (parentCommentId, depth 1)
                                  Comment 1──* CommentReaction
         Task 1──* Attachment     Comment 1──* Attachment     Project 1──* Attachment
Organization 1──* Automation 1──* AutomationExecution
Organization 1──* TaskTemplate     Organization 1──* AiUsage
WebhookEvent (global, provider-scoped)
```

### 17.2 Enums

```prisma
enum OrgRole            { OWNER ADMIN MEMBER GUEST }
enum MemberStatus       { ACTIVE SUSPENDED }
enum WorkspaceRole      { WORKSPACE_ADMIN WORKSPACE_MEMBER }
enum TeamRole           { LEAD MEMBER }
enum ProjectRole        { PROJECT_MANAGER CONTRIBUTOR VIEWER }
enum ProjectStatus      { PLANNING ACTIVE ON_HOLD COMPLETED ARCHIVED }
enum ProjectVisibility  { WORKSPACE PRIVATE }
enum Priority           { LOW MEDIUM HIGH URGENT }
enum StatusCategory     { BACKLOG TODO IN_PROGRESS IN_REVIEW BLOCKED DONE }
enum MilestoneStatus    { OPEN COMPLETED }
enum InvitationStatus   { PENDING ACCEPTED DECLINED REVOKED EXPIRED }
enum VerificationType   { EMAIL_VERIFY PASSWORD_RESET }
enum AttachmentStatus   { PENDING READY DELETED }
enum ResourceType       { IMAGE VIDEO RAW }
enum ActivityCategory   { DOMAIN SECURITY BILLING }
enum NotificationType   { TASK_ASSIGNED TASK_UNASSIGNED TASK_STATUS_CHANGED TASK_DUE_SOON TASK_OVERDUE
                          TASK_COMMENTED MENTIONED PROJECT_ADDED PROJECT_STATUS_CHANGED MILESTONE_DUE_SOON
                          ORG_INVITATION MEMBER_JOINED AUTOMATION_ALERT BILLING_EVENT }
enum PlanTier           { FREE PRO BUSINESS ENTERPRISE }
enum SubscriptionStatus { ACTIVE AUTHENTICATED INCOMPLETE PAST_DUE UNPAID PAUSED CANCELED }
enum BillingInterval    { MONTHLY YEARLY }
enum PaymentStatus      { PENDING SUCCEEDED FAILED REFUNDED }
enum InvoiceStatus      { ISSUED PAID PARTIALLY_PAID EXPIRED CANCELLED }
enum ExecutionStatus    { SUCCESS FAILED SKIPPED }
enum AiFeature          { TASK_DESCRIPTION TASK_BREAKDOWN PROJECT_PLAN PROJECT_SUMMARY MEETING_NOTES
                          INSIGHTS DEADLINE_SUGGESTION WEEKLY_REPORT }
```

### 17.3 Models

Notation: `field: type [constraints]`. `org` = `organizationId: uuid FK Organization ON DELETE CASCADE` (tenant column). Back-relations are implied. Every model has `createdAt timestamptz default now()`; models that change also have `updatedAt`.

**Identity**

| Model | Fields | Keys, indexes, rules |
|---|---|---|
| `User` | `id`, `email: citext`, `passwordHash: text?`, `name: varchar(80)`, `avatarUrl: text?`, `avatarPublicId: text?`, `timezone: varchar(64) default 'UTC'`, `emailVerifiedAt?`, `isPlatformAdmin: bool default false`, `lastActiveWorkspaceId: uuid?`, `deletedAt?` | `unique(email)`; soft delete scrubs PII (§11.1.7) |
| `OAuthAccount` | `id`, `userId FK User CASCADE`, `provider: varchar(20)`, `providerAccountId: varchar(255)`, `email: citext?` | `unique(provider, providerAccountId)`, `index(userId)` |
| `Session` | `id`, `userId FK User CASCADE`, `tokenHash: char(64)`, `userAgent: text?`, `ip: varchar(45)?`, `lastSeenAt`, `expiresAt`, `absoluteExpiresAt`, `revokedAt?` | `unique(tokenHash)`, `index(userId)`, `index(expiresAt)`; cleanup job deletes expired/revoked > 30 days |
| `VerificationToken` | `id`, `userId FK User CASCADE`, `type: VerificationType`, `tokenHash: char(64)`, `expiresAt`, `usedAt?` | `unique(tokenHash)`, `index(userId, type)` |
| `NotificationPreference` | `id`, `userId FK User CASCADE`, `type: NotificationType`, `inApp: bool`, `email: bool` | `unique(userId, type)` |

**Tenant core**

| Model | Fields | Keys, indexes, rules |
|---|---|---|
| `Organization` | `id`, `name: varchar(60)`, `slug: varchar(40)`, `slugHistory: text[] default '{}'`, `logoUrl?`, `logoPublicId?`, `ownerId FK User RESTRICT`, `settings: jsonb default '{}'` (permissions toggles, aiEnabled, reportTimezone), `storageUsedBytes: bigint default 0`, `deletedAt?`, `purgeAfter?` | `unique(slug)`; slug regex `^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$`; reserved slugs list (`api`, `admin`, `www`, `app`, `settings`, …) |
| `OrganizationMember` | `id`, org, `userId FK User CASCADE`, `role: OrgRole`, `status: MemberStatus default ACTIVE`, `invitedById: uuid?`, `joinedAt` | `unique(organizationId, userId)`, `index(userId)`, `index(organizationId, role)`; exactly one OWNER enforced in service + partial unique index `(organizationId) where role='OWNER'` |
| `Workspace` | `id`, org, `name: varchar(60)`, `slug: varchar(40)`, `description: text?`, `logoUrl?`, `logoPublicId?`, `accentColor: char(7)?`, `isDefault: bool default false`, `settings: jsonb`, `createdById: uuid`, `archivedAt?`, `deletedAt?` | `unique(organizationId, slug)`, `index(organizationId)`; partial unique `(organizationId) where isDefault` |
| `WorkspaceMember` | `id`, org, `workspaceId FK Workspace CASCADE`, `userId FK User CASCADE`, `role: WorkspaceRole` | `unique(workspaceId, userId)`, `index(userId)`, `index(organizationId, userId)` |
| `Team` | `id`, org, `workspaceId FK Workspace CASCADE`, `name: varchar(60)`, `slug: varchar(40)`, `description: text?`, `deletedAt?` | `unique(workspaceId, slug)`, `index(organizationId)` |
| `TeamMember` | `id`, org, `teamId FK Team CASCADE`, `userId FK User CASCADE`, `role: TeamRole` | `unique(teamId, userId)`, `index(userId)` |
| `Invitation` | `id`, org, `workspaceId FK Workspace SET NULL?`, `email: citext`, `role: OrgRole` (not OWNER), `projectIds: uuid[] default '{}'`, `tokenHash: char(64)`, `status: InvitationStatus default PENDING`, `invitedById FK User RESTRICT`, `expiresAt`, `acceptedAt?`, `acceptedByUserId: uuid?` | `unique(tokenHash)`, `index(organizationId, status)`, `index(email)`; partial unique `(organizationId, email) where status='PENDING'` (raw SQL migration) |

**Projects and tasks**

| Model | Fields | Keys, indexes, rules |
|---|---|---|
| `Project` | `id`, org, `workspaceId FK Workspace CASCADE`, `teamId FK Team SET NULL?`, `key: varchar(6)`, `name: varchar(100)`, `description: jsonb?`, `descriptionText: text?`, `coverImageUrl?`, `coverPublicId?`, `status: ProjectStatus default PLANNING`, `previousStatus: ProjectStatus?`, `priority: Priority default MEDIUM`, `visibility: ProjectVisibility default WORKSPACE`, `ownerId FK User RESTRICT`, `startDate: date?`, `endDate: date?`, `taskSequence: int default 0`, `isReadOnly: bool default false`, `completedAt?`, `archivedAt?`, `createdById: uuid`, `deletedAt?`, `searchVector: tsvector` (generated: name A, key A, descriptionText C) | `unique(workspaceId, key)`, `index(organizationId, status)`, `index(workspaceId, status, deletedAt)`, `index(teamId)`, `GIN(searchVector)`, `GIN trgm(name)`; `check(endDate IS NULL OR startDate IS NULL OR endDate >= startDate)` |
| `ProjectMember` | `id`, org, `projectId FK Project CASCADE`, `userId FK User CASCADE`, `role: ProjectRole`, `addedById: uuid?` | `unique(projectId, userId)`, `index(userId, organizationId)` |
| `TaskStatus` | `id`, org, `projectId FK Project CASCADE`, `name: varchar(40)`, `color: char(7)`, `category: StatusCategory`, `position: int`, `isDefault: bool default false` | `unique(projectId, name)`, `index(projectId, position)`; partial unique `(projectId) where isDefault`; ≤ 50 per project (service) |
| `Label` | `id`, org, `workspaceId FK Workspace CASCADE`, `name: varchar(40)`, `color: char(7)` | `unique(workspaceId, name)`; ≤ 100 per workspace |
| `Milestone` | `id`, org, `projectId FK Project CASCADE`, `name: varchar(100)`, `description: text?`, `dueDate: date?`, `status: MilestoneStatus default OPEN`, `position: int`, `completedAt?` | `index(projectId, position)`, `index(projectId, dueDate)` |
| `Task` | `id`, org, `projectId FK Project CASCADE`, `number: int`, `title: varchar(200)`, `description: jsonb?`, `descriptionText: text?`, `statusId FK TaskStatus RESTRICT`, `priority: Priority default MEDIUM`, `reporterId FK User RESTRICT`, `parentTaskId FK Task CASCADE?`, `milestoneId FK Milestone SET NULL?`, `startDate: date?`, `dueDate: date?`, `estimatedHours: decimal(7,2)?`, `actualHours: decimal(7,2)?`, `position: varchar(64)`, `version: int default 1`, `completedAt?`, `dueSoonNotifiedAt?`, `overdueNotifiedAt?`, `recurrenceRule: text?` (Post-MVP), `recurrenceParentId: uuid?`, `templateId: uuid?`, `createdById: uuid`, `deletedAt?`, `searchVector: tsvector` (generated: title A, descriptionText C) | `unique(projectId, number)`, `index(projectId, statusId, position)`, `index(projectId, deletedAt)`, `index(organizationId, dueDate)`, `index(organizationId, completedAt)`, `index(parentTaskId)`, `index(milestoneId)`, `index(reporterId)`, `GIN(searchVector)`, `GIN trgm(title)`; `check(dueDate IS NULL OR startDate IS NULL OR dueDate >= startDate)`, `check(estimatedHours >= 0)`, `check(actualHours >= 0)` |
| `TaskAssignee` | `id`, org, `taskId FK Task CASCADE`, `userId FK User CASCADE`, `assignedById: uuid?` | `unique(taskId, userId)`, `index(userId, organizationId)` |
| `TaskLabel` | `taskId FK Task CASCADE`, `labelId FK Label CASCADE` | `pk(taskId, labelId)`, `index(labelId)` |
| `TaskDependency` | `id`, org, `blockingTaskId FK Task CASCADE`, `blockedTaskId FK Task CASCADE`, `createdById: uuid` | `unique(blockingTaskId, blockedTaskId)`, `index(blockedTaskId)`, `check(blockingTaskId <> blockedTaskId)`; cycle check in service |
| `TaskTemplate` (Post-MVP) | `id`, org, `workspaceId FK Workspace CASCADE`, `projectId FK Project CASCADE?`, `name: varchar(100)`, `data: jsonb` (title, description, priority, labelIds, estimatedHours, subtasks[]), `createdById` | `unique(workspaceId, name)` |

**Collaboration**

| Model | Fields | Keys, indexes, rules |
|---|---|---|
| `Comment` | `id`, org, `taskId FK Task CASCADE?`, `projectId FK Project CASCADE?`, `parentCommentId FK Comment CASCADE?`, `authorId FK User RESTRICT`, `body: jsonb`, `bodyText: text`, `editedAt?`, `deletedAt?`, `searchVector: tsvector` (bodyText B) | `index(taskId, createdAt)`, `index(projectId, createdAt)`, `index(parentCommentId)`, `GIN(searchVector)`; `check((taskId IS NOT NULL)::int + (projectId IS NOT NULL)::int = 1)`; replies inherit `taskId/projectId` from the parent |
| `CommentReaction` | `id`, `commentId FK Comment CASCADE`, `userId FK User CASCADE`, `emoji: varchar(32)` | `unique(commentId, userId, emoji)` |
| `Attachment` | `id`, org, `taskId FK Task CASCADE?`, `commentId FK Comment CASCADE?`, `projectId FK Project CASCADE?`, `uploaderId FK User RESTRICT`, `originalName: varchar(255)`, `mimeType: varchar(127)`, `bytes: bigint`, `resourceType: ResourceType`, `publicId: text`, `format: varchar(16)?`, `width: int?`, `height: int?`, `cloudinaryVersion: varchar(32)?`, `status: AttachmentStatus default PENDING`, `readyAt?`, `deletedAt?` | `unique(publicId)`, `index(taskId)`, `index(commentId)`, `index(organizationId, status, createdAt)`; `check(at least one target OR purpose = avatar/cover)` via `purpose: varchar(16) default 'attachment'` |
| `Notification` | `id`, `organizationId: uuid? FK CASCADE`, `userId FK User CASCADE`, `type: NotificationType`, `title: varchar(200)`, `body: text?`, `data: jsonb` (`{ orgSlug, workspaceSlug, projectKey, taskKey, commentId, url }`), `readAt?` | `index(userId, readAt, createdAt desc)`, `index(userId, createdAt desc)`; retention 180 days (job) |
| `ActivityLog` | `id`, `organizationId: uuid? FK Organization CASCADE` (null only for SECURITY rows without a tenant, e.g. login events — A-23), `workspaceId: uuid?`, `projectId: uuid?`, `taskId: uuid?`, `actorId: uuid?` (null = system/automation), `category: ActivityCategory`, `action: varchar(64)` (e.g. `task.created`, `task.updated`, `task.moved`, `comment.created`, `member.role_changed`, `auth.login`, `billing.subscription_activated`), `entityType: varchar(32)`, `entityId: uuid`, `changes: jsonb?` (`[{ field, from, to }]`), `metadata: jsonb?`, `ip: varchar(45)?` | `index(organizationId, createdAt desc)`, `index(projectId, createdAt desc)`, `index(taskId, createdAt desc)`, `index(organizationId, category, createdAt desc)`, `index(actorId, createdAt desc)`; append-only (no updates); monthly partitioning considered Post-MVP |

**Billing**

| Model | Fields | Keys, indexes, rules |
|---|---|---|
| `Subscription` | `id`, org, `planTier: PlanTier default FREE`, `status: SubscriptionStatus default ACTIVE`, `interval: BillingInterval?`, `provider: varchar(20)?` ('razorpay'), `providerCustomerId: varchar(64)?`, `providerSubscriptionId: varchar(64)?`, `providerPlanId: varchar(64)?`, `currentPeriodStart?`, `currentPeriodEnd?`, `cancelAtPeriodEnd: bool default false`, `canceledAt?`, `scheduledPlanTier: PlanTier?`, `scheduledInterval: BillingInterval?`, `trialEndsAt?`, `metadata: jsonb` | `unique(organizationId)`, `unique(providerSubscriptionId)` |
| `BillingProfile` | `id`, org, `legalName: varchar(120)`, `email: citext`, `addressLine1`, `addressLine2?`, `city`, `state`, `postalCode`, `country: char(2) default 'IN'`, `gstin: varchar(15)?` | `unique(organizationId)` |
| `Payment` | `id`, org, `subscriptionId FK Subscription SET NULL?`, `invoiceId FK Invoice SET NULL?`, `provider`, `providerPaymentId: varchar(64)`, `amount: int` (minor units, paise), `currency: char(3) default 'INR'`, `status: PaymentStatus`, `method: varchar(32)?`, `failureReason: text?`, `paidAt?`, `rawPayload: jsonb?` | `unique(providerPaymentId)`, `index(organizationId, createdAt desc)` |
| `Invoice` | `id`, org, `subscriptionId?`, `provider`, `providerInvoiceId: varchar(64)`, `number: varchar(64)?`, `amountDue: int`, `amountPaid: int`, `currency: char(3)`, `status: InvoiceStatus`, `periodStart?`, `periodEnd?`, `issuedAt?`, `paidAt?`, `hostedUrl: text?`, `pdfUrl: text?` | `unique(providerInvoiceId)`, `index(organizationId, issuedAt desc)` |
| `WebhookEvent` | `id`, `provider: varchar(20)`, `providerEventId: varchar(128)`, `type: varchar(64)`, `payload: jsonb`, `receivedAt`, `processedAt?`, `error: text?`, `attempts: int default 0` | `unique(provider, providerEventId)`, partial `index(receivedAt) where processedAt is null` |
| `SalesLead` (Post-MVP) | `id`, `email: citext`, `name`, `company`, `message: text`, `source` | `index(createdAt)` |

**Automation and AI (Post-MVP)**

| Model | Fields | Keys, indexes, rules |
|---|---|---|
| `Automation` | `id`, org, `workspaceId FK Workspace CASCADE`, `projectId FK Project CASCADE?`, `name: varchar(100)`, `description: text?`, `isEnabled: bool default true`, `trigger: jsonb`, `conditions: jsonb default '[]'`, `actions: jsonb`, `createdById`, `lastRunAt?`, `runCount: int default 0`, `consecutiveFailures: int default 0`, `deletedAt?` | `index(organizationId, isEnabled)`, `index(workspaceId)`, `index(projectId)`; JSON validated by Zod schemas in `@nexusflow/shared` |
| `AutomationExecution` | `id`, org, `automationId FK Automation CASCADE`, `triggerEvent: jsonb`, `status: ExecutionStatus`, `result: jsonb?`, `error: text?`, `startedAt`, `finishedAt?` | `index(automationId, startedAt desc)`, `index(organizationId, startedAt desc)`; retention 90 days |
| `AiUsage` | `id`, org, `userId: uuid?`, `feature: AiFeature`, `provider: varchar(20)`, `model: varchar(64)`, `promptTokens: int`, `completionTokens: int`, `latencyMs: int`, `status: varchar(16)`, `error: text?` | `index(organizationId, createdAt desc)` |

### 17.4 Cascade and deletion rules

| Event | Behavior |
|---|---|
| Organization delete | Soft delete + `purgeAfter = now + 7 days`; purge job hard-deletes the organization row → DB cascades to all tenant rows; Cloudinary folder `orgs/{orgId}` destroyed by prefix; Razorpay subscription cancelled first |
| Workspace delete | Soft delete; purge job after 30 days cascades projects, teams, labels |
| Project delete | Soft delete (`deletedAt`), Trash for 30 days, then hard delete cascades statuses, milestones, tasks, members, comments, attachments (destroy jobs) |
| Task delete | Soft delete; subtasks soft-deleted together; dependencies and labels removed immediately; hard delete after 30 days cascades assignees, comments, attachments |
| Team delete | Projects re-pointed (`teamId = null`) or archived first, then team row deleted (team members cascade) |
| Member removal | `OrganizationMember` row deleted → service first deletes `WorkspaceMember`, `TeamMember`, `ProjectMember`, `TaskAssignee` rows for that user in the org and logs the action; authored content stays |
| User account deletion | Soft delete + scrub; sessions, OAuth accounts, verification tokens, preferences deleted; memberships removed as above in every org |
| TaskStatus delete | Service moves tasks to the chosen target status first (FK RESTRICT prevents orphans) |
| Milestone delete | `Task.milestoneId` set null |
| Attachment delete | Soft delete, storage counter decremented, Cloudinary destroy job; hard delete with parent purge |

### 17.5 Tenant isolation at the schema level
- Every tenant table has `organizationId` (indexed, first column of composite indexes where filtering by org is common).
- A Prisma client extension adds `where: { organizationId }` to `findMany/findFirst/count/aggregate/updateMany/deleteMany` on tenant models and injects `organizationId` on create (§20.3).
- Optional Phase 12 hardening: `ALTER TABLE … ENABLE ROW LEVEL SECURITY` with policy `organization_id = current_setting('app.current_org')::uuid` and `SET LOCAL app.current_org` per transaction.

### 17.6 Deviations from the entity list in the request

| Requested entity | Decision | Rationale |
|---|---|---|
| `Subtask` | `Task.parentTaskId` self-relation | Subtasks need assignees, dates, comments and activity; a separate table would duplicate the task model |
| `TaskComment` | Generic `Comment` with `taskId` or `projectId` | Reused for project discussions (Post-MVP) and threads without a second comment table |
| `TaskAttachment` | Generic `Attachment` with optional targets and `purpose` | Same upload pipeline for avatars, covers, task and comment files |
| `ActivityLog` + "Audit logs" | One `ActivityLog` with `category` | Avoids duplicate writes; audit view is a filter; retention policies per category |
| `TaskLabel` | Join table + new `Label` entity | Labels must be reusable across tasks (workspace scope) |
| New: `Session`, `OAuthAccount`, `VerificationToken` | Required by the cookie-session and OAuth design | — |
| New: `WebhookEvent` | Idempotent webhook processing | Required by "verify payment provider webhooks" |
| New: `BillingProfile`, `NotificationPreference`, `CommentReaction`, `AiUsage`, `TaskTemplate`, `SalesLead` | Support required features | — |

### 17.7 Validation summary (enforced by shared Zod schemas and DB constraints)

| Field | Rule |
|---|---|
| Email | RFC 5322 basic, ≤ 254 chars, lowercase normalized |
| Password | 8–128 chars, ≥ 1 letter, ≥ 1 digit, not in common list |
| Names (user, org, workspace, team, project) | Trimmed, 2–60 (project 2–100), no control characters |
| Slugs | `^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$`, reserved words rejected |
| Project key | `^[A-Z][A-Z0-9]{1,5}$` |
| Task title | 1–200 chars; description JSON ≤ 50 kB; comment body ≤ 20 kB |
| Colors | `^#[0-9A-Fa-f]{6}$` |
| Hours | 0–9999.99, step 0.25 |
| Dates | ISO `YYYY-MM-DD`; `dueDate ≥ startDate` |
| Arrays | assignees ≤ 20, labels ≤ 20 per task, bulk ids ≤ 100, invitation emails ≤ 20 per request |
| Pagination | `limit` 1–100 (default 50), opaque base64url cursor |

### 17.8 Migrations and seed
- Prisma Migrate; raw SQL migrations for extensions, generated `tsvector` columns, partial unique indexes and check constraints (Prisma cannot express them). Migration names prefixed by phase (`p1_init`, `p2_auth`, …).
- `prisma/seed.ts` (dev/test only): demo organization "Acme" with 2 workspaces, 3 teams, 5 projects, 200 tasks across statuses, comments, labels, milestones, one of each role, and a second organization "Globex" for cross-tenant tests.

---

## 18. API Requirements

### 18.1 Conventions
- Base URL `https://<app-name>.onrender.com/api/v1` (same origin as the SPA); versioning in the path; breaking changes create `/api/v2`.
- JSON only (`application/json; charset=utf-8`); multipart is never used (uploads go directly to Cloudinary).
- Authentication: session cookie (§19). All routes except those marked Public require a verified session.
- Tenant routes are prefixed `/orgs/:orgSlug`; nested resources are addressed by id except where the natural key is unique in context (`projects/by-key/:key`, `tasks/by-key/:key` within a workspace).
- Idempotency: `POST` creation endpoints accept an optional `Idempotency-Key` header (24 h, per user) — implemented for task and comment creation and billing checkout.
- Rate-limit headers `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` on every response.
- Request id header `X-Request-Id` echoed in responses and error bodies.

### 18.2 Response envelope

```jsonc
// success
{ "success": true, "data": { /* resource or array */ }, "meta": { "nextCursor": "…", "total": 123 } }
// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "title is required",
    "details": [{ "path": "title", "message": "Required" }], "requestId": "…" } }
```

### 18.3 Error codes

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `STATUS_NOT_IN_PROJECT`, `MAX_DEPTH`, `UPLOAD_INVALID`, `BAD_REQUEST` | Input or state problems the client can fix |
| 401 | `UNAUTHENTICATED`, `SESSION_EXPIRED` | No or invalid session |
| 402 | `PLAN_LIMIT_REACHED`, `PLAN_FEATURE_REQUIRED` | Plan guard |
| 403 | `FORBIDDEN`, `EMAIL_NOT_VERIFIED`, `INVITATION_EMAIL_MISMATCH`, `REAUTH_REQUIRED` | Authenticated but not allowed |
| 404 | `NOT_FOUND` | Missing resource or no tenant access (never reveals which) |
| 409 | `CONFLICT`, `VERSION_CONFLICT`, `DEPENDENCY_CYCLE`, `KEY_LOCKED`, `PROJECT_ARCHIVED`, `SOLE_OWNER`, `LAST_WORKSPACE`, `DOWNGRADE_BLOCKED`, `SLUG_TAKEN` | State conflicts |
| 410 | `INVITATION_EXPIRED` | Expired invitation |
| 413 | `PAYLOAD_TOO_LARGE` | Body > 1 MB |
| 429 | `RATE_LIMITED`, `TOO_MANY_ATTEMPTS` | Throttling |
| 500 | `INTERNAL_ERROR` | Unexpected (logged with request id) |
| 502 | `AI_INVALID_OUTPUT`, `PROVIDER_ERROR` | Third-party failures |

### 18.4 Pagination, filtering, sorting
- Cursor pagination for all collections that can grow unbounded: `?limit=50&cursor=…` → `meta.nextCursor` (null at end). Cursors encode `(sortValue, id)`; sorting by non-unique fields appends `id` as tiebreaker.
- Offset pagination (`?page=1&pageSize=25`) only for small admin tables (members, invitations, workspaces).
- Filters as repeated query params (`priority=HIGH&priority=URGENT`) or comma lists; dates as `YYYY-MM-DD`; `sort=-dueDate,priority`.
- Field selection: `?include=assignees,labels,subtaskCounts` for task lists (defaults documented per endpoint); heavy relations (comments, activity) always separate endpoints.

### 18.5 Endpoint catalogue

Legend: **Perm** = permission key (§12); **Plan** = plan guard; **Scope** = MVP or Post-MVP (P).

**Auth and users** (`/auth`, `/users`) — Public where marked

| Method | Path | Perm | Notes |
|---|---|---|---|
| POST | `/auth/register` | Public | 201; sends verification; sets cookie |
| POST | `/auth/login` | Public | 200; sets cookie; lockout rules |
| POST | `/auth/logout` | Auth | Revokes current session |
| POST | `/auth/logout-all` | Auth | Revokes all sessions |
| POST | `/auth/verify-email` | Public | `{ token }` |
| POST | `/auth/resend-verification` | Auth | 1/min, 5/day |
| POST | `/auth/forgot-password` | Public | Always 200 |
| POST | `/auth/reset-password` | Public | `{ token, password }` |
| GET | `/auth/google` | Public | Redirect (state + PKCE) |
| GET | `/auth/google/callback` | Public | Exchanges code; redirects to app |
| POST | `/auth/reauthenticate` | Auth | `{ password }` or Google; marks session `reauthAt` (5 min window) |
| POST | `/auth/change-password` | Auth + reauth | Revokes other sessions |
| GET / DELETE | `/auth/sessions`, `/auth/sessions/:id` | Auth | Session list and revoke |
| GET / PATCH | `/users/me` | Auth | Profile; `lastActiveWorkspaceId` settable |
| POST | `/users/me/avatar/sign`, `/users/me/avatar/confirm` | Auth | Cloudinary flow (purpose avatar) |
| DELETE | `/users/me` | Auth + reauth | Account deletion (§11.1.7) |
| GET / PUT | `/users/me/notification-preferences` | Auth | Array of `{ type, inApp, email }` |
| GET | `/users/me/organizations` | Auth | Memberships with workspaces for the switcher |

**Organizations, members, invitations**

| Method | Path | Perm | Plan | Scope | Notes |
|---|---|---|---|---|---|
| POST | `/orgs` | Verified | orgs-per-user cap | MVP | Creates org + General + FREE subscription |
| GET | `/orgs/:org` | member | | MVP | Profile |
| GET | `/orgs/:org/context` | member | | MVP | org, membership, workspaces (accessible), permissions, plan, usage |
| PATCH | `/orgs/:org` | `org:update` | | MVP | name, slug, settings |
| POST | `/orgs/:org/logo/sign`, `/logo/confirm` | `org:update` | | MVP | |
| POST | `/orgs/:org/transfer-ownership` | OWNER + reauth | | MVP | `{ userId }` (must be ADMIN) |
| DELETE | `/orgs/:org` | OWNER + reauth | | MVP | `{ confirmSlug }` |
| POST | `/orgs/:org/leave` | member (not OWNER) | | MVP | |
| GET | `/orgs/:org/members` | `members:read` | | MVP | search, role filter, page |
| PATCH | `/orgs/:org/members/:userId` | `members:manage` | | MVP | `{ role }` |
| DELETE | `/orgs/:org/members/:userId` | `members:manage` | | MVP | |
| GET | `/orgs/:org/members/export` | `members:manage` | | MVP-P1 | CSV |
| POST | `/orgs/:org/invitations` | `members:invite` | maxMembers | MVP | `{ invites: [{ email, role, workspaceId?, projectIds? }] }` |
| GET | `/orgs/:org/invitations` | `members:invite` | | MVP | |
| POST | `/orgs/:org/invitations/:id/resend` | `members:invite` | | MVP | |
| DELETE | `/orgs/:org/invitations/:id` | `members:invite` | | MVP | Revoke |
| GET | `/invitations/:token` | Public | | MVP | Preview (org name, inviter, role) |
| POST | `/invitations/:token/accept`, `/decline` | Verified | maxMembers | MVP | |

**Workspaces, teams, labels**

| Method | Path | Perm | Plan | Scope | Notes |
|---|---|---|---|---|---|
| GET / POST | `/orgs/:org/workspaces` | member / `workspace:create` | maxWorkspaces | MVP | List returns accessible workspaces |
| GET / PATCH / DELETE | `/orgs/:org/workspaces/:ws` | access / `workspace:update` / `workspace:delete` | | MVP | `:ws` = slug |
| POST | `/orgs/:org/workspaces/:ws/archive`, `/restore` | `workspace:update` | | MVP | |
| POST | `/orgs/:org/workspaces/:ws/logo/sign`, `/logo/confirm` | `workspace:update` | | MVP | |
| GET / POST | `/orgs/:org/workspaces/:ws/members` | `workspace:members` | | MVP | `{ userId, role }` |
| PATCH / DELETE | `/orgs/:org/workspaces/:ws/members/:userId` | `workspace:members` | | MVP | |
| GET | `/orgs/:org/workspaces/:ws/activity` | workspace member | | MVP | Cursor; filters actor, entityType, from, to |
| GET / POST | `/orgs/:org/workspaces/:ws/teams` | workspace member / `team:create` | | MVP | |
| GET / PATCH / DELETE | `/orgs/:org/teams/:teamId` | member / `team:update` / `team:delete` | | MVP | DELETE body `{ projectsAction: 'move' \| 'archive' }` |
| GET / POST | `/orgs/:org/teams/:teamId/members` | member / `team:members` | | MVP | |
| PATCH / DELETE | `/orgs/:org/teams/:teamId/members/:userId` | `team:members` | | MVP | |
| GET | `/orgs/:org/teams/:teamId/activity`, `/analytics` | team member | | MVP | |
| GET / POST | `/orgs/:org/workspaces/:ws/labels` | workspace member / `labels:manage` | | MVP | |
| PATCH / DELETE | `/orgs/:org/labels/:labelId` | `labels:manage` | | MVP | |

**Projects, statuses, milestones**

| Method | Path | Perm | Plan | Scope | Notes |
|---|---|---|---|---|---|
| GET / POST | `/orgs/:org/workspaces/:ws/projects` | workspace member / `project:create` | maxActiveProjects | MVP | Filters status, teamId, q; includes progress, health, counts |
| GET | `/orgs/:org/workspaces/:ws/projects/by-key/:key` | project access | | MVP | Resolve key → project |
| GET / PATCH / DELETE | `/orgs/:org/projects/:projectId` | `project:read` / `project:update` / `project:delete` | | MVP | |
| POST | `/orgs/:org/projects/:projectId/archive`, `/restore` | `project:archive` | | MVP | |
| POST | `/orgs/:org/projects/:projectId/cover/sign`, `/cover/confirm` | `project:update` | | MVP | |
| GET / POST | `/orgs/:org/projects/:projectId/members` | `project:read` / `project:members` | | MVP | |
| PATCH / DELETE | `/orgs/:org/projects/:projectId/members/:userId` | `project:members` | | MVP | |
| GET / POST | `/orgs/:org/projects/:projectId/statuses` | `project:read` / `project:statuses` | | MVP | ≤ 50 |
| PATCH / DELETE | `/orgs/:org/projects/:projectId/statuses/:statusId` | `project:statuses` | | MVP | DELETE body `{ targetStatusId }` |
| PUT | `/orgs/:org/projects/:projectId/statuses/reorder` | `project:statuses` | | MVP | `{ statusIds[] }` |
| GET / POST | `/orgs/:org/projects/:projectId/milestones` | `project:read` / `project:milestones` | | MVP | |
| PATCH / DELETE | `/orgs/:org/projects/:projectId/milestones/:id` | `project:milestones` | | MVP | |
| GET | `/orgs/:org/projects/:projectId/overview` | `project:read` | | MVP | Stats for overview tab |
| GET | `/orgs/:org/projects/:projectId/activity` | `project:read` | | MVP | Cursor |
| GET | `/orgs/:org/trash` | `org:admin` | | MVP | Deleted projects/tasks within 30 days |
| POST | `/orgs/:org/projects/:projectId/undelete` | `org:admin` | | MVP | |

**Tasks**

| Method | Path | Perm | Plan | Scope | Notes |
|---|---|---|---|---|---|
| GET / POST | `/orgs/:org/projects/:projectId/tasks` | `task:read` / `task:create` | | MVP | Filters §11.6.8; `include=` |
| GET | `/orgs/:org/workspaces/:ws/tasks` | workspace access | | MVP | Cross-project filter over accessible projects |
| GET | `/orgs/:org/workspaces/:ws/tasks/by-key/:key` | `task:read` | | MVP | `NEX-42` |
| GET | `/orgs/:org/tasks/my` | member | | MVP | Assigned to me, grouped |
| GET / PATCH / DELETE | `/orgs/:org/tasks/:taskId` | `task:read` / `task:update` / `task:delete` | | MVP | PATCH requires `version` |
| POST | `/orgs/:org/tasks/:taskId/restore` | `task:delete` | | MVP | Within 30 days |
| POST | `/orgs/:org/tasks/:taskId/move` | `task:update` | | MVP | `{ statusId, beforeTaskId?, afterTaskId?, version }` |
| POST | `/orgs/:org/tasks/:taskId/duplicate` | `task:create` | | MVP | |
| POST / DELETE | `/orgs/:org/tasks/:taskId/assignees`, `/assignees/:userId` | `task:assign` | | MVP | |
| POST / DELETE | `/orgs/:org/tasks/:taskId/dependencies`, `/dependencies/:dependencyId` | `task:update` | | MVP | `{ blockingTaskId }` or `{ blockedTaskId }` |
| GET | `/orgs/:org/tasks/:taskId/activity` | `task:read` | | MVP | |
| GET | `/orgs/:org/tasks/:taskId/attachments` | `task:read` | | MVP | |
| POST | `/orgs/:org/projects/:projectId/tasks/bulk` | `task:update` (per task) | | MVP | ≤ 100 |
| GET / POST | `/orgs/:org/workspaces/:ws/task-templates` | member / `templates:manage` | feature templates | P | |
| PATCH / DELETE | `/orgs/:org/task-templates/:id` | `templates:manage` | | P | |
| POST | `/orgs/:org/projects/:projectId/tasks/from-template` | `task:create` | | P | `{ templateId, overrides }` |

**Comments, reactions, attachments**

| Method | Path | Perm | Plan | Scope | Notes |
|---|---|---|---|---|---|
| GET / POST | `/orgs/:org/tasks/:taskId/comments` | `task:read` / `comment:create` | | MVP | Threaded (`parentCommentId`) |
| PATCH / DELETE | `/orgs/:org/comments/:commentId` | author / `comment:moderate` | | MVP | |
| POST | `/orgs/:org/comments/:commentId/reactions` | `task:read` + member | | MVP | `{ emoji }` toggle |
| GET / POST | `/orgs/:org/projects/:projectId/discussions` | `project:read` / `comment:create` | | P | Project-level comments |
| POST | `/orgs/:org/attachments/sign` | target permission | maxFileBytes, maxStorageBytes | MVP | Returns Cloudinary params |
| POST | `/orgs/:org/attachments/:id/confirm` | uploader | | MVP | Verifies via Admin API |
| GET | `/orgs/:org/attachments/:id`, `/attachments/:id/url` | target read | | MVP | Signed URL, `variant` |
| DELETE | `/orgs/:org/attachments/:id` | uploader / `comment:moderate` | | MVP | |

**Notifications, search, analytics, activity**

| Method | Path | Perm | Plan | Scope | Notes |
|---|---|---|---|---|---|
| GET | `/notifications` | Auth | | MVP | `?unread=true&mentions=true&orgId=` cursor |
| GET | `/notifications/unread-count` | Auth | | MVP | `{ total, byOrg }` |
| POST | `/notifications/:id/read`, `/notifications/:id/unread`, `/notifications/read-all` | Auth (owner) | | MVP | |
| GET | `/orgs/:org/search` | member | | MVP | `q, types, workspaceId, limit` |
| GET | `/orgs/:org/workspaces/:ws/analytics/summary` | workspace access | analyticsHistoryDays | MVP | Tiles |
| GET | `/orgs/:org/workspaces/:ws/analytics/trends` | workspace access | analyticsHistoryDays | MVP | completion trend, monthly stats |
| GET | `/orgs/:org/workspaces/:ws/analytics/distribution` | workspace access | | MVP | status, priority |
| GET | `/orgs/:org/workspaces/:ws/analytics/projects` | workspace access | | MVP | progress + health list |
| GET | `/orgs/:org/workspaces/:ws/analytics/workload` | workspace access | | MVP | per member |
| GET | `/orgs/:org/workspaces/:ws/analytics/productivity` | workspace access | feature teamAnalytics (advanced) | MVP basic | team / individual |
| GET | `/orgs/:org/analytics/summary` | `org:admin` | | MVP | Org-wide |
| GET | `/orgs/:org/analytics/me` | member | | MVP | Own productivity |
| GET | `/orgs/:org/audit-logs`, `/audit-logs/export` | `audit:read` | retention | MVP (export P1) | category SECURITY/BILLING + membership actions |

**Billing (Phase 9 unless noted)**

| Method | Path | Perm | Scope | Notes |
|---|---|---|---|---|
| GET | `/plans` | Public | MVP | Plan config and prices for the pricing page |
| GET | `/orgs/:org/usage` | `org:admin` | MVP | Usage vs limits |
| GET | `/orgs/:org/billing` | OWNER | P | Subscription, profile, usage |
| PUT | `/orgs/:org/billing/profile` | OWNER | P | Legal name, address, GSTIN |
| POST | `/orgs/:org/billing/checkout` | OWNER | P | `{ planTier, interval }` → `{ subscriptionId, keyId }` |
| POST | `/orgs/:org/billing/checkout/verify` | OWNER | P | Signature check for UX only |
| PATCH | `/orgs/:org/billing/subscription` | OWNER | P | Upgrade/downgrade |
| POST | `/orgs/:org/billing/subscription/cancel`, `/resume` | OWNER | P | |
| POST | `/orgs/:org/billing/sync` | OWNER | P | Reconcile from Razorpay |
| GET | `/orgs/:org/billing/invoices`, `/billing/payments` | OWNER | P | Cursor |
| POST | `/billing/webhooks/razorpay` | Public + signature | P | Raw body; idempotent |
| POST | `/sales-leads` | Public | P | Enterprise contact |

**Automations (Phase 10), AI (Phase 11), admin, internal, health**

| Method | Path | Perm | Plan | Notes |
|---|---|---|---|---|
| GET / POST | `/orgs/:org/workspaces/:ws/automations` | member / `automation:manage` | feature automations, maxAutomations | |
| GET / PATCH / DELETE | `/orgs/:org/automations/:id` | `automation:manage` | | |
| POST | `/orgs/:org/automations/:id/toggle`, `/dry-run` | `automation:manage` | | dry-run body `{ taskId }` |
| GET | `/orgs/:org/automations/:id/executions` | `automation:manage` | | cursor |
| GET | `/automations/recipes` | Auth | | static presets |
| POST | `/orgs/:org/ai/task-description`, `/task-breakdown`, `/project-plan`, `/project-summary`, `/meeting-notes`, `/insights`, `/deadline-suggestion`, `/weekly-report` | resource permission | feature ai, aiRequestsPerMonth | 20/h/user |
| GET | `/orgs/:org/ai/usage` | `org:admin` | | |
| GET | `/orgs/:org/admin/overview` | `org:admin` | | usage stats, counts |
| GET / PATCH | `/orgs/:org/admin/permissions` | `org:admin` | feature customPermissions (PATCH) | toggles |
| GET | `/orgs/:org/admin/projects` | `org:admin` | | all projects incl. private |
| GET | `/api/internal/organizations`, `/organizations/:id`, `/webhook-events` | platform admin + IP allowlist | | Post-MVP |
| POST | `/api/internal/organizations/:id/disable` | platform admin + IP allowlist | | Post-MVP |
| GET | `/health`, `/health/ready` | Public | | liveness / DB readiness |

### 18.6 Representative payloads

```jsonc
// POST /orgs/acme/projects/{id}/tasks
{ "title": "Design onboarding flow", "description": { "type": "doc", "content": [] },
  "statusId": "…", "priority": "HIGH", "assigneeIds": ["…"], "labelIds": ["…"],
  "milestoneId": null, "startDate": "2026-11-20", "dueDate": "2026-11-28",
  "estimatedHours": 6, "parentTaskId": null }
// 201 → data
{ "id": "…", "key": "NEX-42", "number": 42, "title": "…", "status": { "id": "…", "name": "Todo", "category": "TODO", "color": "#2563EB" },
  "priority": "HIGH", "assignees": [{ "id": "…", "name": "Dev", "avatarUrl": "…" }], "reporter": { … },
  "labels": [{ "id": "…", "name": "Design", "color": "#8B5CF6" }], "subtaskCounts": { "done": 0, "total": 0 },
  "attachmentCount": 0, "commentCount": 0, "blockedBy": [], "position": "a0", "version": 1,
  "startDate": "2026-11-20", "dueDate": "2026-11-28", "estimatedHours": 6, "actualHours": null,
  "completedAt": null, "createdAt": "…", "updatedAt": "…" }

// 402 plan limit
{ "success": false, "error": { "code": "PLAN_LIMIT_REACHED", "message": "Your FREE plan allows 3 active projects per workspace.",
  "details": { "limit": "maxActiveProjects", "current": 3, "max": 3, "planTier": "FREE", "upgradeUrl": "/acme/settings/org/billing" } } }
```

### 18.7 Security headers and CORS
- `helmet` defaults. HTML responses for the SPA carry the CSP in SEC-07; JSON API responses carry `default-src 'none'`. The app itself is same-origin, so CORS only matters for other callers: allowlist from `WEB_ORIGINS` (default: the app's own origin), `credentials: true`, methods `GET,POST,PATCH,PUT,DELETE`, max age 600.
- State-changing requests must carry `Origin` (or `Referer`) matching the allowlist, else 403 (`CSRF_ORIGIN_MISMATCH`) — see §19.3.

### 18.8 API documentation
- OpenAPI 3.1 generated from Zod schemas with Zod 4's built-in `z.toJSONSchema()` (no extra library) in `apps/api/src/docs/openapi.ts`, served at `/api/v1/docs/openapi.json` in non-production; `pnpm docs:openapi` writes `apps/api/openapi.json`, which is committed, and a test fails when the file drifts from the code.

### 18.9 Socket.io event contract

Namespace: default. Auth: cookie on handshake. All server events carry `{ orgId, workspaceId?, projectId?, actorId, occurredAt, data }`.

**Client → server**

| Event | Payload | Ack |
|---|---|---|
| `room:join` | `{ type: 'org' \| 'workspace' \| 'project' \| 'task', id }` | `{ ok, code? }` |
| `room:leave` | same | `{ ok }` |
| `presence:ping` | `{ workspaceId, taskId? }` | — |
| `typing:start` / `typing:stop` | `{ taskId }` | — |

**Server → client**

| Event | Room(s) | `data` |
|---|---|---|
| `task:created` | project | full task summary |
| `task:updated` | project, task | `{ taskId, changes: { field: value }, version }` |
| `task:moved` | project | `{ taskId, statusId, position, version }` |
| `task:deleted` / `task:restored` | project | `{ taskId }` |
| `task:bulk-updated` | project | `{ taskIds, set }` (clients refetch) |
| `task:viewers` | task | `{ taskId, userIds }` |
| `comment:created` / `comment:updated` / `comment:deleted` | task (+ project for counts) | comment summary / `{ commentId }` |
| `reaction:updated` | task | `{ commentId, reactions: [{ emoji, count, userIds }] }` |
| `attachment:created` / `attachment:deleted` | task | attachment summary / `{ attachmentId }` |
| `project:created` / `project:updated` / `project:archived` / `project:deleted` | workspace, project | project summary / `{ projectId, changes }` |
| `status:changed` | project | statuses array (after add/rename/reorder/delete) |
| `milestone:changed` | project | milestone summary |
| `member:joined` / `member:left` / `member:role-changed` | org, workspace | `{ userId, role }` |
| `access:revoked` | user | `{ type, id }` (client leaves room, navigates away) |
| `presence:update` | workspace | `{ online: [{ userId, lastSeen }] }` |
| `typing` | task | `{ taskId, userId, typing }` |
| `notification:new` | user | notification |
| `notification:read` | user | `{ ids }` (multi-tab sync) |
| `billing:updated` | org | `{ planTier, status }` (Phase 9) |
| `automation:executed` | project | `{ automationId, status }` (Phase 10) |

---

## 19. Authentication and Authorization

### 19.1 Session architecture
- **Choice**: server-side opaque sessions stored in PostgreSQL, delivered in an HTTP-only cookie. Rejected alternatives: stateless JWT access tokens (hard to revoke on role change/removal, which tenant security requires) and JWT + refresh rotation (more moving parts without benefit at MVP scale). Sessions can be cached in memory for 60 s per process; a Redis cache is a drop-in later.
- Token: 32 random bytes (base64url) → cookie value; database stores `sha256(token)`. Lookup by hash; constant-time compare not needed because the hash is the index key.
- Cookie `nf_session`: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` with no `Domain` attribute (host-only), because the SPA and the API share one origin (§26.2). 30 days, sliding: `expiresAt` is extended when more than 24 h have elapsed since the last extension; absolute cap 90 days. Local development uses the Vite proxy so the cookie is same-origin on `localhost` as well.
- `req.user` is loaded per request; a `deletedAt` user or a revoked/expired session → 401 and the cookie is cleared.
- Re-authentication: sensitive actions (change password, delete account, transfer ownership, delete org, billing changes) require `Session.reauthAt` within 5 minutes (`POST /auth/reauthenticate`); otherwise 403 `REAUTH_REQUIRED`.

### 19.2 Password handling
- Argon2id with memory 64 MB, iterations 3, parallelism 1 (tune to ≈ 100 ms on the production instance); automatic re-hash on login if parameters change.
- Common-password list check (top 10k) and no reuse of the current password; no forced rotation.

### 19.3 CSRF protection
- Primary: `SameSite=Lax` cookie (the API is only ever called via `fetch` from the app origin) plus strict `Origin`/`Referer` verification for all non-GET requests against `WEB_ORIGINS`.
- Secondary: the client sends `X-Requested-With: NexusFlow`; requests lacking it on non-GET routes are rejected (browsers cannot add custom headers cross-site without CORS preflight, which the allowlist denies).
- Production serves the SPA and the API from the same origin (one Render service, §26.2), so cookies are first-party and no custom domain is needed. Only if the frontend is ever hosted on a different domain does the fallback apply: `SameSite=None; Secure` with a double-submit CSRF token (`nf_csrf` cookie + `X-CSRF-Token` header), implemented behind the `COOKIE_SAMESITE` setting.
- Webhook endpoint is exempt (no cookie auth; signature-verified).

### 19.4 Google OAuth
- `openid-client` with discovery; scopes `openid email profile`; `state` (random, signed, 10 min) and PKCE `code_verifier` stored in a short-lived HttpOnly cookie `nf_oauth`; `nonce` validated in the ID token.
- Linking rules per §11.1.5; account takeover prevention: linking by email only when Google reports `email_verified = true` and the email matches exactly (case-insensitive); existing users with a different Google `sub` already linked → error `OAUTH_ACCOUNT_CONFLICT`.
- Post-login redirect limited to relative app paths (`returnTo` validated against `^/[^/]`).

### 19.5 Email verification, password reset, invitations
- Tokens: 32 random bytes, stored hashed, typed, single use, expiring (verify 24 h, reset 1 h, invitation 7 days). Email links point to the web app, which posts the token to the API (keeps tokens out of API logs/referrers).
- Enumeration-safe responses on registration, forgot-password and resend.

### 19.6 Authorization pipeline
```ts
// apps/api/src/middleware/authorize.ts (pseudo)
export const authorize = (permission: PermissionKey) =>
  async (req, res, next) => {
    const ctx = await permissionService.resolve({
      userId: req.user.id, orgId: req.tenant.org.id,
      workspaceId: req.params.ws && (await loadWorkspace(req)).id,
      projectId: req.params.projectId ?? (req.task?.projectId),
      teamId: req.params.teamId,
    });                                   // cached on req for the request lifetime
    if (!ctx) return next(new NotFoundError());          // not a member → 404
    if (!can(ctx, permission, req.tenant.org.settings.permissions))
      return next(new ForbiddenError());                  // member without right → 403
    req.permissions = ctx; next();
  };
```
- `can()` is a pure function in `@nexusflow/shared/permissions.ts` (unit-tested against the matrix in §12) so the frontend uses the same function to hide controls.
- Param loaders (`loadProject`, `loadTask`, …) always include `organizationId = req.tenant.org.id` in their query; a resource from another tenant is therefore a 404 before authorization runs.
- Socket `room:join` uses the same resolver; the gateway caches `(socketId, room)` grants and clears them on `member:*` and `project member` events.

### 19.7 Account lifecycle events logged (category SECURITY)
`auth.register`, `auth.login`, `auth.login_failed`, `auth.logout`, `auth.password_changed`, `auth.password_reset`, `auth.oauth_linked`, `auth.session_revoked`, `auth.reauthenticated`, `user.deleted`, `member.invited`, `member.joined`, `member.removed`, `member.role_changed`, `org.ownership_transferred`, `org.settings_changed`, `org.deleted`.

---

## 20. Multi-Tenant Architecture

### 20.1 Model
- Single shared database, shared schema, tenant discriminator `organizationId` on every tenant table (§17.5). This is the simplest model that supports thousands of small organizations, cross-organization users and per-organization billing. Schema-per-tenant or database-per-tenant are not planned (would complicate workspace switching and migrations); ENTERPRISE single-tenant deployments are a Future Enhancement.

### 20.2 Isolation layers (defense in depth)

| Layer | Mechanism |
|---|---|
| URL and tenant context | Every tenant route carries `:orgSlug`; `tenant` middleware resolves the org and the caller's membership once per request; non-members get 404 |
| Authorization | `authorize()` + `permissionService.resolve()` (§19.6) deny by default |
| Data access | Prisma tenant extension (§20.3) forces `organizationId` on tenant models; repositories accept a `TenantContext` and never a bare `prisma` client; raw SQL for analytics/search takes `organizationId` as the first bound parameter and is reviewed in PR templates |
| Param loaders | `loadProject/loadTask/...` query by `(id, organizationId)` so cross-tenant ids 404 |
| Real-time | Rooms namespaced by ids that the resolver already validated; emits go only to rooms of the event's `orgId`; membership revocation leaves rooms |
| Files | Cloudinary `public_id` folder `nexusflow/{env}/orgs/{orgId}/…`; URLs only through `/attachments/:id/url` after permission check; signed, 15 min |
| Search | Accessible-projects CTE (§12.5) joined into every search query |
| Notifications | Written for a specific `userId`; reads filter by `userId` from the session, never from input |
| Background jobs | Job payloads include `orgId`; handlers re-check that the entity still belongs to that org before acting |
| Billing | Webhook handlers look up `Subscription` by `providerSubscriptionId` and verify `notes.orgId` matches |
| Logs | `orgId` and `userId` in every log line for forensic tracing |
| Database (optional, Phase 12) | Row-Level Security policies keyed on `app.current_org`, enabled per table with a per-transaction `SET LOCAL`; the API role is not `BYPASSRLS` |

### 20.3 Prisma tenant extension (specification)
```ts
// lib/prisma.ts (pseudo)
export const forTenant = (orgId: string) => prisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_MODELS.has(model)) return query(args);
        if (READ_OR_BULK_OPS.has(operation)) args.where = { AND: [{ organizationId: orgId }, args.where ?? {}] };
        if (operation === 'create') args.data = { ...args.data, organizationId: orgId };
        if (operation === 'createMany') args.data = args.data.map(d => ({ ...d, organizationId: orgId }));
        if (operation === 'update' || operation === 'delete' || operation === 'upsert') {
          /* unique-where ops: verify ownership first via findFirst({ where: { ...args.where, organizationId } }) */
        }
        return query(args);
      },
    },
  },
});
```
- `TENANT_MODELS` is derived from the schema (every model with `organizationId`) and a unit test asserts it matches.
- Services receive `ctx.db = forTenant(org.id)`; the raw `prisma` client is only used by auth, user-level endpoints, webhooks and jobs (which construct their own tenant client).

### 20.4 Cross-tenant test policy
- The integration suite seeds two organizations (Acme, Globex) with overlapping users. For every tenant endpoint there is a generated test: a Globex member calling an Acme URL (and an Acme URL with a Globex id) must receive 404 and no side effects. Sockets, search, notifications, attachments and analytics have dedicated cross-tenant tests (§25.4).

### 20.5 Workspace switching and context
- `GET /orgs/:org/context` returns everything the shell needs (org, plan, usage, membership, accessible workspaces, permissions map); the client re-fetches it on `member:role-changed`, `billing:updated` and on reconnect.
- A user's notifications span organizations; the Inbox groups by organization when the user belongs to more than one.

### 20.6 Tenant lifecycle
- Create (§11.2.1), suspend (platform admin, Post-MVP: all tenant routes return 403 `ORG_SUSPENDED`), delete (§17.4), export (Future: per-org JSON export).

---

## 21. Security Requirements

| ID | Requirement (request §25) | Implementation |
|---|---|---|
| SEC-01 | Password hashing | Argon2id (§19.2); never log passwords; `passwordHash` excluded from all selects by default (Prisma `omit`) |
| SEC-02 | Secure authentication | Opaque DB sessions, HttpOnly/Secure/SameSite cookies, lockout, re-auth for sensitive actions, enumeration-safe responses, OAuth state/PKCE/nonce |
| SEC-03 | Role-based authorization | §12 matrix, `authorize()` on every tenant route, deny-by-default startup check that every route declares a permission or is explicitly public |
| SEC-04 | Tenant-level data isolation | §20 layers; cross-tenant tests in CI |
| SEC-05 | Input validation | Zod on params/query/body for every route; unknown keys stripped; sizes bounded (§17.7); Tiptap JSON validated against a node/mark whitelist |
| SEC-06 | SQL injection protection | Prisma parameterized queries; raw SQL only via tagged templates (`Prisma.sql`), never string concatenation; lint rule bans `$queryRawUnsafe` |
| SEC-07 | XSS protection | React escaping; rich text rendered from JSON by Tiptap (no `dangerouslySetInnerHTML`); any HTML export sanitized with DOMPurify; CSP on the web app (`script-src 'self' https://checkout.razorpay.com`, `img-src 'self' data: https://res.cloudinary.com`, `connect-src 'self' https://api.cloudinary.com https://api.razorpay.com`, `frame-src https://api.razorpay.com`; sent by Express through helmet because the SPA and API share an origin); SVG never inline |
| SEC-08 | CSRF protection | §19.3 |
| SEC-09 | Rate limiting | `express-rate-limit`: auth 10/min/IP (login 5 failures/15 min/account), general 300/min/user, invitations 50/h/org, uploads 30/h/user, search 60/min/user, AI 20/h/user, webhooks 600/min; 429 with `Retry-After` |
| SEC-10 | Secure file uploads | Signed upload params with folder/public_id/resource type/expiry; allowlist by extension + declared mime + detected format; size and quota checks before and after; authenticated delivery only via signed URLs; SVG as download; no server-side file handling of untrusted bytes |
| SEC-11 | API request validation | Content-Type enforcement (`application/json`), body limit 1 MB, JSON depth limit, method allowlist, unknown routes 404 JSON |
| SEC-12 | Secure environment variables | `env.ts` validates all variables at boot with Zod and fails fast; secrets only in Render and GitHub encrypted settings; `.env.example` with placeholders; secrets never logged; rotate on leak (runbook) |
| SEC-13 | Payment webhook verification | Raw body HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET`, constant-time compare, event id de-duplication, 5-minute timestamp tolerance where available, processing isolated from client input |
| SEC-14 | Audit logging | `ActivityLog` SECURITY/BILLING categories for all events in §19.7 and billing lifecycle; append-only; export for admins |
| SEC-15 | Transport security | HTTPS only (HSTS `max-age=31536000`), free TLS termination at Render, `Secure` cookies |
| SEC-16 | Headers | `helmet`: `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (web app: `frame-ancestors 'none'`), `Permissions-Policy` minimal |
| SEC-17 | Dependency and supply chain | `pnpm audit` and Dependabot weekly; lockfile committed; CI fails on high/critical vulnerabilities with no fix available only after triage note |
| SEC-18 | Secrets in client | Only publishable values (`VITE_RAZORPAY_KEY_ID`, Cloudinary cloud name) reach the browser; Cloudinary API secret and Razorpay key secret stay server side |
| SEC-19 | Session hygiene | Sessions revoked on password change/reset, role downgrade to GUEST (forces context reload), account deletion; `lastSeenAt` for user review |
| SEC-20 | Error handling | No stack traces or SQL in responses; generic 500 with request id; detailed logs server side |
| SEC-21 | Privacy | PII minimization; account deletion scrub; data processing notes in A-18; IP addresses truncated in logs after 30 days (job) |
| SEC-22 | Abuse controls | Max organizations per user, invitations per hour, comment/task creation burst limits (60/min/user), attachment count caps |

Security review checkpoints: threat model review at the end of Phase 3 (tenancy) and Phase 9 (billing); automated OWASP ZAP baseline scan against staging in Phase 12.

---

## 22. Third-Party Integrations

| Integration | Purpose | Key design points | Failure handling |
|---|---|---|---|
| **Google OAuth 2.0 / OIDC** | Sign-in | `openid-client`, PKCE, verified email linking (§19.4); consent screen configured for `email profile openid` | Provider error → redirect to login with a toast; no partial accounts created |
| **Razorpay** (Subscriptions, Checkout.js, Webhooks, Invoices) | Billing in INR, **test mode only**: free account, test keys and test cards, no real money | Server creates customers/subscriptions; client only opens Checkout with `subscription_id` and publishable key; webhooks are the source of truth; daily reconciliation (`subscriptions.fetch`) catches missed webhooks | API down → checkout button disabled with status message; webhook retries by Razorpay (up to 24 h) + idempotent handler |
| **Cloudinary** (free plan) | Avatars, covers, attachments | Signed direct uploads, `authenticated` delivery type, Admin API verification at confirm, destroy jobs, folder per org, `f_auto,q_auto` transforms | Signature endpoint fails closed; confirm failure deletes the resource; destroy jobs retry; usage alarms at 80% of Cloudinary plan credits |
| **Transactional email** (Brevo free plan, HTTP API) | Verification, reset, invitations, notifications, billing receipts | `MailProvider` interface; React Email templates; sender is one verified address (for example a dedicated Gmail account) because there is no custom domain; List-Unsubscribe header; console provider in development; 300 emails per day, so only key types email by default | Job retries 3× with backoff; when the daily cap is hit, emails are skipped and logged while in-app notifications still work; without a domain some mail may land in spam, so the verify screen says "check your spam folder" |
| **LLM provider** (Gemini API free tier by default; OpenAI / Anthropic optional, A-4) | AI features (Phase 11) | `AiProvider` adapters; JSON mode where available; Zod validation; per-feature prompt templates; timeouts 30 s; cost tracking | Hidden when unconfigured; graceful inline errors; circuit breaker after 5 consecutive failures (10 min) |
| **Sentry** (optional, free plan) | Error tracking (web + api) | Release tagging, PII scrubbing (emails hashed), sample rate 10% for performance | Not required for operation |
| **GitHub / GitHub Actions** | Source control, CI/CD | PR checks, environment secrets, deploy triggers | — |
| **Render (free web service), Neon (free Postgres)** | Hosting | §26 | Cold starts handled by the wake-up screen and job catch-up (§26.1) |

Environment variables per integration are listed in Appendix D.

---

## 23. Subscription and Billing

### 23.1 Plans and limits (`packages/shared/src/plans.ts`)

Billing runs in Razorpay test mode only: checkout uses Razorpay test cards, no real money moves, and pricing and billing pages show a "Demo billing" banner (A-1). Prices are demo values. Limits are proposed defaults (A-6) and are configuration, not code logic.

| Limit / feature | FREE | PRO | BUSINESS | ENTERPRISE |
|---|---|---|---|---|
| Price (INR, per organization per month; yearly = 10 × monthly; demo values) | ₹0 | ₹999 | ₹2,999 | "Contact us" email link |
| Workspaces per organization | 1 | 5 | 20 | Unlimited |
| Members per organization (OWNER/ADMIN/MEMBER) | 5 | 25 | 100 | Custom |
| Guests per organization | 2 | 10 | 50 | Custom |
| Active projects per workspace | 3 | Unlimited | Unlimited | Unlimited |
| Tasks | Unlimited | Unlimited | Unlimited | Unlimited |
| Storage per organization | 500 MB | 10 GB | 100 GB | Custom |
| Max file size | 10 MB | 25 MB | 100 MB | 100 MB |
| Analytics history | 30 days | 1 year | Unlimited | Unlimited |
| Views | Kanban, List, Calendar | + Timeline/Gantt | + Timeline/Gantt | All |
| Advanced task management (templates, recurring, bulk > 20) | ✗ | ✓ | ✓ | ✓ |
| Automations per workspace | 0 | 20 | Unlimited | Unlimited |
| Automation executions per month | 0 | 5,000 | 50,000 | Custom |
| AI requests per month (org) | 0 | 500 | 2,500 | Custom |
| Team analytics (advanced productivity) | ✗ | Basic | ✓ | ✓ |
| Advanced reporting (CSV export of analytics, scheduled reports) | ✗ | ✗ | ✓ | ✓ |
| Custom permissions toggles | ✗ | ✗ | ✓ | ✓ |
| Audit log retention | 30 days | 90 days | 1 year | Custom |
| Priority support / SLA | ✗ | ✗ | Email | Priority + custom integrations |
| Advanced security (SSO, IP allowlist) | ✗ | ✗ | ✗ | Future |

```ts
export const PLANS: Record<PlanTier, PlanDefinition> = {
  FREE: { maxWorkspaces: 1, maxMembers: 5, maxGuests: 2, maxActiveProjects: 3, maxStorageBytes: 500 * MB,
          maxFileBytes: 10 * MB, analyticsHistoryDays: 30, maxAutomations: 0, maxAutomationRunsPerMonth: 0,
          aiRequestsPerMonth: 0, auditRetentionDays: 30, features: new Set(['kanban','list','calendar']) },
  PRO:  { …, features: new Set(['kanban','list','calendar','timeline','templates','recurring','automations','ai','teamAnalyticsBasic']) },
  BUSINESS: { …, features: new Set([...PRO, 'teamAnalytics','advancedReporting','customPermissions']) },
  ENTERPRISE: { /* Infinity limits, all features */ },
};
```

### 23.2 Enforcement points

| Action | Check |
|---|---|
| Create workspace | `activeWorkspaces < maxWorkspaces` |
| Invite / accept member | `activeMembers + pendingInvitations(non-guest) < maxMembers`; guests against `maxGuests` |
| Create project / restore / un-archive | `activeProjects(workspace) < maxActiveProjects` |
| Sign upload | `bytes ≤ maxFileBytes` and `storageUsedBytes + bytes ≤ maxStorageBytes` |
| Analytics range | `to − from ≤ analyticsHistoryDays` and `from ≥ today − analyticsHistoryDays` |
| Timeline view, templates, recurring, bulk > 20 | `features.has(...)` |
| Create automation / run | `maxAutomations`, monthly runs counter (`ActivityLog`/counter table) |
| AI request | `features.has('ai')`, monthly `AiUsage` count, per-user hourly rate |
| Downgrade | Target plan limits vs current usage (409 `DOWNGRADE_BLOCKED`) |

Responses: 402 with structured `details` (§18.6). The frontend maps `limit` keys to copy and shows the upgrade dialog.

### 23.3 Subscription state machine

```
FREE(ACTIVE) ──checkout──▶ INCOMPLETE ──subscription.authenticated──▶ AUTHENTICATED
   ▲                                   └──subscription.activated──▶ ACTIVE ◀─┐
   │                                                                  │       │ subscription.charged (renewal)
   │   subscription.pending ──▶ PAST_DUE ──payment ok──────────────────┘       │
   │                              └──subscription.halted──▶ UNPAID (read-only after 7 days)
   │   cancel (at cycle end) ──▶ ACTIVE(cancelAtPeriodEnd) ──period end──▶ CANCELED ──▶ revert to FREE
   └──────────────────────────────────────────────────────────────────────────────┘
```
- `isPaid(org) = status in (ACTIVE, AUTHENTICATED, PAST_DUE) && planTier != FREE`; PAST_DUE keeps features for 7 days (grace) with a banner; UNPAID → FREE rules apply until payment succeeds.

### 23.4 Razorpay specifics
- Plans are created once per tier × interval in the Razorpay dashboard (or via API in a setup script) and their ids stored in env (`RAZORPAY_PLAN_PRO_MONTHLY`, …).
- Subscription creation: `{ plan_id, total_count: interval === 'MONTHLY' ? 120 : 10, quantity: 1, customer_notify: 1, notes: { orgId, planTier, interval } }`; optional `start_at` for trials (A-2).
- Checkout verification (client callback) HMAC: `hmac_sha256(razorpay_payment_id + '|' + razorpay_subscription_id, key_secret) === razorpay_signature`.
- Webhook verification: `hmac_sha256(rawBody, webhook_secret) === X-Razorpay-Signature`; idempotency via `X-Razorpay-Event-Id`.
- Invoices: Razorpay generates invoices per charge; `invoice.paid` payload carries `short_url` (PDF) and amounts; stored in `Invoice`.
- Plan change: `subscriptions.update(id, { plan_id, schedule_change_at: 'now' | 'cycle_end', customer_notify: 1 })`; proration semantics confirmed in Phase 9 (A-2).
- Cancellation: `subscriptions.cancel(id, { cancel_at_cycle_end: 1 })`.
- Reconciliation job (daily): fetch each non-FREE subscription from Razorpay and correct local status/period if they diverge; log BILLING activity.
- Test mode: `rzp_test_*` keys in staging; Playwright billing tests use Razorpay test cards and the webhook simulator or a signed synthetic payload.

### 23.5 Billing data and pages
- Billing history: payments and invoices tables with status chips and PDF links; "Download all" (CSV) Post-Phase-9.
- Usage page (MVP): bars for each limit; warnings at 80%; links to the relevant admin page.
- Receipts: email on `subscription.charged` and `payment.failed` to the OWNER and billing email.
- Taxes: GST handling is a business decision (A-3); the schema stores GSTIN and Razorpay invoices can carry tax lines when configured.

---

## 24. AI Features

Summarized from §11.16; this section is the contract for Phase 11.

### 24.1 Principles
1. Optional: no core flow depends on AI; features are hidden without a configured provider or an eligible plan.
2. Human in the loop: every output is a proposal the user accepts, edits or discards; scheduled reports are stored as drafts and emailed only if the org enabled it.
3. Minimal data: only the fields listed per feature; no attachments, emails, billing data or other organizations' data; prompts include the organization's name only when needed for tone.
4. Transparent: outputs are labeled "AI-generated"; usage visible to admins.
5. Bounded cost: plan quotas, per-user rate limit, max tokens per feature, 30 s timeout, circuit breaker.

### 24.2 Feature contracts

| Feature | Endpoint | Input (JSON) | Output (validated) | Max tokens |
|---|---|---|---|---|
| Task description | `POST /ai/task-description` | `{ taskId? , title, projectId }` | `{ description: TiptapDoc, acceptanceCriteria: string[] }` | 800 |
| Task breakdown | `POST /ai/task-breakdown` | `{ taskId }` | `{ subtasks: [{ title, estimatedHours?, priority? }] }` (3–10) | 800 |
| Project plan | `POST /ai/project-plan` | `{ projectId }` or `{ name, description, startDate, endDate }` | `{ milestones: [{ name, dueDate }], tasks: [{ title, milestoneIndex, priority, estimatedHours }] }` | 1,500 |
| Project summary | `POST /ai/project-summary` | `{ projectId, from, to }` | `{ summary: string, highlights: string[], risks: string[] }` | 700 |
| Meeting notes | `POST /ai/meeting-notes` | `{ text (≤ 20 kB), projectId? }` | `{ summary, decisions: string[], actionItems: [{ title, assigneeHint?, dueHint? }] }` | 1,000 |
| Insights | `POST /ai/insights` | `{ workspaceId, from, to }` (server attaches metrics) | `{ insights: [{ title, detail, metricRefs }] }` | 700 |
| Deadline suggestion | `POST /ai/deadline-suggestion` | `{ taskId }` (server attaches estimate, assignee workload, blockers) | `{ suggestedDueDate, rationale }` | 300 |
| Weekly report | `POST /ai/weekly-report` + schedule | `{ projectId \| workspaceId, weekStart }` | `{ markdown }` stored as `AiReport` (Phase 11 table) and emailed | 1,500 |

### 24.3 Architecture
- `apps/api/src/lib/ai/`: `AiProvider` interface, `gemini.ts`, `openai.ts`, `anthropic.ts`, `index.ts` (factory by `AI_PROVIDER`), `prompts/<feature>.ts` (versioned templates with few-shot examples), `guard.ts` (plan, settings, rate limit), `usage.ts`.
- Requests run synchronously (HTTP) with streaming disabled in v1; weekly reports run in a job.
- Prompt-injection hygiene: user content is delimited and the system prompt instructs the model to treat it as data; outputs are schema-validated; no tool calling.

### 24.4 Acceptance criteria
See AC-AI-01…04 in §11.16 plus: AC-AI-05 — monthly quota exhaustion returns 402 `PLAN_LIMIT_REACHED { limit: 'aiRequestsPerMonth' }` and the UI shows remaining quota to admins.

---

## 25. Testing Strategy

### 25.1 Pyramid and tooling
- **Unit (Vitest)**: pure logic — permission resolver (`can()` against the full matrix), plan guard, analytics formulas, cursor encoding, fractional indexing, dependency cycle detection, Tiptap sanitizer/mention extraction, automation evaluator, Razorpay/Cloudinary signature helpers, Zod schemas, React components with Testing Library (board card, filter bar, forms).
- **Integration (Vitest + Supertest)**: Express app against a real PostgreSQL (a separate Neon `test` branch locally, set in `TEST_DATABASE_URL`; a free Postgres service container in GitHub Actions); each test file gets a fresh schema via `prisma migrate deploy` once and per-test cleanup with `TRUNCATE … CASCADE` of tenant tables; third-party HTTP mocked with MSW/`nock`; emails captured in a fake `MailProvider`; sockets tested with `socket.io-client` against the booted server; jobs executed inline via a test queue mode.
- **End-to-end (Playwright)**: full stack (web + api + Postgres) started by Playwright's `webServer` option with `MAIL_PROVIDER=memory`, so tests read captured emails from a test-only endpoint (`GET /api/v1/test/emails`, registered only when `NODE_ENV=test`); Chromium and WebKit; mobile viewport subset; `@axe-core/playwright` on key pages; two browser contexts for real-time scenarios; Razorpay in test mode with synthetic signed webhooks posted by the test.
- **Non-functional**: k6 load script for task list/search/analytics at 100k tasks (Phase 12); Lighthouse CI on dashboard and board; ZAP baseline.

### 25.2 Coverage and quality gates
- Services, middleware and shared packages ≥ 80% lines/branches; permission and plan logic 100%.
- Every bug fix adds a regression test. PR template requires listing tests touched.

### 25.3 Test cases by area (request §27)

| Area | Key test cases |
|---|---|
| Registration and authentication | register success / duplicate email generic response / weak password; verify token once, expired, reused; login success, wrong password, lockout after 5, unverified gate; logout and logout-all; forgot/reset flow revokes sessions; Google OAuth new user, existing email link, mismatched state; re-auth required for sensitive actions; session list and revoke |
| Organization creation | creates org + General + OWNER + FREE in one transaction; slug uniqueness and reserved words; max orgs per user; delete requires slug confirmation and OWNER; ownership transfer updates roles atomically |
| Workspace switching | context endpoint returns only accessible workspaces; last active workspace persisted; direct URL to foreign org → 404; archived workspace hidden |
| User invitations | invite bulk with roles; duplicate pending reuse; accept as new user after verification; accept with mismatched email → 403; expired → 410; revoke; GUEST with projects; plan limit on invite and on accept |
| Role permissions | matrix-driven parameterized tests: for each (role, endpoint) expected status; OWNER-only billing; ADMIN cannot demote OWNER; GUEST cannot list members or create projects; VIEWER read-only; team membership grants project access; WORKSPACE visibility grants VIEWER |
| Project creation | defaults seeded; key validation and lock; plan limit; archive read-only; delete/restore/trash purge; milestones CRUD; progress and health computed |
| Task management | create with sequential numbers under concurrency; PATCH with version conflict; move with fractional positions and re-index; status delete with reassignment; subtask depth; dependency cycles; bulk 100 ok / 101 fails; duplicate; filters and sorting; My Tasks grouping; labels limits |
| Real-time updates | handshake auth; room join authorization; task/comment events reach members only; removal leaves rooms; reconnect re-joins; presence TTL; typing throttle |
| Notifications | creation per type and recipients; actor excluded; preferences respected; email job enqueued/not; reminders idempotent; unread count reconciliation; mark read/all |
| File uploads | sign permission/type/size/quota; confirm verifies bytes/format and rejects mismatches; signed URL expiry and permission; delete decrements usage and enqueues destroy; pending cleanup |
| Subscription management | plan guard for every limit; checkout creates subscription INCOMPLETE; verify does not activate; webhook signature invalid/valid/replay; status transitions per event; upgrade now / downgrade blocked or scheduled; cancel at cycle end and revert to FREE with read-only excess; reconciliation corrects drift |
| Tenant isolation | generated cross-tenant matrix for all tenant endpoints; sockets; search; attachments URLs; notifications; analytics; job handlers with foreign ids; Prisma extension unit tests |
| API security | rate limits return 429; CSRF origin mismatch 403; body > 1 MB 413; unknown fields stripped; SQL injection strings in filters are inert; XSS payloads in titles/comments rendered escaped; headers present; webhook raw-body handling; error bodies contain no stack traces |

### 25.4 E2E scenarios (MVP exit)
1. Register → verify (link read from captured test emails) → onboarding → create project → create task → board drag → list inline edit → calendar drag.
2. Invite member (second context) → accept → both on the board → real-time move and comment with mention → notification appears live → email captured.
3. Upload image to task → preview → delete.
4. Dashboard numbers match seeded fixture; date filter changes trend.
5. FREE limits: 4th project blocked with upgrade dialog.
6. Guest flow: guest sees only their project; search returns nothing from other projects.
7. Admin: change role, view audit log entry, export CSV.
8. Accessibility: axe has no serious violations on login, home, board, task detail, settings.

### 25.5 Environments
- `local`: Neon free `dev` branch + console mail provider; `.env`; seed data. A Neon `test` branch is used for integration tests.
- `test`: ephemeral DB per CI job; deterministic seeds; fake providers.
- `staging`: optional; a second free Render service with a Neon branch and the same free providers.
- `production`: one Render free service + Neon free; Razorpay in test mode; Cloudinary folder `nexusflow/production`; Brevo for email; `DEMO_MODE=true`.

### 25.6 CI pipeline (GitHub Actions)
1. `install` (pnpm, cached) → `lint` + `typecheck` (all packages) → `unit` (web, api, shared) → `integration` (api with Postgres service) → `build` (web, api) → `e2e-smoke` (Playwright, Chromium, scenarios 1–2 and 5) on every PR.
2. `main`: all of the above + full E2E matrix + `prisma migrate diff` check + OpenAPI drift check → Render auto-deploys → smoke check on `/api/v1/health/ready`.
3. Nightly: full E2E on WebKit + mobile viewports, k6 smoke, dependency audit.

---

## 26. Deployment Strategy

### 26.1 Topology (zero-cost profile)

NexusFlow is built as a portfolio project with a zero-cost constraint: every component runs on a free tier and no paid plan is needed (A-24).

| Component | Platform (free tier) | Notes |
|---|---|---|
| Web + API + Socket.io | One Render free Web Service (Node 24, pinned by `.node-version`) | Express serves the built SPA from `apps/web/dist` with an `index.html` fallback, the REST API under `/api/v1` and Socket.io, all on one origin; health check `/api/v1/health`; background workers run in the same process (`WORKERS_ENABLED=true`) |
| Database | Neon free PostgreSQL, US East (Ohio, `us-east-2`) region; the Render service is created in Ohio too | Pooled connection string for the app, direct one for migrations; Render's free Postgres is not used because it is deleted after 30 days |
| Files | Cloudinary free plan | Separate folders for development and production |
| Email | Brevo free plan (HTTP API) | 300 emails per day, one verified sender address, no domain needed; console provider in development |
| Payments | Razorpay test mode | Test keys and test cards only; no real money moves |
| AI | Gemini API free tier | Optional; the app works without a key |
| CI | GitHub Actions on a public repository | Free minutes; the public repository doubles as the portfolio code sample |
| Error tracking | Sentry free plan | Optional, added in Phase 12 |

Free-tier constraints and how the design handles them:
- **Render sleeps after 15 minutes without traffic** and takes about 30–60 seconds to wake. The SPA shows a "Waking up the server…" screen while `/api/v1/health` is pending. Scheduled jobs (reminders, cleanup, demo reset) only run while the service is awake, so on startup the scheduler runs every job whose last run is older than its interval and reminders catch up after wake-up. Do not run a 24/7 keep-alive ping: it would also keep Neon's compute awake and use up its free monthly compute allowance.
- **Neon suspends compute when idle**, so the first query after a pause takes about a second longer; Prisma connects with `connect_timeout=15`.
- **Neon storage is 0.5 GB**: seed data stays small, notifications are kept 90 days, activity logs follow plan retention, and file bytes live only in Cloudinary.
- **Brevo allows 300 emails per day**: only verification, reset, invitation, assignment, mention and due-date emails are on by default. When the cap is reached, emails are skipped with a log entry and in-app notifications still work.
- **One instance only**: Socket.io runs without the Redis adapter, which is enough for demo traffic.
- **No persistent disk**: nothing is stored on the server's file system; all state is in Neon or Cloudinary.

### 26.2 Domains and cookies
- The app and the API share one origin, `https://<app-name>.onrender.com`. The session cookie is therefore first-party with `SameSite=Lax`, needs no `Domain` attribute, and works in browsers that block third-party cookies. No custom domain is needed; one can be attached on Render later at no extra cost if a domain is bought.
- Local development uses the Vite dev server with a proxy for `/api` and `/socket.io` to `localhost:4000`, which keeps the same-origin model.
- Hosting the frontend separately, for example on Vercel, is not recommended on free tiers. The cookie would become cross-site, and Socket.io WebSockets do not pass through Vercel rewrites. If it is ever needed, use the `COOKIE_SAMESITE=none` fallback with the CSRF token in §19.3.

### 26.3 Configuration
- All configuration through environment variables validated at boot (Appendix D). No secrets in the repository; `.env.example` documents every variable. Vite exposes only `VITE_*` variables.

### 26.4 Release process
1. Merge to `main` → CI passes → Render auto-deploys the service.
2. Render's build command installs dependencies and builds `apps/web`; the API needs no build because Node 24 runs its TypeScript directly. The start command runs `prisma migrate deploy` and then starts the server, because Render's separate pre-deploy step is a paid feature.
3. A GitHub Actions job calls `/api/v1/health/ready` after the deploy as a smoke check.
4. Migrations are backward compatible (expand → migrate → contract across releases), so a rollback never needs a schema downgrade. Rollback uses Render's manual "rollback to previous deploy".
5. A separate staging environment is optional. If wanted, it is a second free Render service plus a Neon branch, at no cost.

### 26.5 Observability and operations
- Logs: pino JSON to stdout → Render logs (retention per plan) with request id, user id, org id, latency; log level `info` in prod, `debug` in staging.
- Metrics: Render metrics (CPU, memory, p95) + `/metrics`-style internal counters (requests, socket connections, job queue depth) logged every minute; Sentry for exceptions (optional).
- Alerts: Sentry's free plan emails on new errors; GitHub Actions emails on failed CI, deploy smoke checks and backup runs; failed pg-boss jobs are logged and listed on an admin-only health page. No paid uptime monitoring.
- Runbooks (in `docs/runbooks/`, written in Phase 12): secret rotation, restore from backup, stuck jobs, webhook replay, demo reset.

### 26.6 Data protection
- Neon's free restore window covers recent mistakes. A weekly GitHub Actions workflow runs `pg_dump`, encrypts the dump with a key stored as a repository secret, and keeps it as a workflow artifact for 7 days. Encryption is required because artifacts of a public repository can be downloaded by other GitHub users.
- Encryption at rest and in transit is provided by Neon and Cloudinary; the database password lives only in Render and GitHub secrets; the Neon console is protected by the account's two-factor login.

### 26.7 Scaling path (only if the project moves to paid tiers; documented, not built)
1. Move workers to a separate Render service.
2. Add Redis (Upstash/Render): Socket.io Redis adapter, rate-limit store, session cache; then scale API to N instances.
3. Read replica for analytics queries; `ActivityLog` partitioning by month.
4. CDN caching for public assets; Cloudinary auto-upload mapping.
5. Postgres RLS enabled for defense in depth.

### 26.8 Demo mode (portfolio)
- Enabled with `DEMO_MODE=true`. The login page shows a "Try the demo" button that signs the visitor into a seeded demo organization ("Acme Studio": 2 workspaces, 3 teams, 5 projects, about 150 tasks, comments, files) as an ADMIN, so the admin panel is visible too. No email verification is needed.
- Each click creates a fresh demo user and session. Several visitors can use the demo at once; they share the demo organization, which also shows real-time updates between them.
- Restrictions for demo users: cannot change email or password, delete or rename the organization, or send invitations to real addresses (invitations are created but no email is sent). Uploads are limited to 2 MB each.
- Demo users may open the billing page and run a Razorpay test-mode checkout with test cards; the resulting plan change is undone by the next reset. A "Demo billing — no real payments" banner is always visible.
- The demo organization is reset to the seed state when it is older than `DEMO_RESET_HOURS` (default 24), checked on startup and hourly while the service is awake. Demo users older than 24 hours are deleted.

---

## 27. Development Roadmap

Twelve phases as requested, plus Phase 5b for the Post-MVP view features. Durations are indicative for two full-stack developers working in parallel (A-20); they are planning aids, not commitments. Testing is continuous: each phase ships with its unit and integration tests; Phase 12 consolidates E2E, performance and release work.

```
P1 ─▶ P2 ─▶ P3 ─▶ P4 ─▶ P5 ─▶ P6 ─▶ P7 ─▶ P8  ═══ MVP exit ═══▶ P5b ─▶ P9 ─▶ P10 ─▶ P11 ─▶ P12
                    │                 ▲      ▲                          ▲      ▲
                    └── storage lib (P2) reused in P4 covers, P7 files  │      │
                                              P7 emails required by P9 ─┘      │
                                              P9 plan features gate P10/P11 ───┘
```

### Phase 1 — Project setup and architecture (≈ 1 week)
- **Deliverables**: pnpm monorepo (`apps/web`, `apps/api`, `packages/shared`; shared lint, format and TypeScript configs in the root); TypeScript strict configs; ESLint/Prettier; Vite + React + Tailwind + shadcn/ui bootstrap with theme tokens (§14.3), app shell skeleton and route placeholders; Express app factory with middleware chain (§15.3), response envelope, `AppError` hierarchy, central error handler, request id, pino logging, helmet, CORS, rate limiter, Zod `validateRequest` helper, env validation; Prisma setup with the full MVP schema (§17, including extensions and raw SQL migrations) and seed script; Neon free `dev` and `test` database branches (no Docker); console mail provider; health endpoints; Express serving the built SPA in production with an `index.html` fallback; GitHub Actions CI (lint, typecheck, unit, integration with Postgres); `.env.example`; README with run instructions; API docs generation scaffold.
- **Dependencies**: none.
- **Acceptance criteria**: `pnpm install && pnpm dev` starts web (5173) and api (4000) with the proxy working; `pnpm test` passes a smoke suite; `prisma migrate dev` applies cleanly on an empty database and `prisma migrate diff` reports no drift; CI is green on a PR; `/api/v1/health/ready` returns 200 with DB status; an unknown route returns the JSON 404 envelope; the shell renders light and dark themes.

#### Phase 1 build steps (progress tracker)

Phase 1 is built in small steps, one at a time. Each step is checked (typecheck, lint, format, and a manual run) before the next one starts. New libraries are approved by the project owner before each step.

| Step | What it builds | Libraries | Status |
|---|---|---|---|
| 1 | Workspace skeleton: pnpm workspace, `apps/web`, `apps/api`, `packages/shared`, `.gitignore`, README | none | ✅ Done |
| 2 | TypeScript strict configs, ESLint, Prettier, first shared code | typescript (6.0.x), @types/node, eslint, typescript-eslint, prettier | ✅ Done |
| 3 | Express API basics: app factory and middleware chain, response envelope, `AppError`, central error handler, request id, pino logging, helmet, CORS, env validation, `/api/v1/health`, `.env.example` | express, helmet, cors, pino, pino-http, zod (+ type packages) | ✅ Done |
| 4 | Database connection: Prisma with Neon `dev` and `test` branches, `/api/v1/health/ready` database check | prisma, @prisma/client, @prisma/adapter-pg (pinned to 7.10.1; `pg` comes with the adapter) | ✅ Done (readiness check returns "ready": about 4.7 s when Neon wakes, about 0.3 s after) |
| 5a | Schema part 1: enums, extensions (citext, pg_trgm), users, OAuth accounts, sessions, verification tokens, notification preferences, organizations, members, workspaces, teams, invitations; partial unique rules (one OWNER per org, one default workspace, one pending invitation per email); migration `p1_identity_and_tenants` | none (Prisma preview features `postgresqlExtensions`, `partialIndexes`) | ✅ Done (rules verified against Neon) |
| 5b | Schema part 2: projects, project members, task statuses, labels, milestones, tasks, assignees, task labels, dependencies, task templates; one default status per project; `Task.statusId` uses `NO ACTION` so a project delete can remove tasks and statuses together; migration `p1_projects_and_tasks` | none | ✅ Done (rules and cascades verified against Neon) |
| 5c | Schema part 3: comments, reactions, attachments, notifications, activity log, billing tables, webhook events, sales leads, automations, AI usage; generated `searchVector` columns (hand-written SQL, marked `@default(dbgenerated())` in the schema so Prisma leaves them alone), GIN and trigram indexes, 15 check constraints; default statuses moved to `packages/shared`; seed script (`pnpm db:seed`: Acme Studio with 8 people, 5 projects, 200 tasks; Globex with 40 tasks for isolation tests); migration `p1_collaboration_billing_search` | none | ✅ Done (search, check rules and repeat seeding verified against Neon) |
| 6 | Remaining API building blocks: general rate limiter on `/api/v1` (300/min, health checks exempt) and a stricter auth limiter (10/min) for Phase 2, standard `RateLimit` and `Retry-After` headers and a 429 `RATE_LIMITED` error; `validateRequest` helper (Zod, all problems listed in one 400); `MailProvider` interface with console (development) and memory (tests) providers | express-rate-limit (8.7) | ✅ Done (limits, validation and both mail providers verified by running them) |
| 7a | React app foundation: Vite 8 + React 19 + Tailwind 4, design tokens (§14.3) with light/dark/system themes (no flash on load), Vite proxy for `/api` and `/socket.io`, small API client, start page showing live API and database status, Express serving the built SPA (hashed assets cached 1 year, deep links return the app, API 404s stay JSON) | react, react-dom, vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite (+ type packages) | ✅ Done (build 71 kB gzipped JS; dev proxy and production serving verified) |
| 7b | App shell: shadcn-style components (button, dropdown menu, tooltip, sheet, skeleton), sidebar (workspace switcher, main nav with Inbox badge, project shortcuts, collapsible to icons, drawer on phones), top bar (breadcrumbs from route handles, search with Ctrl/⌘+K, New menu, notifications), user menu with theme choice, full route map (§14.2) with placeholder pages naming the phase that builds them, empty states, lazy-loaded pages with skeletons, skip link, 404 page. Sidebar data comes from a temporary `sampleData.ts` until Phase 3 | react-router (8.5), clsx, tailwind-merge, class-variance-authority, lucide-react, radix-ui | ✅ Done (23 pages and 6 redirects rendered in Node with zero React warnings; build 140 kB gzipped JS) |
| 8 | Tests and CI: Vitest unit tests (validator, timeout, mail providers, default statuses), Supertest HTTP tests (health, errors, 413, headers, request ids, rate limiting), database tests in rollback-only transactions (one owner, case-insensitive email, task numbers, check rules, cascades, full-text search) on the Neon `test` branch with a guard that refuses the dev database; `.github/workflows/ci.yml` (format, lint, typecheck, build; tests against a throwaway Postgres 16 service); OpenAPI 3.1 docs from Zod with a drift test | vitest (5.1), supertest (7.3) + types; `zod-to-openapi` not needed (Zod 4 built-in) | ✅ Done locally (31 tests pass); CI runs after the first push to GitHub |

Phase 1 is complete when all eight steps are done and the Phase 1 acceptance criteria above pass.

### Phase 2 — Authentication and user management (≈ 1.5 weeks)
- **Deliverables**: registration, email verification (+ resend), login/logout/logout-all, session store and cookie handling, lockout, forgot/reset password, Google OAuth (PKCE), re-authentication, change password, session list/revoke, profile (name, timezone), avatar upload via the Cloudinary `StorageProvider` (sign/confirm), account deletion with scrub; `MailProvider` with templates for verification/reset/welcome; auth pages (login, register, verify, forgot, reset) and settings pages (profile, security); frontend session store and API client with 401 handling; SECURITY activity logging for auth events, written to `ActivityLog` with `organizationId = NULL` because no tenant exists yet (A-23, §17.3).
- **Dependencies**: Phase 1.
- **Acceptance criteria**: AC-AUTH-01…08 pass as integration tests; E2E: register → verify via the captured test email → log in → update profile → upload avatar → log out; rate limits verified (429s); OAuth flow passes against a mocked OIDC provider in tests and against Google in staging; `passwordHash` never appears in any response (test scans all auth/user responses).

#### Phase 2 build steps (progress tracker)

| Step | What it builds | Libraries | Status |
|---|---|---|---|
| 2.1 | Server-side sessions (random token in an HttpOnly, SameSite=Lax cookie; SHA-256 fingerprint in `Session`; 30-day sliding and 90-day absolute expiry; 30 s cache), Argon2id password hashing with equal timing for unknown accounts, register (enumeration-safe), login with 5-failure/15-minute lockout, logout and logout everywhere, `GET /users/me`, CSRF protection (`X-Requested-With: NexusFlow` header plus Origin check), SECURITY audit events | argon2, cookie-parser | ✅ Done |
| 2.2 | Email verification and resend (1 a minute, 5 a day), single-use hashed link tokens, Brevo HTTP mail provider with daily cap, email templates (verify, account exists, reset, password changed), safe `sendEmail` that never breaks a request | none | ✅ Done |
| 2.3 | Forgot and reset password (enumeration-safe; signs out every device), change password (signs out other devices), password re-confirmation for sensitive actions (5 minutes), active sessions list and per-device sign-out | none | ✅ Done |
| 2.4 | Web app: TanStack Query cache, API client with CSRF header, React Hook Form + shared Zod schemas, pages for log in, sign up, verify email, forgot and reset password, Security settings; route guards (signed out → login with safe return address, unverified → verify page); real user in the menu and on Home | @tanstack/react-query, react-hook-form, @hookform/resolvers | ✅ Done |
| 2.5 | Profile settings (name, time zone), profile photo via signed direct upload to Cloudinary with server-side verification (no Cloudinary library), account deletion with password re-confirmation, organization-owner block and personal-data scrub, Goodbye page | none | ✅ Done (photo upload needs Cloudinary keys, A-25) |
| 2.6 | "Continue with Google" (Authorization Code + PKCE, state and nonce, verified-email linking rules), hidden until configured | openid-client | ✅ Code done; needs a Google Cloud OAuth client to switch on |

Verification: 57 API tests in 9 files (auth, account, HTTP, database, docs, mail, validation, timeout, Cloudinary signature) and 3 shared tests all pass against the Neon test branch (224 s), plus 13 page renders and 3 guard checks with zero React warnings. The test setup rebuilds the test database automatically if an earlier run stopped half-way through a migration.

### Phase 3 — Organization and workspace management (≈ 1.5 weeks)
- **Deliverables**: organization creation and onboarding wizard; tenant middleware; permission resolver and `authorize()` with the §12 matrix in `@nexusflow/shared`; organization settings (general, logo, danger zone: transfer ownership, delete); members list/role change/remove; invitations (bulk create, email, preview, accept/decline, resend, revoke, expiry job); workspaces CRUD, archive, members, branding; workspace switcher and `context` endpoint; plan configuration and `PlanGuard` with FREE limits; usage endpoint; workspace activity feed; organization admin panel skeleton (members, invitations, settings, usage); DOMAIN/SECURITY activity logging for all of the above; cross-tenant test harness (two seeded orgs, generated matrix).
- **Dependencies**: Phase 2 (sessions, email, storage).
- **Acceptance criteria**: AC-ORG-01…05, AC-INV-01…05 and AC-ADM-01/02 pass; the generated cross-tenant matrix passes for every endpoint delivered so far; the permission matrix unit test covers every cell of §12.2; E2E: create org → invite second user → accept in a second context → switch workspaces → change role → see audit entry; FREE limits produce 402 with structured details for workspaces and members.

#### Phase 3 build steps (progress tracker)

| Step | What it builds | Libraries | Status |
|---|---|---|---|
| 3.1 | Shared rules: plan limits (§23.1), permission matrix (§12.2) with role-change and removal rules (A-8), organization/workspace/invitation schemas, API response types | none | ✅ Done |
| 3.2 | Tenant middleware (`loadTenant`: 404 for non-members; `requireOrgPermission`), plan guard (402 `PLAN_LIMIT_REACHED` with details), activity-log helper | none | ✅ Done |
| 3.3 | Organizations API: create (General workspace, owner, FREE subscription in one transaction), context, rename/re-address (old slug kept in `slugHistory`), soft delete, transfer ownership, leave, usage, audit log | none | ✅ Done |
| 3.4 | Members and invitations API: list/search, change role, remove (ends every membership and assignment), invite up to 20 (pending invites count against the plan), resend, revoke, public preview, accept, decline | none | ✅ Done |
| 3.5 | Workspaces API: list, create, rename, archive/restore, delete (never the last one), members, activity feed; last-opened workspace | none | ✅ Done |
| 3.6 | Web: real organization context replaces the sample data; workspace switcher with "New workspace" dialog; `/` opens the last workspace (else the first, else onboarding); onboarding page; invitation page (signed-out, wrong-account and unverified cases) | none | ✅ Done |
| 3.7 | Web: settings layout; Organization (details, transfer, leave, delete), Members, Invitations, Usage, Audit log, Roles and permissions pages; Workspace settings (details, members, archive, delete); 402 messages link to pricing | none | ✅ Done |

Verification: the full suite (75 API tests in 10 files and 18 shared tests, 488 s) passes against the Neon test branch, including 18 Phase 3 API tests (creation, plan limits, invitations, roles, workspaces, tenant isolation for every organization endpoint) and 15 permission-matrix unit tests; 55 operations documented in `openapi.json`; 16 page renders (owner and member views, signed-out invitation) pass.

Deferred from Phase 3: organization and workspace logo upload and the workspace branding color; the workspace activity page in the web app (the API exists); audit-log CSV export; the background job that marks invitations expired (expiry is enforced when an invitation is opened; Phase 7 adds pg-boss jobs); redirects from old organization addresses; the Prisma tenant extension (§20.3) — services scope every query by `organizationId` and the cross-tenant tests check it; the Playwright E2E journey (Playwright is installed with the E2E suite in Phase 12, or earlier if wanted); guests see an explanation page until project sharing arrives in Phase 4.

### Phase 4 — Team and project management (≈ 1.5 weeks)
- **Deliverables**: teams CRUD, members, leads, team pages (members, projects, activity); labels CRUD; projects CRUD with key generation/locking, cover upload, dates, priority, status lifecycle, visibility, archive/restore, soft delete + Trash + purge job; project members and roles; default statuses seeding and status management (add/rename/recolor/reorder/delete with reassignment); milestones CRUD; project list/grid with filters and progress/health placeholders (formulas implemented in Phase 8 but computed here); project settings page; project activity feed; WORKSPACE visibility and team-implied access in the resolver.
- **Dependencies**: Phase 3.
- **Acceptance criteria**: AC-TEAM-01…03, AC-PROJ-01…06 pass; cross-tenant matrix extended and passing; E2E: create team → team project → add member via team → verify access → archive project → restore; plan limit on active projects verified; status deletion reassigns tasks (tested with seeded tasks once Phase 5 lands, unit-tested here with fixtures).

#### Phase 4 build steps (progress tracker)

| Step | What it builds | Libraries | Status |
|---|---|---|---|
| 4.1 | Shared rules: project-role resolution (§12.4: owner/admin → manager, team lead → manager, team member → contributor, workspace member → viewer of WORKSPACE projects, guests capped at contributor), rights (`canManage`, `canAdminister` — team leads cannot delete or change columns, §12.3), key suggestion, schemas and response types | none | ✅ Done |
| 4.2 | Teams API: create with a lead, rename, delete with "move" or "archive" for its projects, members with at least one lead | none | ✅ Done |
| 4.3 | Projects API: list with progress (round(done/total×100), subtasks included), create with six default columns and the creator/owner as managers, FREE limit of 3 active projects per workspace, key lock after the first task, archive/restore to the previous status (archived = read-only), soft delete, 30-day trash and restore, members and roles (owner always manager, at least one manager), activity feed | none | ✅ Done |
| 4.4 | Columns (add, rename, recolor, category, default, reorder, delete with task reassignment), milestones (progress, overdue), workspace labels (workspace admins and project managers) | none | ✅ Done |
| 4.5 | Web: Projects page (cards, filters, "New project" with key suggestion), project header with status and progress, project settings (details, members, columns, milestones, recent activity, archive/delete), Teams and Team pages, labels in Workspace settings, organization Teams overview and Projects trash, project shortcuts in the sidebar, "New project/team" in the top bar | none | ✅ Done |

Verification: 10 Phase 4 API tests (AC-PROJ-01…05, AC-TEAM-01…03, columns, milestones, labels, trash, tenant isolation for every project, team and label endpoint) and 10 access-rule unit tests pass against the Neon test branch; 92 operations in `openapi.json`; 11 page renders (owner and read-only member views) pass.

Deferred from Phase 4: project cover image upload (needs Cloudinary keys; same signed-upload pattern as avatars); project health (formula in §11.12.3, Phase 8 with the dashboard); the purge job that permanently deletes trashed projects after 30 days (Phase 7, pg-boss); team activity and analytics tabs (Phase 8); rich-text project descriptions (plain text for now, stored as an editor document so Phase 5's Tiptap editor can open it); the `project:created` real-time event (Phase 6); drag-and-drop column reordering (up/down buttons for now; dnd-kit arrives with the board in Phase 5); the Playwright E2E journey.

### Phase 5 — Task management and project views (≈ 3 weeks)
- **Deliverables**: task model and services (sequential numbering, statuses/categories, `completedAt`, assignees with notifications stubbed, labels, milestones, dates, hours, subtasks, dependencies with cycle detection, move with fractional indexing, optimistic concurrency, soft delete/restore, duplicate, bulk updates, filters/sort/cursor pagination, My Tasks, by-key lookup); activity logging with field diffs; task detail panel and full page (all properties, description editor with Tiptap, subtasks, dependencies, activity tab); Kanban board (dnd-kit, column management, quick add, filter bar); List view (TanStack Table, virtualization, inline editing, bulk bar, column settings); Calendar view (month/week, drag to reschedule, unscheduled panel); keyboard shortcuts and command palette; frontend optimistic updates and conflict handling. Real-time emission hooks are added but the socket gateway ships in Phase 6.
- **Dependencies**: Phase 4.
- **Acceptance criteria**: AC-TASK-01…08 and AC-VIEW-02, AC-VIEW-03, AC-VIEW-05 pass (AC-VIEW-01 real-time part deferred to Phase 6); concurrency test for numbering passes; board with 500 seeded tasks meets the "Load more" behavior; List view renders 5,000 rows virtualized with < 100 ms interaction latency; E2E: create tasks via quick add → drag across columns → inline edit in list → calendar drag; all task endpoints in the cross-tenant matrix pass.

#### Phase 5 build steps (progress tracker)

| Step | What it builds | Libraries | Status |
|---|---|---|---|
| 5.1 | Shared rules: task schemas (create, change with version, move, bulk ≤ 100, links, list filters and sorting), `fractional-indexing` card positions, dependency-cycle check, date helpers (today in the person's time zone, month grid, My Tasks groups), rich-text validation (node and link allow-list, size and depth limits) and plain-text extraction; migration `p5_task_position_order` gives `Task.position` byte-order sorting (collation "C") | `fractional-indexing` | ✅ Done |
| 5.2 | Tasks API: create (numbers from one `UPDATE … RETURNING`, consecutive under 50 parallel requests), read by id and key, change with version check (409 `VERSION_CONFLICT` with the latest task) and one history row per request, move between columns and places (order keys renumbered when too long), delete/restore/trash (subtasks go with the parent), duplicate, subtasks one level deep, links with cycle detection, bulk change/delete in one transaction, filters, sorting and paging, board columns with the first 200 cards, My Tasks, assignable people; `emitEvent` hook for Phase 6 | none | ✅ Done |
| 5.3 | Web: task hooks with optimistic updates and conflict handling, filter bar (search, My tasks, Overdue, Unassigned, priority, labels, assignees; kept in the address), New task dialog, shortcuts C and / | none | ✅ Done |
| 5.4 | Web: Kanban board (mouse, touch and keyboard drag, quick add, collapse, "Load more" past 200 cards, undo on failed save) | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | ✅ Done |
| 5.5 | Web: task panel and page (all properties, rich-text description, subtasks, links, history, duplicate, delete) | `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extensions` | ✅ Done |
| 5.6 | Web: List view (sorting, inline editing, column choices per project, bulk bar, virtualized rows, keyboard use), Calendar view (month/week, drag to reschedule or unschedule, click a day to add, milestones, "No date" panel), My Tasks page | `@tanstack/react-table`, `@tanstack/react-virtual` | ✅ Done |

Verification: 10 Phase 5 API tests (AC-TASK-01 to 08, AC-VIEW-02, AC-VIEW-03 through the same update path, AC-VIEW-05 paging with 205 tasks in one column, tenant isolation for every task endpoint) and 14 shared unit tests pass against the Neon test branch; 109 operations in `openapi.json`; 7 page renders (manager and read-only views of board, list, calendar, My Tasks and the task page) pass; the main bundle stays at 358 KB and the editor (397 KB) loads only when a task opens.

Decisions: libraries approved by the developer on 2026-11-19 (dnd-kit, fractional-indexing, Tiptap **3**, TanStack Table 8 and Virtual 3); `date-fns` skipped (own helpers); `cmdk` and the ⌘K palette moved to Phase 8 (search arrives there); full-text search is Phase 8, so the task search box matches titles and task numbers.

Deferred from Phase 5: the ⌘K command palette (Phase 8); the socket gateway and live updates (Phase 6; services already call `emitEvent`); a trash page for deleted tasks (the API exists); drag-and-drop column ordering (up/down buttons in project settings, as in Phase 4); group-by assignee or priority on the board (Post-MVP); measured performance runs (500-task board, 5,000-row list); the Playwright E2E journey; arrow-key and extra shortcuts beyond C, /, Enter and Space.

### Phase 6 — Comments and real-time collaboration (≈ 2 weeks)
- **Deliverables**: Socket.io gateway (cookie auth, rooms, membership checks, revocation handling), `EventBus` wiring from services, full event contract (§18.9), presence and typing, client socket layer with cache patching and reconnect logic; comments (rich text, mentions with member picker, threads, edit/delete/tombstone, attachments hook), reactions; comment and task real-time updates across board/list/calendar/detail; notifications emitted for assignment/mention/comment are created in Phase 7 (service interface stubbed here).
- **Dependencies**: Phase 5.
- **Acceptance criteria**: AC-RT-01…05, AC-COMM-01…05, AC-VIEW-01, AC-VIEW-04 pass; socket cross-tenant tests pass; Playwright two-context scenario shows a move and a comment appearing on the other side within 500 ms; reconnection re-joins rooms (test kills the socket and asserts a subsequent event is received).

#### Phase 6 build steps (progress tracker)

| Step | What it builds | Libraries | Status |
|---|---|---|---|
| 6.1 | Comments API: threads one level deep (400 `MAX_DEPTH`), edit by the author (`editedAt`), delete by the author or a project manager (a "Comment deleted" placeholder while replies exist), @mentions kept only for people who can open the project (others become plain text), reactions that toggle (curated 24 plus any single emoji), notification requests (MENTIONED, TASK_COMMENTED; never the author) handed to the event bus for Phase 7, `comment:*` and `reaction:updated` events | none | ✅ Done |
| 6.2 | Web: comments in the task panel and page (comment box with bold, italic, code, lists, links and an @ picker; replies, edit, delete, reactions with instant feedback); stored comments shown from their JSON without HTML | none (uses the Tiptap packages from Phase 5) | ✅ Done |
| 6.3 | Socket.io gateway on the API's own port (session cookie, origin check, 10 connections per person, rooms with the same access checks as HTTP, membership/role/team/visibility changes make connections re-check their rooms and leave with `access:revoked`, signed-out sessions disconnected); web: one connection per tab, rooms joined by the shell, project layout and task panel, events refresh or patch the cached data, everything reloads after a reconnect | `socket.io` (API), `socket.io-client` (web; API tests) — approved 2026-11-19 | ✅ Done |
| 6.4 | Presence (online avatars in the top bar, "also viewing" on a task) and "… is typing" under comments | none beyond 6.3 | ✅ Done |

Verification: 5 comment API tests (AC-COMM-01 to 05, write rights, tenant isolation for every comment endpoint) and 5 live-update tests (AC-RT-01 to 05 with a real server and socket clients, plus rooms of other organizations refused) pass against the Neon test branch; 115 operations in `openapi.json`; 8 page renders (including comment threads, mentions, placeholders and reactions) pass. AC-VIEW-01 and AC-VIEW-04 (a second browser sees moves and reschedules) rely on these events; the two-browser Playwright check comes with the E2E suite.

Decisions: mentions are inserted with the editor's @ button (a small custom node), so the Tiptap Mention and Suggestion extensions are not needed; typing "@" to open the list can come later. Access changes are detected by a small hook on the membership, team, role and visibility routes (`recheckAccessAfter` in `apps/api/src/middleware/tenant.ts`) instead of re-checking every room on a timer, which would keep the free Neon database awake. Database queries now give up after 30 s (`query_timeout`), so a connection that died quietly (Wi-Fi drop, laptop asleep) can no longer make a request wait forever.

Deferred from Phase 6: the project-level "Discussions" tab (Post-MVP); opening the mention list by typing "@"; the Playwright two-browser test (Playwright arrives with the E2E suite); notifications themselves (Phase 7 turns `notification:requested` into inbox entries and emails).

### Phase 7 — Notifications and file management (≈ 2 weeks)
- **Deliverables**: pg-boss queue bootstrap with schedules; notification service, types, preferences, Inbox UI, unread badge, live delivery, email notification templates and jobs, reminder jobs (due soon, overdue, milestone), notification retention job; attachment pipeline (sign/confirm/url/delete, allowlist, quotas, cleanup, destroy jobs), dropzone and previews (image lightbox, PDF, video), attachments on tasks and comments, storage usage in admin usage page; cover/avatar flows refactored onto the same pipeline if not already.
- **Dependencies**: Phase 6 (sockets for live notifications, comments for mentions), Phase 2 (storage provider).
- **Acceptance criteria**: AC-NOTIF-01…04, AC-FILE-01…05 pass; email jobs captured by the memory mail provider for enabled types only; reminder idempotency test passes; E2E: upload image → preview → delete; notification appears live and email is captured; cross-tenant tests for attachment URLs and notifications pass.

#### Phase 7 build steps (progress tracker)

| Step | What it builds | Libraries | Status |
|---|---|---|---|
| 7.1 | Background jobs: pg-boss queue in the same database (schema `pgboss`), workers polling every 30 s, hourly reminders, daily clean-ups; `JOBS_ENABLED=false` turns the timetable off (jobs sent by the app then run at once), so the free Neon database can sleep | `pg-boss` (approved 2026-11-19) | ✅ Done |
| 7.2 | Notifications: one `notify()` for every service (actor removed, people who left the organization skipped, each person's preferences applied), inbox rows, live `notification:new` to the person's tabs, email jobs with a preferences link; sent for assignment, unassignment, column changes, comments, mentions, being added to a project; reminders TASK_DUE_SOON (tomorrow, after 9:00 local), TASK_OVERDUE, MILESTONE_DUE_SOON (3 days before, to managers), each exactly once; 90-day retention, 30-day trash purge, invitation expiry | none | ✅ Done |
| 7.3 | Web: Inbox (All, Unread, Mentions, mark read/unread, mark all read, load more), unread badge in the sidebar and a dot on the bell, notification settings page (in-app and email per type) | none | ✅ Done |
| 7.4 | Attachments (Cloudinary signed uploads, confirm, signed URLs, delete with destroy jobs, quotas, previews) | none (Cloudinary over HTTP, as for avatars) | ⬜ Next |

Verification (7.1–7.3): 4 notification API tests (AC-NOTIF-01 assignment in the app, live and by email and none for the actor, preferences switching email and the app off; AC-NOTIF-02 24 reminder runs give one due-soon, plus overdue and milestone once each; AC-NOTIF-03/04 counts, read/unread, mark all read for one person only; retention, trash purge, invitation expiry) pass against the Neon test branch; 122 operations in `openapi.json`. The MEMBER_JOINED notice for the inviter already existed since Phase 3.

### Phase 8 — Dashboard and analytics (≈ 1.5 weeks) — MVP exit
- **Deliverables**: analytics SQL (all metrics in §11.12.2), health heuristic, caching, date range and plan gating; workspace Insights page with tiles and Recharts charts, project overview tab, team analytics tab (basic), personal productivity; global search (tsvector/trgm indexes, grouped endpoint, ⌘K integration, results page), workspace-wide advanced filter page; pricing page (static from plan config); Home page (My Focus); empty states, skeletons and polish pass across MVP screens; accessibility pass (axe clean on core pages); MVP documentation (README, deployment guide draft).
- **Dependencies**: Phases 5–7.
- **Acceptance criteria**: AC-DASH-01…05, AC-SRCH-01, 02, 04 pass (AC-SRCH-03 load test in Phase 12); reconciliation test proves dashboard totals equal raw counts for the fixture; Lighthouse Performance ≥ 85 and Accessibility ≥ 95 on dashboard and board in CI (90 target enforced in Phase 12); all MVP E2E scenarios in §25.4 pass; MVP exit checklist in §28.1 complete.

### Phase 5b — Advanced views and task features (≈ 1 week, Post-MVP)
- **Deliverables**: Timeline/Gantt view (bars, milestones, dependency arrows, drag/resize, zoom, virtualization); task templates (CRUD, create from template); recurring tasks (RRULE storage, scheduler job, next-occurrence creation on completion or schedule); project discussions tab; WIP badge on columns; group-by assignee/priority on the board; plan gating for these features.
- **Dependencies**: Phase 8 (plan feature gating in place), Phase 7 (jobs).
- **Acceptance criteria**: Gantt renders 1,000 tasks with smooth scrolling; dragging a bar updates dates and dependency arrows live for another user; recurring task creates exactly one next occurrence per completion; templates create tasks with subtasks and labels; FREE orgs get 402 `PLAN_FEATURE_REQUIRED` for Timeline and templates.

### Phase 9 — Subscription and billing (≈ 2 weeks, Post-MVP)
- **Deliverables**: Razorpay `PaymentProvider` (customers, subscriptions, update, cancel, fetch), checkout endpoint and Checkout.js integration, client verify endpoint, webhook endpoint with raw body and signature verification, `WebhookEvent` idempotency, event handlers and state machine, invoices/payments sync, upgrade/downgrade/cancel/resume flows with usage guard, reconciliation job, FREE reversion rules (read-only excess), billing profile with GSTIN, billing page (plan, usage, history, invoices), receipts and billing notifications, sales lead form; plan limits for PRO/BUSINESS enforced end to end; BILLING audit logging.
- **Dependencies**: Phase 3 (plans, guard), Phase 7 (email, jobs), Phase 8 (pricing page).
- **Acceptance criteria**: AC-BILL-01…05 pass with synthetic signed webhooks; Razorpay test-mode E2E completes checkout and activation; replayed webhooks are ignored; downgrade guard and cycle-end scheduling verified with the reconciliation job in test clock mode; billing endpoints OWNER-only in the permission tests; threat-model review of billing completed and documented.

### Phase 10 — Automation engine (≈ 2 weeks, Post-MVP)
- **Deliverables**: automation schema and Zod definitions for triggers/conditions/actions; event-to-job bridge; evaluator and action executors (system actor), loop protection, rate limits, retries, auto-disable; execution log; recipes catalogue; builder UI (three-step, summary sentence, dry run, execution log); plan gating and monthly run counters; `AUTOMATION_ALERT` notifications.
- **Dependencies**: Phase 5 (events), Phase 7 (notifications/jobs), Phase 9 (plan features).
- **Acceptance criteria**: AC-AUTO-01…04 pass; all five requested recipes verified by integration tests; a rule chain of depth 4 stops at 3 with SKIPPED executions; builder E2E creates a rule from a recipe, dry-runs it and sees a SUCCESS execution after triggering.

### Phase 11 — AI integration (≈ 1.5 weeks, Post-MVP)
- **Deliverables**: `AiProvider` interface and adapters (Gemini, OpenAI, Anthropic) with factory and circuit breaker; guard (plan, org setting, rate limit, quota); prompt templates and Zod output schemas for the eight features; endpoints; UI entry points with preview/accept flows; weekly report job and email; AI usage page for admins; org setting toggle; privacy notice copy.
- **Dependencies**: Phase 5 (tasks), Phase 8 (analytics for insights/reports), Phase 9 (plan gating), Phase 7 (jobs/email).
- **Acceptance criteria**: AC-AI-01…05 pass with a fake provider in tests and one real provider in staging; the app passes the full E2E suite with `AI_PROVIDER` unset; usage rows recorded for every call including failures.

### Phase 12 — Testing, optimization and deployment (≈ 1.5 weeks)
- **Deliverables**: full E2E matrix (Chromium, WebKit, mobile), k6 load tests (task list, search, analytics at 100k tasks) with index tuning, Lighthouse CI thresholds (Performance ≥ 90), ZAP baseline scan fixes, CSP finalization, optional Postgres RLS policies, `ActivityLog` partitioning decision, Redis adapter readiness (feature-flagged), free-tier production deployment (§26.1) with the wake-up screen and job catch-up, encrypted weekly backup workflow with one restore test, demo mode and demo seed (§26.8), portfolio README (live demo link, architecture diagram, screenshots or GIFs, feature list, key technical decisions, how to run locally), runbooks, OpenAPI docs, release checklist.
- **Dependencies**: all previous phases (can start E2E consolidation right after Phase 8 in parallel with 9–11).
- **Acceptance criteria**: all NFR targets in §10 measured and met or explicitly waived with a note; CI pipeline per §25.6 enforced; restore drill documented; production smoke test passes; security checklist §21 signed off.

---

## 28. Acceptance Criteria

### 28.1 MVP exit checklist (end of Phase 8)
1. All P0 user stories in §8 are implemented and their `AC-` criteria pass in CI (unit + integration), and all E2E scenarios in §25.4 pass on Chromium.
2. Cross-tenant test matrix covers 100% of tenant endpoints, socket rooms, attachment URLs, search and analytics, with zero failures.
3. Permission matrix tests cover every cell in §12.2 and §12.3 for the roles involved in MVP features.
4. FREE plan limits (workspaces, members, guests, active projects, file size, storage, analytics range) return 402 with structured details, and the UI shows the upgrade dialog.
5. Real-time: task move and comment propagate to a second client within 500 ms (p95 across 20 runs in CI).
6. Notifications: in-app + email for assignment, mention, comment, invitation, due-soon and overdue, respecting preferences; reminder jobs idempotent.
7. Files: upload/preview/download/delete through Cloudinary with validation and signed delivery; no public URLs anywhere (test greps responses for `res.cloudinary.com` without a signature).
8. Dashboard numbers reconcile with raw counts; date filters work; FREE history cap enforced.
9. Global search returns grouped, access-filtered results; task key search ranks first.
10. Admin panel: members, invitations, teams, projects, settings, usage and audit log (with CSV export) work for OWNER/ADMIN only.
11. Accessibility: axe reports no serious or critical violations on login, home, board, list, calendar, task detail, inbox, settings; keyboard-only board operation demonstrated.
12. Performance: Lighthouse Performance ≥ 85 (≥ 90 by Phase 12) and Accessibility ≥ 95 on dashboard and board; API p95 ≤ 300 ms on list endpoints with the 10k-task fixture.
13. Security: headers, CSRF origin checks, rate limits, lockout, enumeration-safe responses, no stack traces, no secrets in client bundle (CI scans the bundle for `RAZORPAY_KEY_SECRET`, `CLOUDINARY_API_SECRET`, `DATABASE_URL`).
14. Documentation: README (setup, scripts), `.env.example`, OpenAPI JSON committed, this PRD updated with any deviations.

### 28.2 Per-feature acceptance criteria index

| Feature | Criteria |
|---|---|
| Authentication and account | AC-AUTH-01…08 (§11.1) |
| Organizations and workspaces | AC-ORG-01…05 (§11.2) |
| Invitations and membership | AC-INV-01…05 (§11.3) |
| Teams | AC-TEAM-01…03 (§11.4) |
| Projects | AC-PROJ-01…06 (§11.5) |
| Tasks | AC-TASK-01…08 (§11.6) |
| Views | AC-VIEW-01…05 (§11.7) |
| Real-time | AC-RT-01…05 (§11.8) |
| Comments | AC-COMM-01…05 (§11.9) |
| Notifications | AC-NOTIF-01…04 (§11.10) |
| Files | AC-FILE-01…05 (§11.11) |
| Dashboard and analytics | AC-DASH-01…05 (§11.12) |
| Search | AC-SRCH-01…04 (§11.13) |
| Billing | AC-BILL-01…05 (§11.14) |
| Automation | AC-AUTO-01…04 (§11.15) |
| AI | AC-AI-01…05 (§11.16, §24.4) |
| Administration | AC-ADM-01…04 (§11.17) |
| Phases | Per-phase criteria in §27 |

### 28.3 Definition of Done (every story)
Code reviewed by a second person or agent run; types and lint clean; unit tests for logic and integration tests for endpoints including the negative permission and cross-tenant cases; activity logging and real-time events where the feature changes shared data; loading/empty/error states in the UI; mobile layout checked; documentation (OpenAPI, README or this PRD) updated.

---

## 29. Risks and Mitigation

| ID | Risk | Likelihood / Impact | Mitigation |
|---|---|---|---|
| R-01 | Cross-tenant data leak through a missed scope in a query or socket room | Medium / Critical | Tenant Prisma extension, param loaders, generated cross-tenant test matrix, PR checklist for raw SQL, optional RLS in Phase 12 |
| R-02 | Scope creep: five reference products' features in one MVP | High / High | Strict MVP tag discipline; Post-MVP items specified but not built; P0/P1 triage weekly |
| R-03 | Kanban/List/Calendar/Gantt complexity and performance with large projects | Medium / High | dnd-kit, virtualization, per-column pagination, fractional indexing, performance budgets tested with 10k-task fixtures; Gantt deferred to Phase 5b |
| R-04 | Real-time inconsistency (missed events, stale caches) | Medium / Medium | Emit after commit, versioned payloads, cache patch + invalidate on ambiguity, reconnect refetch, idempotent handlers |
| R-05 | Razorpay webhook delays, duplicates or plan-change semantics differing from assumptions | Medium / High | Webhooks as source of truth with idempotency, daily reconciliation, "refresh status" action, A-2 verified early in Phase 9 with test mode |
| R-06 | Cross-site cookie problems if the frontend and API end up on different domains | Low (single origin) / High | SPA served by the API on one origin (§26.2); documented CSRF-token fallback; local proxy |
| R-07 | Email deliverability without a custom domain (verification and invitations landing in spam) | High / Medium | Brevo with a verified sender, plain-text alternatives, resend option, "check your spam folder" hint, demo login that needs no email; a custom domain later fixes it |
| R-08 | Cloudinary limits and costs (credits, raw file sizes, bandwidth) | Medium / Medium | Per-plan caps, `f_auto,q_auto`, signed short-lived URLs (no hotlinking), usage alarms, `StorageProvider` abstraction to move to S3/R2 |
| R-09 | Single API instance limits (sockets, jobs in-process) | Low at MVP / Medium | Stateless design, documented scaling path (§26.7), Redis adapter feature flag |
| R-10 | Background job reliability (reminders, emails, purges) | Medium / Medium | pg-boss with retries and dead-letter visibility, idempotent markers (`dueSoonNotifiedAt`), alerting on failed jobs |
| R-11 | OAuth account linking abuse | Low / High | Link only on verified matching email, conflict errors, re-auth for sensitive actions |
| R-12 | Permission matrix drift between frontend and backend | Medium / Medium | Single `can()` function in the shared package used by both; matrix-driven tests |
| R-13 | Analytics queries slow as data grows | Medium / Medium | Indexes on `(organizationId, completedAt)`, `(dueDate)`, 60 s cache, range caps, read replica later |
| R-14 | AI cost overrun or low-quality output | Medium / Low | Quotas, rate limits, token caps, schema validation, human acceptance, kill switch per org and global |
| R-15 | Business decisions (pricing, GST, trial) arriving late | High / Medium | Billing implementation is configuration-driven; placeholders flagged in A-1…A-3; Phase 9 scheduled after MVP |
| R-16 | Accessibility regressions in complex interactions (DnD, editors) | Medium / Medium | dnd-kit keyboard sensor, axe in CI, manual keyboard test in Definition of Done |
| R-17 | Data loss from destructive actions | Low / High | Soft delete with 30-day Trash, typed confirmations, PITR backups, restore drill |
| R-18 | Dependency vulnerabilities / supply chain | Medium / Medium | Lockfile, Dependabot, `pnpm audit` gate, minimal dependency surface |
| R-19 | Regulatory requirements (DPDP Act, GDPR for non-Indian users) | Medium / Medium | Data minimization, deletion flows, processing records, provider DPAs; legal review flagged in A-18 |
| R-20 | Team capacity vs 22-week plan | Medium / Medium | Phase gates with acceptance criteria, P1 slip rules, MVP line fixed at Phase 8 |
| R-21 | Free-tier limits: cold starts, Neon storage and compute, Brevo daily cap, Cloudinary credits, Gemini rate limits | High / Low for a portfolio | Wake-up screen and job catch-up; small seed data and retention jobs; key email types only; plan caps on file size; AI quotas and graceful failure; no keep-alive ping; each provider can be swapped behind its interface |

---

## 30. Future Enhancements

Ordered roughly by expected demand; none are in scope for Phases 1–12.

1. **Multi-factor authentication** (TOTP + recovery codes; org-level enforcement) — first candidate after Phase 12.
2. **Enterprise SSO (SAML/OIDC) and SCIM provisioning**; allowed email domains; IP allowlists.
3. **Public REST API with API keys and outbound webhooks**; rate-limited per key; OpenAPI already available.
4. **Integrations**: Slack/Teams notifications, GitHub/GitLab issue and PR linking, Google Calendar sync of due dates, Zapier.
5. **Importers** from Jira, Trello, Asana, CSV; full organization export (JSON/CSV).
6. **Custom fields** (text, number, select, date, user), **saved views and filters** shared per project, **board swimlanes**.
7. **Sprints/cycles**, story points, velocity and burndown charts; capacity planning per member.
8. **Time tracking** (timers, timesheets, billable flags) and reports.
9. **Docs/wiki and whiteboards** attached to projects; task embedding.
10. **Portfolios and goals/OKRs** across projects and workspaces.
11. **Email digests**, snoozing notifications, Do-Not-Disturb schedules; mobile push via PWA.
12. **Mobile apps** (React Native) and offline support.
13. **Internationalization** (i18n framework, RTL) and localized pricing (multi-currency via Razorpay international or a second provider).
14. **Per-seat billing** option, trials, coupons, annual invoicing for ENTERPRISE, tax automation.
15. **Advanced automation**: OR condition groups, scheduled triggers, webhook actions, cross-project actions, template-based project creation.
16. **AI extensions**: streaming responses, chat over project context, auto-labeling and priority suggestions, duplicate detection, audio meeting transcription.
17. **Platform operations**: Redis caching, read replicas, `ActivityLog` partitioning, Postgres RLS by default, multi-region/data residency, SOC 2 readiness.
18. **Guest commenters without accounts** (magic links), public project read-only sharing links.
19. **Workflow rules** (status transition constraints, required fields per status) for teams that need Jira-like governance.
20. **Customer portal** for agencies (client-facing summaries, approvals).

---

## Appendix A. Assumptions and Unresolved Decisions

### A.1 Assumptions made in this PRD (replace if wrong)

| ID | Assumption | Where used | Impact if changed |
|---|---|---|---|
| A-1 | Billing runs in Razorpay test mode only; PRO ₹999 and BUSINESS ₹2,999 per organization per month are demo prices; yearly = 10 × monthly | §11.14.2, §23.1 | Configuration only (Razorpay plan ids, `PLAN_PRICES`); going live would need a registered business and Razorpay KYC |
| A-2 | Razorpay plan changes: upgrades apply immediately, downgrades at cycle end; proration follows Razorpay's current API behavior; no trial in v1; "resume after cancel" creates a new subscription | §11.14.5, §23.4 | Billing flows in Phase 9; verify with Razorpay docs/test mode first |
| A-3 | Currency INR; no GST handling because no real payments are taken; the optional GSTIN field is kept for realism | §6, §11.14.6, §23.5 | Real billing would need GST-compliant invoices |
| A-4 | Gemini API free tier is the default AI adapter; OpenAI and Anthropic adapters are optional | §11.16.3, §22, §24 | Env var and prompt tuning only |
| A-5 | Transactional email via Brevo's free HTTP API with React Email templates and one verified sender; console provider in development, memory provider in tests | §11.10.1, §16, §22 | `MailProvider` adapter swap |
| A-6 | Plan limit numbers in §23.1 are proposed defaults | FR-FILE-03, FR-DASH-03, §23.1 | Configuration only |
| A-7 | A user may own at most 5 FREE organizations (abuse guard) | §11.2.1 | Configuration |
| A-8 | ADMIN may change MEMBER⇄GUEST and promote to ADMIN but may not alter other ADMINs or the OWNER; only OWNER demotes ADMINs | §11.3, §12.2 | Permission matrix |
| A-9 | GUEST CONTRIBUTORs can comment by default; uploads for guests require the BUSINESS toggle | §11.9, §12.3 | Permission matrix |
| A-10 | Workload capacity default 40 h/week per member | §11.12.2 | Analytics constant (per-user capacity Post-MVP) |
| A-11 | Audit log retention per plan (30/90/365 days) and notification retention 180 days | §11.17.1, §17.3 | Retention jobs |
| A-12 | Gantt built as a custom SVG component; `gantt-task-react` evaluated as fallback | §16 | Phase 5b effort |
| A-13 | Neon free Postgres and one Render free web service, both in US East (Ohio) | §16, §26.1 | The Neon project was created there; keeping Render in the same region keeps database queries fast. Users in India see about 250 ms extra per request, which is fine for a portfolio |
| A-14 | UUID v7 generated in the application for all ids | §17 | Index locality only |
| A-15 | Tasks support multiple assignees (TaskAssignee join); workload counts a task for each assignee | §11.6.3, §17.3 | Single-assignee would simplify UI and analytics |
| A-16 | VIEWER cannot comment (read-only); a "commenter" role is not planned | §11.9, §12.3 | Permission matrix |
| A-17 | Only OWNER/ADMIN invite members in MVP; BUSINESS+ toggle lets MEMBERs invite | §11.3, §12.2 | Permission matrix |
| A-18 | Privacy: India's DPDP Act and GDPR principles are met by minimization, deletion and provider DPAs; formal legal review is outside this PRD | NFR-19, SEC-21 | Possible additional consent/retention features |
| A-19 | Due and start dates are date-only; overdue is evaluated in the viewer's (or assignee's, for reminders) timezone; all timestamps UTC | §11.6.3, §11.10.3 | Time-of-day deadlines would need `timestamptz` + all-day flag |
| A-20 | Indicative durations assume two full-stack developers (or one developer plus an AI coding agent) and no parallel product changes | §1, §27 | Planning only |
| A-21 | Production serves the SPA and the API from one origin on Render (`<app-name>.onrender.com`), so no custom domain is needed | §19.3, §26.2 | A separately hosted frontend would need the CSRF-token fallback |
| A-22 | English-only UI; browser locale for date/number formatting | §5, NFR-20 | i18n later |
| A-23 | Auth events before an organization exists are stored in `ActivityLog` with `organizationId = NULL` (column made nullable for SECURITY rows without a tenant) | §17.3, Phase 2 | Alternatively a separate `UserSecurityLog` table |
| A-25 | Profile photos use Cloudinary's public `upload` delivery with an unguessable random name, not time-limited signed URLs: Cloudinary's expiring delivery URLs need token-based authentication, a paid feature. File attachments (Phase 7) will use private assets served through short-lived download URLs from the API instead | §11.1.6, §11.11, FR-FILE-05 | Revisit if a paid Cloudinary plan is ever used |
| A-26 | The common-password list is a short built-in list of the most-guessed passwords (in `packages/shared/src/auth.ts`) instead of the top 10,000 | §11.1.1 | Swap in a larger list file later if needed |
| A-27 | Seeded sample users all share the demo password `Acme-demo-2026` (development data only; the seed refuses to run when `NODE_ENV=production`) | §17.8 | Demo mode (§26.8) will create per-visitor demo users instead |
| A-24 | Zero-cost constraint: NexusFlow is a portfolio project, so every service must run on a free tier and nothing paid is used | §1, §26.1, §26.8 | Free-tier limits are accepted: cold starts, 0.5 GB database, 300 emails per day, test-mode payments |

### A.2 Decisions (resolved on 2026-11-12 for a zero-cost portfolio build)

| ID | Decision | Choice | Why |
|---|---|---|---|
| D-1 | Pricing model and amounts | Flat price per organization; demo prices ₹999 (PRO) and ₹2,999 (BUSINESS) per month | Simplest with Razorpay; values are configuration |
| D-2 | Free trial | None; the FREE plan acts as the trial | Less billing logic |
| D-3 | Tax and invoicing | Not applicable: Razorpay test mode, no real payments | Portfolio project, no registered business |
| D-4 | AI provider | Gemini API free tier as default; OpenAI and Anthropic adapters optional | Free key from Google AI Studio |
| D-5 | Email provider | Brevo free plan via HTTP API with one verified sender | No domain needed; HTTP avoids SMTP port limits on free hosting |
| D-6 | Database | Neon free PostgreSQL in US East (Ohio) | Free and does not expire; Render's free Postgres is deleted after 30 days |
| D-7 | Domain | None; use `<app-name>.onrender.com` | Free; the single-origin deployment removes the need |
| D-8 | ENTERPRISE sales | "Contact us" email link on the pricing page | No backend needed |
| D-9 | Platform admin | Internal endpoints only, no UI | Saves time |
| D-10 | Assignees | Multiple assignees per task (A-15) | Already designed that way |
| D-11 | Guests | Can comment; uploads off by default; guest counts per §23.1 (A-9) | Safe default |
| D-12 | Error tracking | Sentry free plan, optional, added in Phase 12 | Free |
| D-13 | Brand | Indigo palette and Inter font from §14.3, simple text logo | No designer cost |
| D-14 | Hosting layout | One Render free web service serving SPA, API and Socket.io; demo mode on (§26.8) | Free; first-party cookies; recruiters can try it without signing up |

---

## Appendix B. Glossary

| Term | Meaning |
|---|---|
| Organization (org) | Tenant and billing account; owns workspaces, members, roles, subscription |
| Workspace | Container inside an organization holding teams, projects and labels; plan-limited |
| Team | Group of workspace members with leads; can own projects |
| Project | Container of tasks with key, statuses, milestones, members and roles |
| Task key | Human-readable id `KEY-number`, unique per workspace |
| Status / category | Project-specific column name mapped to one of six fixed categories |
| Subtask | Task with a parent task (one level) |
| Dependency | "Blocking → blocked" relation between tasks of the same project |
| Guest | Organization role for external collaborators limited to explicit projects |
| Plan guard | Server-side check of plan limits and features (HTTP 402) |
| Activity log | Append-only record of domain, security and billing events; the audit log is a filtered view |
| EventBus | In-process publisher that fans domain events out to sockets and jobs |
| pg-boss | PostgreSQL-backed job queue used for background work |
| Signed upload | Browser upload to Cloudinary authorized by a server-generated signature |
| Authenticated delivery | Cloudinary delivery type requiring a signed URL |
| Webhook event | Stored provider callback used for idempotent billing processing |
| MVP | Phases 1–8 as defined in §27 |

---

## Appendix C. Requirement Traceability (request → PRD)

| Request section | PRD coverage |
|---|---|
| 1 Product overview | §1, §2 |
| 2 Target users | §6, §7 |
| 3 Multi-tenant architecture | §9.1, §15.5, §17.5, §20 |
| 4 User authentication | §9.2, §11.1, §19 |
| 5 Role-based access control | §9.3, §12, §19.6 |
| 6 Workspace management | §9.4, §11.2, §11.3 |
| 7 Team management | §9.5, §11.4 |
| 8 Project management | §9.6, §11.5 |
| 9 Task management | §9.7, §11.6 |
| 10 Project views | §9.8, §11.7 |
| 11 Real-time collaboration | §9.9, §11.8, §18.9 |
| 12 Comments and communication | §9.10, §11.9 |
| 13 Notification system | §9.11, §11.10 |
| 14 File management | §9.12, §11.11 |
| 15 Dashboard and analytics | §9.13, §11.12 |
| 16 Search and filtering | §9.14, §11.13 |
| 17 SaaS subscription and billing | §9.15, §11.14, §23 |
| 18 Automation engine | §9.16, §11.15 |
| 19 AI-powered features | §9.17, §11.16, §24 |
| 20 Administration | §9.18, §11.17 |
| 21 UI/UX requirements | §14 |
| 22 Technology stack | §16 |
| 23 Database design | §17 |
| 24 Backend architecture | §15, §18 |
| 25 Security requirements | §21 |
| 26 Non-functional requirements | §10 |
| 27 Testing requirements | §25 |
| 28 Development phases | §27 |
| 29 Required PRD structure | Sections 1–30 of this document |
| 30 Important instructions | MVP tags throughout; assumptions and decisions in Appendix A; acceptance criteria in §11, §27, §28 |

---

## Appendix D. Environment Variables

All variables are validated at startup (`apps/api/src/config/env.ts`, `apps/web/src/lib/env.ts`). Secrets are marked 🔒.

**API (`apps/api`)**

| Variable | Example / notes |
|---|---|
| `NODE_ENV` | `development` · `test` · `production` |
| `PORT` | `4000` |
| `APP_URL` | `https://nexusflow.onrender.com` (links in emails, OAuth redirects) |
| `API_URL` | Same as `APP_URL` in the single-service deployment |
| `WEB_ORIGINS` | Comma-separated CORS/CSRF allowlist |
| `DATABASE_URL` 🔒 | Neon pooled connection string; the 15 s connection timeout is set in code (`apps/api/src/lib/prisma.ts`) |
| `DIRECT_DATABASE_URL` 🔒 | Direct connection for migrations |
| `SESSION_COOKIE_NAME` / `COOKIE_DOMAIN` / `COOKIE_SAMESITE` | `nf_session` / empty (host-only cookie) / `lax` (`none` only for a separately hosted frontend) |
| `SESSION_TTL_DAYS` / `SESSION_ABSOLUTE_TTL_DAYS` | `30` / `90` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 🔒 | Optional; "Continue with Google" stays hidden while empty. The redirect URI is always `${APP_URL}/api/v1/auth/google/callback`, and the OAuth state lives in a short-lived HttpOnly cookie, so no extra signing secret is needed |
| `MAIL_PROVIDER` / `BREVO_API_KEY` 🔒 / `MAIL_FROM` | `brevo` in production, `console` in development, `memory` in tests / Brevo API key (required when `brevo`) / `NexusFlow <your-verified-sender@gmail.com>` |
| `MAIL_DAILY_CAP` | `300` (Brevo free limit; emails beyond it are skipped and logged) |
| `TEST_DATABASE_URL` 🔒 | Neon `test` branch connection string used by integration tests |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` 🔒 / `CLOUDINARY_FOLDER_PREFIX` | `nexusflow/production` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` 🔒 / `RAZORPAY_WEBHOOK_SECRET` 🔒 | Phase 9 |
| `RAZORPAY_PLAN_PRO_MONTHLY` / `..._PRO_YEARLY` / `..._BUSINESS_MONTHLY` / `..._BUSINESS_YEARLY` | Razorpay plan ids |
| `AI_PROVIDER` / `AI_API_KEY` 🔒 / `AI_MODEL` | `gemini` (default, free tier) · `openai` · `anthropic`; unset disables AI |
| `WORKERS_ENABLED` / `HTTP_ENABLED` | `true`/`true` (MVP single process) |
| `RATE_LIMIT_TRUST_PROXY` | `1` behind Render's proxy |
| `RATE_LIMIT_GENERAL_PER_MINUTE` / `RATE_LIMIT_AUTH_PER_MINUTE` | `300` / `10` requests per minute per visitor |
| `INTERNAL_IP_ALLOWLIST` | Comma-separated CIDRs for `/api/internal` |
| `SENTRY_DSN` | Optional |
| `LOG_LEVEL` | `info` |
| `DEMO_MODE` / `DEMO_RESET_HOURS` | `true` enables the "Try the demo" login and demo reset (§26.8) / `24` |

**Web (`apps/web`)**

| Variable | Notes |
|---|---|
| `VITE_API_URL` | `/api/v1` (same origin in development via the proxy and in production) |
| `VITE_SOCKET_URL` | Empty (same origin) |
| `VITE_RAZORPAY_KEY_ID` | Publishable key (Phase 9) |
| `VITE_CLOUDINARY_CLOUD_NAME` | For building upload URLs |
| `VITE_SENTRY_DSN` | Optional |
| `VITE_APP_ENV` | `development` · `staging` · `production` |

---

*End of document. Changes to scope, data model, API or permissions must be reflected here before implementation.*
