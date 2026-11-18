// TEMPORARY sample data for the app layout (Phase 1 step 7b).
// It mirrors the seeded "Acme Studio" organization so the sidebar and switcher
// have something real-looking to show. Phase 3 replaces this file with data
// from GET /api/v1/orgs/:org/context (PRD §20.5), and Phase 2 with the
// signed-in user.

export interface SampleWorkspace {
  slug: string;
  name: string;
}

export interface SampleProject {
  key: string;
  name: string;
  /** Tailwind class for the small colored square next to the name. */
  colorClass: string;
}

export interface SampleOrganization {
  slug: string;
  name: string;
  plan: "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";
  workspaces: SampleWorkspace[];
  projects: Record<string, SampleProject[]>;
}

export const SAMPLE_ORGANIZATIONS: SampleOrganization[] = [
  {
    slug: "acme",
    name: "Acme Studio",
    plan: "PRO",
    workspaces: [
      { slug: "general", name: "General" },
      { slug: "marketing", name: "Marketing" },
    ],
    projects: {
      general: [
        { key: "NEX", name: "NexusFlow Web App", colorClass: "bg-status-in-progress" },
        { key: "MOB", name: "Mobile Redesign", colorClass: "bg-status-in-review" },
        { key: "API", name: "Public API Platform", colorClass: "bg-status-todo" },
      ],
      marketing: [
        { key: "LCH", name: "Q1 Launch Campaign", colorClass: "bg-priority-high" },
        { key: "BRD", name: "Brand Refresh", colorClass: "bg-status-done" },
      ],
    },
  },
];

/** Unread notifications shown on the Inbox badge. */
export const SAMPLE_UNREAD_COUNT = 3;

export function findOrganization(slug: string | undefined) {
  return SAMPLE_ORGANIZATIONS.find((org) => org.slug === slug);
}
