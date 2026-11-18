import { canInOrg, ORG_PERMISSIONS, ORG_ROLES, type OrgPermission } from "@nexusflow/shared";
import { Check, Minus } from "lucide-react";
import { SettingsPage } from "../../../components/common/SettingsSection";
import type { WorkspaceContext } from "../../../hooks/useWorkspace";
import { ORG_ROLE_LABELS, PERMISSION_LABELS } from "../labels";

// Settings › Roles and permissions (PRD §12.2): the matrix the API enforces,
// read from the same shared rules. Custom permissions are a Business feature (later).
export function PermissionsSettings({ context }: { context: WorkspaceContext }) {
  const permissions = Object.keys(ORG_PERMISSIONS) as OrgPermission[];
  return (
    <SettingsPage
      title="Roles and permissions"
      description={`Who can do what in ${context.organization.name}. Your role: ${ORG_ROLE_LABELS[context.role]}.`}
    >
      <div className="overflow-x-auto rounded-card border bg-card shadow-sm">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th scope="col" className="px-4 py-3 font-medium">
                Permission
              </th>
              {ORG_ROLES.map((role) => (
                <th key={role} scope="col" className="px-3 py-3 text-center font-medium">
                  {ORG_ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {permissions.map((permission) => (
              <tr key={permission}>
                <th scope="row" className="px-4 py-2.5 text-left font-normal">
                  {PERMISSION_LABELS[permission]}
                </th>
                {ORG_ROLES.map((role) => (
                  <td key={role} className="px-3 py-2.5 text-center">
                    {canInOrg(role, permission) ? (
                      <Check className="mx-auto size-4 text-success" aria-label="Allowed" />
                    ) : (
                      <Minus
                        className="mx-auto size-4 text-muted-foreground/50"
                        aria-label="Not allowed"
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">
        Workspace admins also manage their own workspace&apos;s name and members. Project roles
        arrive with projects in Phase 4.
      </p>
    </SettingsPage>
  );
}
