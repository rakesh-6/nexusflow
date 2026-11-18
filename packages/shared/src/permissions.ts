// Who may do what in an organization (PRD §12). The API enforces these rules;
// the web app uses the same functions only to hide buttons people cannot use.

export const ORG_ROLES = ["OWNER", "ADMIN", "MEMBER", "GUEST"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const WORKSPACE_ROLES = ["WORKSPACE_ADMIN", "WORKSPACE_MEMBER"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Organization-level permissions and the roles that have them (PRD §12.2). */
export const ORG_PERMISSIONS = {
  "org:update": ["OWNER", "ADMIN"],
  "org:delete": ["OWNER"],
  "org:transfer": ["OWNER"],
  "billing:manage": ["OWNER"],
  "usage:read": ["OWNER", "ADMIN"],
  "audit:read": ["OWNER", "ADMIN"],
  "members:read": ["OWNER", "ADMIN", "MEMBER"],
  "members:invite": ["OWNER", "ADMIN"],
  "members:manage": ["OWNER", "ADMIN"],
  "workspace:create": ["OWNER", "ADMIN"],
} as const satisfies Record<string, readonly OrgRole[]>;

export type OrgPermission = keyof typeof ORG_PERMISSIONS;

export function canInOrg(role: OrgRole, permission: OrgPermission): boolean {
  return (ORG_PERMISSIONS[permission] as readonly OrgRole[]).includes(role);
}

/** Every organization permission the role has, e.g. for the web app's menus. */
export function orgPermissionsFor(role: OrgRole): OrgPermission[] {
  return (Object.keys(ORG_PERMISSIONS) as OrgPermission[]).filter((p) => canInOrg(role, p));
}

/** Owners and admins manage every workspace; others only where they are workspace admin. */
export function canManageWorkspace(orgRole: OrgRole, workspaceRole: WorkspaceRole | null): boolean {
  return orgRole === "OWNER" || orgRole === "ADMIN" || workspaceRole === "WORKSPACE_ADMIN";
}

/**
 * May `actor` change `target`'s role to `newRole`? (PRD §12.2, A-8)
 * - Nobody becomes or stops being OWNER this way; that is a transfer.
 * - Nobody changes their own role.
 * - OWNER may change anyone else. ADMIN may change MEMBER and GUEST, and may
 *   promote them to ADMIN, but may not change another ADMIN.
 */
export function canChangeRole(
  actorRole: OrgRole,
  targetRole: OrgRole,
  newRole: OrgRole,
  isSelf: boolean,
): boolean {
  if (isSelf || targetRole === "OWNER" || newRole === "OWNER") return false;
  if (actorRole === "OWNER") return true;
  if (actorRole === "ADMIN") return targetRole === "MEMBER" || targetRole === "GUEST";
  return false;
}

/** May `actor` remove `target` from the organization? OWNER: anyone else. ADMIN: members and guests. */
export function canRemoveMember(actorRole: OrgRole, targetRole: OrgRole, isSelf: boolean): boolean {
  if (isSelf || targetRole === "OWNER") return false;
  if (actorRole === "OWNER") return true;
  if (actorRole === "ADMIN") return targetRole === "MEMBER" || targetRole === "GUEST";
  return false;
}

/** Roles an invitation can grant (never OWNER). */
export const INVITABLE_ROLES = ["ADMIN", "MEMBER", "GUEST"] as const;
