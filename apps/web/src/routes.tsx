import {
  Bell,
  CalendarDays,
  ChartColumn,
  ChartGantt,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  List,
  ListTodo,
  LockKeyhole,
  Search,
  Settings,
  SquareKanban,
  Users,
} from "lucide-react";
import { lazy } from "react";
import { Navigate, useParams, type RouteObject } from "react-router";
import { AppShell } from "./layouts/AppShell";
import { PublicLayout } from "./layouts/PublicLayout";
import { findOrganization } from "./lib/sampleData";
import { crumb } from "./lib/routeHandle";
import { OrgSettingsPage, TaskPage, TeamPage } from "./pages/DynamicPages";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlaceholderPage, type PlaceholderPageProps } from "./pages/PlaceholderPage";
import { ORG_SETTINGS_SECTIONS } from "./pages/settings/orgSettingsSections";

// Bigger pages load only when first visited, keeping the first download small.
// While one loads, the layout shows a skeleton (PRD §14.4, §14.7).
const HomePage = lazy(() => import("./pages/HomePage"));
const ProjectLayout = lazy(() => import("./pages/ProjectLayout"));
const ProfileSettingsPage = lazy(() => import("./pages/settings/ProfileSettingsPage"));

/** A route that shows a placeholder page and its breadcrumb label. */
function placeholder(path: string, page: PlaceholderPageProps, label = page.title): RouteObject {
  return { path, element: <PlaceholderPage {...page} />, handle: crumb(label) };
}

/** A public page (no sidebar) that a later phase builds. */
function publicPage(path: string, title: string, phase: string, comingSoon: string): RouteObject {
  return {
    path,
    element: (
      <div className="w-full max-w-md">
        <PlaceholderPage
          title={title}
          description=""
          phase={phase}
          comingSoon={comingSoon}
          icon={LockKeyhole}
        />
      </div>
    ),
  };
}

/** /acme -> /acme/general/home (the organization's first workspace). */
function OrganizationRedirect() {
  const { orgSlug } = useParams();
  const firstWorkspace = findOrganization(orgSlug)?.workspaces[0];
  if (!firstWorkspace) return <NotFoundPage />;
  return <Navigate to={`/${orgSlug}/${firstWorkspace.slug}/home`} replace />;
}

// Every address in the app (PRD §14.2). More specific paths win, so
// "/acme/settings/..." goes to settings, not to a workspace named "settings".
export const routes: RouteObject[] = [
  // Until sign-in exists (Phase 2), open the sample workspace.
  { path: "/", element: <Navigate to="/acme/general/home" replace /> },

  {
    element: <PublicLayout />,
    children: [
      publicPage(
        "login",
        "Log in",
        "Phase 2",
        "Email and password sign-in, plus Continue with Google.",
      ),
      publicPage(
        "register",
        "Create your account",
        "Phase 2",
        "Sign up with name, email and password, or with Google.",
      ),
      publicPage(
        "verify-email",
        "Verify your email",
        "Phase 2",
        "Confirms your email address from the link we send.",
      ),
      publicPage(
        "forgot-password",
        "Forgot password",
        "Phase 2",
        "Request a password reset link by email.",
      ),
      publicPage(
        "reset-password",
        "Choose a new password",
        "Phase 2",
        "Set a new password from the reset link.",
      ),
      publicPage(
        "invite/:token",
        "Join an organization",
        "Phase 3",
        "Accept or decline an invitation.",
      ),
      publicPage(
        "onboarding",
        "Set up your organization",
        "Phase 3",
        "Name your organization and invite your team.",
      ),
      publicPage(
        "pricing",
        "Pricing",
        "Phase 8",
        "Compare the Free, Pro, Business and Enterprise plans.",
      ),
      publicPage(
        "goodbye",
        "Account deleted",
        "Phase 2",
        "Confirms that your account and personal data were removed.",
      ),
    ],
  },

  { path: "/:orgSlug", element: <OrganizationRedirect /> },

  {
    path: "/:orgSlug/settings",
    element: <AppShell />,
    handle: crumb("Settings"),
    children: [
      { index: true, element: <Navigate to="profile" replace /> },
      { path: "profile", element: <ProfileSettingsPage />, handle: crumb("Profile") },
      placeholder("notifications", {
        title: "Notifications",
        description: "Choose which notifications you get in the app and by email.",
        phase: "Phase 7",
        comingSoon: "An in-app and an email switch for every notification type.",
        icon: Bell,
      }),
      placeholder("security", {
        title: "Security",
        description: "Password, active sessions and account deletion.",
        phase: "Phase 2",
        comingSoon: "Change your password, sign out other devices and delete your account.",
        icon: LockKeyhole,
      }),
      { path: "org", element: <Navigate to="general" replace /> },
      {
        path: "org/:section",
        element: <OrgSettingsPage />,
        handle: crumb(
          (params) => ORG_SETTINGS_SECTIONS[params["section"] ?? ""]?.title ?? "Settings",
        ),
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },

  {
    path: "/:orgSlug/:workspaceSlug",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="home" replace /> },
      { path: "home", element: <HomePage />, handle: crumb("Home") },
      placeholder("my-tasks", {
        title: "My tasks",
        description: "Everything assigned to you, across all projects.",
        phase: "Phase 5",
        comingSoon: "Your tasks grouped into Overdue, Today, This week, Later and No date.",
        icon: ListTodo,
      }),
      placeholder("inbox", {
        title: "Inbox",
        description: "Notifications about your tasks, mentions and invitations.",
        phase: "Phase 7",
        comingSoon: "Live notifications with All, Unread and Mentions tabs.",
        icon: Inbox,
      }),
      placeholder("projects", {
        title: "Projects",
        description: "Every project in this workspace.",
        phase: "Phase 4",
        comingSoon: "Project cards with progress, health, owners and dates.",
        icon: FolderKanban,
      }),
      {
        path: "projects/:projectKey",
        element: <ProjectLayout />,
        handle: crumb((params) => params["projectKey"] ?? ""),
        children: [
          { index: true, element: <Navigate to="board" replace /> },
          placeholder("board", {
            title: "Board",
            description: "Drag tasks between columns.",
            phase: "Phase 5",
            comingSoon:
              "Kanban columns for each status, with priority, assignees and due dates on every card.",
            icon: SquareKanban,
          }),
          placeholder("list", {
            title: "List",
            description: "All tasks in a sortable table.",
            phase: "Phase 5",
            comingSoon: "A table with inline editing, filters, sorting and bulk actions.",
            icon: List,
          }),
          placeholder("calendar", {
            title: "Calendar",
            description: "Tasks and milestones by due date.",
            phase: "Phase 5",
            comingSoon: "Month and week views; drag a task to another day to reschedule it.",
            icon: CalendarDays,
          }),
          placeholder("timeline", {
            title: "Timeline",
            description: "Tasks as bars over time, with dependencies.",
            phase: "Phase 5b",
            comingSoon: "A Gantt chart with milestones and dependency arrows.",
            icon: ChartGantt,
          }),
          placeholder("overview", {
            title: "Overview",
            description: "Progress, health and workload for this project.",
            phase: "Phase 8",
            comingSoon: "Completion, overdue tasks, workload per person and recent activity.",
            icon: LayoutDashboard,
          }),
          placeholder(
            "settings",
            {
              title: "Project settings",
              description: "Details, members, statuses and milestones.",
              phase: "Phase 4",
              comingSoon:
                "Edit the project, manage members and roles, and customize board columns.",
              icon: Settings,
            },
            "Settings",
          ),
        ],
      },
      {
        path: "tasks/:taskKey",
        element: <TaskPage />,
        handle: crumb((params) => params["taskKey"] ?? ""),
      },
      placeholder("teams", {
        title: "Teams",
        description: "Groups of people who work together.",
        phase: "Phase 4",
        comingSoon: "Teams with leads, members and their projects.",
        icon: Users,
      }),
      {
        path: "teams/:teamSlug",
        element: <TeamPage />,
        handle: crumb((params) => params["teamSlug"] ?? ""),
      },
      placeholder("insights", {
        title: "Insights",
        description: "Charts about projects, tasks and team workload.",
        phase: "Phase 8",
        comingSoon: "Completion trends, status and priority breakdowns, and team productivity.",
        icon: ChartColumn,
      }),
      placeholder("search", {
        title: "Search",
        description: "Find projects, tasks, teams, people and comments.",
        phase: "Phase 8",
        comingSoon:
          "Search across everything you can access, with filters. Ctrl+K opens it from anywhere.",
        icon: Search,
      }),
      placeholder(
        "settings",
        {
          title: "Workspace settings",
          description: "Name, members, labels and branding.",
          phase: "Phase 3",
          comingSoon: "Rename the workspace, manage its members and labels, and set its logo.",
          icon: Settings,
        },
        "Settings",
      ),
      { path: "*", element: <NotFoundPage /> },
    ],
  },

  { path: "*", element: <NotFoundPage /> },
];
