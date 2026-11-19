import type { OrgRole } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";

/**
 * Checks that someone may be picked for something inside a workspace (team
 * lead, project owner, team or project member) and returns their
 * organization role. Owners and admins count as members of every workspace.
 * Guests are refused unless `allowGuests` (projects can be shared with guests).
 */
export async function assertWorkspacePerson(
  tenant: Tenant,
  workspaceId: string,
  userId: string,
  { allowGuests = false } = {},
): Promise<OrgRole> {
  const organizationId = tenant.organization.id;
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  if (!member) throw new AppError(404, "NOT_FOUND", "This person is not in the organization");
  if (member.role === "GUEST") {
    if (allowGuests) return member.role;
    throw new AppError(400, "VALIDATION_ERROR", "Guests can only be added to projects");
  }
  if (member.role === "OWNER" || member.role === "ADMIN") return member.role;
  const inWorkspace = await prisma.workspaceMember.count({ where: { workspaceId, userId } });
  if (inWorkspace === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Add this person to the workspace first");
  }
  return member.role;
}
