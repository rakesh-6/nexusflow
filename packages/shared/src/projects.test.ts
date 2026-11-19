import { describe, expect, it } from "vitest";
import {
  createProjectSchema,
  projectAccess,
  resolveProjectRole,
  suggestProjectKey,
  type ProjectAccessInput,
} from "./projects.ts";

const member = (overrides: Partial<ProjectAccessInput> = {}): ProjectAccessInput => ({
  orgRole: "MEMBER",
  workspaceRole: "WORKSPACE_MEMBER",
  explicitRole: null,
  teamRole: null,
  visibility: "WORKSPACE",
  ...overrides,
});

describe("resolveProjectRole (PRD §12.4)", () => {
  it("makes organization owners and admins project managers everywhere", () => {
    for (const orgRole of ["OWNER", "ADMIN"] as const) {
      expect(
        resolveProjectRole(member({ orgRole, workspaceRole: null, visibility: "PRIVATE" })),
      ).toBe("PROJECT_MANAGER");
    }
  });

  it("lets workspace members view WORKSPACE projects but not PRIVATE ones (AC-PROJ-04)", () => {
    expect(resolveProjectRole(member())).toBe("VIEWER");
    expect(resolveProjectRole(member({ visibility: "PRIVATE" }))).toBeNull();
    expect(resolveProjectRole(member({ workspaceRole: null }))).toBeNull();
  });

  it("gives team members CONTRIBUTOR and team leads PROJECT_MANAGER on team projects", () => {
    expect(resolveProjectRole(member({ visibility: "PRIVATE", teamRole: "MEMBER" }))).toBe(
      "CONTRIBUTOR",
    );
    expect(resolveProjectRole(member({ visibility: "PRIVATE", teamRole: "LEAD" }))).toBe(
      "PROJECT_MANAGER",
    );
  });

  it("takes the highest of explicit, team and workspace roles", () => {
    expect(resolveProjectRole(member({ explicitRole: "VIEWER", teamRole: "MEMBER" }))).toBe(
      "CONTRIBUTOR",
    );
    expect(resolveProjectRole(member({ explicitRole: "PROJECT_MANAGER" }))).toBe("PROJECT_MANAGER");
    expect(
      resolveProjectRole(member({ workspaceRole: "WORKSPACE_ADMIN", visibility: "PRIVATE" })),
    ).toBe("PROJECT_MANAGER");
  });

  it("gives guests only their explicit role, capped at CONTRIBUTOR", () => {
    const guest = (explicitRole: ProjectAccessInput["explicitRole"]) =>
      resolveProjectRole(member({ orgRole: "GUEST", workspaceRole: null, explicitRole }));
    expect(guest(null)).toBeNull();
    expect(guest("VIEWER")).toBe("VIEWER");
    expect(guest("PROJECT_MANAGER")).toBe("CONTRIBUTOR");
  });
});

describe("projectAccess", () => {
  it("lets team leads manage but not delete or change statuses (PRD §12.3)", () => {
    const lead = projectAccess(member({ teamRole: "LEAD" }));
    expect(lead).toMatchObject({ canManage: true, canAdminister: false });
  });

  it("lets explicit project managers and workspace admins do everything", () => {
    expect(projectAccess(member({ explicitRole: "PROJECT_MANAGER" }))?.canAdminister).toBe(true);
    expect(projectAccess(member({ workspaceRole: "WORKSPACE_ADMIN" }))?.canAdminister).toBe(true);
  });

  it("keeps viewers read-only and returns null without access", () => {
    expect(projectAccess(member())).toMatchObject({
      role: "VIEWER",
      canManage: false,
      canContribute: false,
    });
    expect(projectAccess(member({ visibility: "PRIVATE" }))).toBeNull();
  });
});

describe("project keys and dates", () => {
  it("suggests a key from the name", () => {
    expect(suggestProjectKey("NexusFlow Web App")).toBe("NWA");
    expect(suggestProjectKey("Marketing")).toBe("MAR");
    expect(suggestProjectKey("Q1 launch campaign!")).toBe("QLC");
    expect(suggestProjectKey("x")).toBe("XX");
  });

  it("accepts only 2-6 letters or digits and an end date on or after the start", () => {
    const base = { name: "Website", key: "web" };
    expect(createProjectSchema.parse(base).key).toBe("WEB");
    expect(createProjectSchema.safeParse({ ...base, key: "TOOLONGKEY" }).success).toBe(false);
    expect(
      createProjectSchema.safeParse({ ...base, startDate: "2026-12-01", endDate: "2026-11-01" })
        .success,
    ).toBe(false);
  });
});
