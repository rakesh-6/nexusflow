import type { OrgPermission } from "@nexusflow/shared";

interface OrgSettingsSection {
  title: string;
  description: string;
  /** Who sees the section; without one, every member except guests. */
  permission?: OrgPermission;
  /** Sections a later phase builds show a "coming soon" placeholder. */
  phase: string;
  comingSoon: string;
}

// The organization admin panel sections (PRD §11.17.1, route map §14.2), in menu order.
export const ORG_SETTINGS_SECTIONS: Record<string, OrgSettingsSection> = {
  general: {
    title: "Organization",
    description: "Name, address, ownership and danger zone.",
    phase: "Phase 3",
    comingSoon: "",
  },
  members: {
    title: "Members",
    description: "Everyone in the organization and their roles.",
    permission: "members:read",
    phase: "Phase 3",
    comingSoon: "",
  },
  invitations: {
    title: "Invitations",
    description: "Invite people by email and manage pending invitations.",
    permission: "members:invite",
    phase: "Phase 3",
    comingSoon: "",
  },
  teams: {
    title: "Teams",
    description: "All teams across workspaces.",
    permission: "members:manage",
    phase: "Phase 4",
    comingSoon: "Review every team, its lead, members and projects.",
  },
  projects: {
    title: "Projects",
    description: "All projects, including private ones, and the trash.",
    permission: "members:manage",
    phase: "Phase 4",
    comingSoon: "Archive, restore and delete projects, and recover them from the trash.",
  },
  permissions: {
    title: "Roles and permissions",
    description: "Who can do what in this organization.",
    phase: "Phase 3",
    comingSoon: "",
  },
  billing: {
    title: "Billing",
    description: "Plan, invoices and payment status.",
    permission: "billing:manage",
    phase: "Phase 9",
    comingSoon: "Upgrade, downgrade or cancel with Razorpay test mode, and see invoices.",
  },
  usage: {
    title: "Usage",
    description: "Members, workspaces and storage against your plan.",
    permission: "usage:read",
    phase: "Phase 3",
    comingSoon: "",
  },
  audit: {
    title: "Audit log",
    description: "Security and billing history.",
    permission: "audit:read",
    phase: "Phase 3",
    comingSoon: "",
  },
  automations: {
    title: "Automations",
    description: "Rules that run automatically.",
    permission: "members:manage",
    phase: "Phase 10",
    comingSoon: "Create rules like “when a task is done, notify the project manager”.",
  },
  ai: {
    title: "AI features",
    description: "AI settings and usage.",
    permission: "members:manage",
    phase: "Phase 11",
    comingSoon: "Turn AI on or off for the organization and see monthly usage.",
  },
};
