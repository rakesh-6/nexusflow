// The organization admin panel sections (PRD §11.17.1, route map §14.2).
export const ORG_SETTINGS_SECTIONS: Record<
  string,
  { title: string; description: string; phase: string; comingSoon: string }
> = {
  general: {
    title: "Organization",
    description: "Name, address, logo and danger zone.",
    phase: "Phase 3",
    comingSoon:
      "Rename the organization, change its address, upload a logo, transfer or delete it.",
  },
  members: {
    title: "Members",
    description: "Everyone in the organization and their roles.",
    phase: "Phase 3",
    comingSoon: "Search members, change roles and remove people.",
  },
  invitations: {
    title: "Invitations",
    description: "Pending email invitations.",
    phase: "Phase 3",
    comingSoon: "Invite people by email, resend or revoke invitations.",
  },
  teams: {
    title: "Teams",
    description: "All teams across workspaces.",
    phase: "Phase 4",
    comingSoon: "Review every team, its lead, members and projects.",
  },
  projects: {
    title: "Projects",
    description: "All projects, including private ones, and the trash.",
    phase: "Phase 4",
    comingSoon: "Archive, restore and delete projects, and recover them from the trash.",
  },
  permissions: {
    title: "Roles and permissions",
    description: "Who can do what.",
    phase: "Phase 3",
    comingSoon: "See the permission matrix; Business plans can switch extra permissions on or off.",
  },
  billing: {
    title: "Billing",
    description: "Plan, invoices and payment status.",
    phase: "Phase 9",
    comingSoon: "Upgrade, downgrade or cancel with Razorpay test mode, and see invoices.",
  },
  usage: {
    title: "Usage",
    description: "Members, workspaces, projects and storage against your plan.",
    phase: "Phase 3",
    comingSoon: "Bars showing how much of each plan limit is used.",
  },
  audit: {
    title: "Audit log",
    description: "Security and billing history.",
    phase: "Phase 3",
    comingSoon: "Filter who did what and when, and export it as CSV.",
  },
  automations: {
    title: "Automations",
    description: "Rules that run automatically.",
    phase: "Phase 10",
    comingSoon: "Create rules like “when a task is done, notify the project manager”.",
  },
  ai: {
    title: "AI features",
    description: "AI settings and usage.",
    phase: "Phase 11",
    comingSoon: "Turn AI on or off for the organization and see monthly usage.",
  },
};
