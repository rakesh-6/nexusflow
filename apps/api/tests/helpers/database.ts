import { randomUUID } from "node:crypto";
import { DEFAULT_TASK_STATUSES } from "@nexusflow/shared";
import type { Prisma } from "../../src/generated/prisma/client.ts";
import { prisma } from "../../src/lib/prisma.ts";

export type Tx = Prisma.TransactionClient;

const ROLLBACK = Symbol("rollback");

/**
 * Runs `work` inside a database transaction that is always undone afterwards,
 * so tests never leave data behind. Returns what `work` returned; if `work`
 * fails, its error is thrown so the test can check it.
 */
export async function inRollbackTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  let result: T | undefined;
  try {
    await prisma.$transaction(async (tx) => {
      result = await work(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
  return result as T;
}

/** True when PostgreSQL rejected a row because it broke a CHECK rule (error 23514). */
export function isCheckViolation(error: unknown): boolean {
  const { code, message, meta } = error as { code?: string; message?: string; meta?: unknown };
  const text = `${code ?? ""} ${message ?? ""} ${JSON.stringify(meta ?? {})}`;
  return text.includes("23514") || /check constraint/i.test(text);
}

/**
 * Builds a small organization inside `tx`: an owner, a workspace and one project
 * with the six default statuses. Names get a random suffix so they never clash.
 */
export async function createOrganizationFixture(tx: Tx) {
  const suffix = randomUUID().slice(0, 8);
  const owner = await tx.user.create({
    data: { email: `owner-${suffix}@test.example`, name: "Test Owner" },
  });
  const organization = await tx.organization.create({
    data: { name: "Test Org", slug: `test-${suffix}`, ownerId: owner.id },
  });
  await tx.organizationMember.create({
    data: { organizationId: organization.id, userId: owner.id, role: "OWNER" },
  });
  const workspace = await tx.workspace.create({
    data: {
      organizationId: organization.id,
      name: "General",
      slug: "general",
      isDefault: true,
      createdById: owner.id,
    },
  });
  const project = await tx.project.create({
    data: {
      organizationId: organization.id,
      workspaceId: workspace.id,
      key: "TST",
      name: "Test Project",
      ownerId: owner.id,
      createdById: owner.id,
    },
  });
  const statuses = await tx.taskStatus.createManyAndReturn({
    data: DEFAULT_TASK_STATUSES.map((status, position) => ({
      organizationId: organization.id,
      projectId: project.id,
      ...status,
      position,
    })),
  });
  const defaultStatus = statuses.find((status) => status.isDefault);
  if (!defaultStatus) throw new Error("Fixture has no default status");

  // Creates a task the way the app will: take the next number from the project counter.
  async function createTask(title: string, extra: Partial<Prisma.TaskUncheckedCreateInput> = {}) {
    const { taskSequence } = await tx.project.update({
      where: { id: project.id },
      data: { taskSequence: { increment: 1 } },
    });
    return tx.task.create({
      data: {
        organizationId: organization.id,
        projectId: project.id,
        number: taskSequence,
        title,
        statusId: defaultStatus!.id,
        reporterId: owner.id,
        createdById: owner.id,
        position: `a${taskSequence}`,
        ...extra,
      },
    });
  }

  return { owner, organization, workspace, project, statuses, createTask };
}
