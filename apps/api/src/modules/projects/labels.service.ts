import type { Workspace } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { AppError } from "../../utils/errors.ts";
import { loadWorkspace } from "../organizations/workspaces.service.ts";

// Labels: colored tags shared by every project in a workspace (PRD §12.3).
// Workspace admins and project managers in that workspace may manage them.

const toLabelDto = (label: { id: string; name: string; color: string }) => ({
  id: label.id,
  name: label.name,
  color: label.color,
});

const nameTaken = () =>
  new AppError(409, "LABEL_NAME_TAKEN", "A label with this name already exists", [
    { path: "body.name", message: "A label with this name already exists" },
  ]);

const isUniqueViolation = (error: unknown) => (error as { code?: string }).code === "P2002";

export async function canManageLabels(
  workspaceId: string,
  userId: string,
  canManageWorkspace: boolean,
) {
  if (canManageWorkspace) return true;
  const managerSomewhere = await prisma.projectMember.count({
    where: {
      userId,
      role: "PROJECT_MANAGER",
      project: { workspaceId, deletedAt: null },
    },
  });
  return managerSomewhere > 0;
}

async function assertCanManageLabels(
  workspaceId: string,
  userId: string,
  canManageWorkspace: boolean,
) {
  if (!(await canManageLabels(workspaceId, userId, canManageWorkspace))) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only workspace admins and project managers manage labels",
    );
  }
}

export async function listLabels(workspaceId: string) {
  const labels = await prisma.label.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
  return labels.map(toLabelDto);
}

export async function createLabel(
  tenant: Tenant,
  workspace: Workspace,
  userId: string,
  canManageWorkspace: boolean,
  input: { name: string; color: string },
) {
  await assertCanManageLabels(workspace.id, userId, canManageWorkspace);
  try {
    const label = await prisma.label.create({
      data: { organizationId: tenant.organization.id, workspaceId: workspace.id, ...input },
    });
    return toLabelDto(label);
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
}

/** Finds a label of this organization in a workspace you can open, or "not found". */
async function loadLabel(tenant: Tenant, labelId: string, userId: string) {
  const label = await prisma.label.findFirst({
    where: { id: labelId, organizationId: tenant.organization.id, workspace: { deletedAt: null } },
    include: { workspace: { select: { slug: true } } },
  });
  if (!label) throw new AppError(404, "NOT_FOUND", "Label not found");
  const { canManage } = await loadWorkspace(tenant, label.workspace.slug, userId);
  await assertCanManageLabels(label.workspaceId, userId, canManage);
  return label;
}

export async function updateLabel(
  tenant: Tenant,
  labelId: string,
  userId: string,
  input: { name?: string; color?: string },
) {
  const label = await loadLabel(tenant, labelId, userId);
  try {
    return toLabelDto(await prisma.label.update({ where: { id: label.id }, data: input }));
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
}

/** Removes the label from every task too (TaskLabel rows cascade). */
export async function deleteLabel(tenant: Tenant, labelId: string, userId: string) {
  const label = await loadLabel(tenant, labelId, userId);
  await prisma.label.delete({ where: { id: label.id } });
}
