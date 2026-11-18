import { describe, expect, it } from "vitest";
import {
  canChangeRole,
  canInOrg,
  canManageWorkspace,
  canRemoveMember,
  orgPermissionsFor,
} from "./permissions.ts";

// The permission matrix from PRD §12.2, checked cell by cell.
describe("organization permissions (PRD §12.2)", () => {
  it.each([
    ["org:update", { OWNER: true, ADMIN: true, MEMBER: false, GUEST: false }],
    ["org:delete", { OWNER: true, ADMIN: false, MEMBER: false, GUEST: false }],
    ["org:transfer", { OWNER: true, ADMIN: false, MEMBER: false, GUEST: false }],
    ["billing:manage", { OWNER: true, ADMIN: false, MEMBER: false, GUEST: false }],
    ["usage:read", { OWNER: true, ADMIN: true, MEMBER: false, GUEST: false }],
    ["audit:read", { OWNER: true, ADMIN: true, MEMBER: false, GUEST: false }],
    ["members:read", { OWNER: true, ADMIN: true, MEMBER: true, GUEST: false }],
    ["members:invite", { OWNER: true, ADMIN: true, MEMBER: false, GUEST: false }],
    ["members:manage", { OWNER: true, ADMIN: true, MEMBER: false, GUEST: false }],
    ["workspace:create", { OWNER: true, ADMIN: true, MEMBER: false, GUEST: false }],
  ] as const)("%s", (permission, expected) => {
    for (const [role, allowed] of Object.entries(expected)) {
      expect(canInOrg(role as keyof typeof expected, permission), `${role} ${permission}`).toBe(
        allowed,
      );
    }
  });

  it("lists a role's permissions", () => {
    expect(orgPermissionsFor("GUEST")).toEqual([]);
    expect(orgPermissionsFor("MEMBER")).toEqual(["members:read"]);
  });
});

describe("role changes (PRD A-8)", () => {
  it("never makes or unmakes an OWNER, and nobody changes their own role", () => {
    expect(canChangeRole("OWNER", "ADMIN", "OWNER", false)).toBe(false);
    expect(canChangeRole("OWNER", "OWNER", "ADMIN", false)).toBe(false);
    expect(canChangeRole("ADMIN", "ADMIN", "MEMBER", true)).toBe(false);
  });

  it("lets an OWNER change anyone else and an ADMIN change only members and guests", () => {
    expect(canChangeRole("OWNER", "ADMIN", "MEMBER", false)).toBe(true);
    expect(canChangeRole("ADMIN", "MEMBER", "ADMIN", false)).toBe(true);
    expect(canChangeRole("ADMIN", "GUEST", "MEMBER", false)).toBe(true);
    expect(canChangeRole("ADMIN", "ADMIN", "MEMBER", false)).toBe(false);
    expect(canChangeRole("MEMBER", "GUEST", "MEMBER", false)).toBe(false);
  });

  it("follows the same rules for removing people", () => {
    expect(canRemoveMember("OWNER", "ADMIN", false)).toBe(true);
    expect(canRemoveMember("ADMIN", "ADMIN", false)).toBe(false);
    expect(canRemoveMember("ADMIN", "GUEST", false)).toBe(true);
    expect(canRemoveMember("OWNER", "OWNER", true)).toBe(false);
  });

  it("lets owners, admins and workspace admins manage a workspace", () => {
    expect(canManageWorkspace("MEMBER", "WORKSPACE_ADMIN")).toBe(true);
    expect(canManageWorkspace("MEMBER", "WORKSPACE_MEMBER")).toBe(false);
    expect(canManageWorkspace("ADMIN", null)).toBe(true);
  });
});
