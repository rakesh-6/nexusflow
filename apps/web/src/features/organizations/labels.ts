import type { OrgPermission, OrgRole, WorkspaceRole } from "@nexusflow/shared";

// Words shown to people for the API's codes.

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  GUEST: "Guest",
};

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  WORKSPACE_ADMIN: "Workspace admin",
  WORKSPACE_MEMBER: "Workspace member",
};

export const PERMISSION_LABELS: Record<OrgPermission, string> = {
  "org:update": "Rename the organization and change its address",
  "org:delete": "Delete the organization",
  "org:transfer": "Transfer ownership",
  "billing:manage": "Manage the plan and billing",
  "usage:read": "See usage against plan limits",
  "audit:read": "Read the audit log",
  "members:read": "See the member list",
  "members:invite": "Invite people and manage invitations",
  "members:manage": "Change roles and remove people",
  "workspace:create": "Create, archive and delete workspaces",
};

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
