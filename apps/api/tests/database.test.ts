import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.ts";
import {
  createOrganizationFixture,
  inRollbackTransaction,
  isCheckViolation,
} from "./helpers/database.ts";

// The database's own rules (PRD §17). Every test runs in a transaction that is
// undone afterwards, so the test database stays empty.

afterAll(async () => {
  await prisma.$disconnect();
});

describe("database rules", () => {
  it("allows only one OWNER per organization", async () => {
    await expect(
      inRollbackTransaction(async (tx) => {
        const { organization } = await createOrganizationFixture(tx);
        const second = await tx.user.create({
          data: { email: "second@test.example", name: "Second" },
        });
        await tx.organizationMember.create({
          data: { organizationId: organization.id, userId: second.id, role: "OWNER" },
        });
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("treats emails with different capital letters as the same email", async () => {
    await expect(
      inRollbackTransaction(async (tx) => {
        await tx.user.create({ data: { email: "Same@Test.example", name: "One" } });
        await tx.user.create({ data: { email: "same@test.EXAMPLE", name: "Two" } });
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("gives tasks consecutive numbers and never repeats one inside a project", async () => {
    const numbers = await inRollbackTransaction(async (tx) => {
      const { createTask } = await createOrganizationFixture(tx);
      const first = await createTask("First");
      const second = await createTask("Second");
      return [first.number, second.number];
    });
    expect(numbers).toEqual([1, 2]);

    await expect(
      inRollbackTransaction(async (tx) => {
        const { createTask } = await createOrganizationFixture(tx);
        const task = await createTask("First");
        await createTask("Duplicate", { number: task.number });
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects a due date before the start date", async () => {
    const error = await inRollbackTransaction(async (tx) => {
      const { createTask } = await createOrganizationFixture(tx);
      await createTask("Backwards", {
        startDate: new Date("2026-12-10"),
        dueDate: new Date("2026-12-01"),
      });
    }).catch((caught: unknown) => caught);
    expect(isCheckViolation(error)).toBe(true);
  });

  it("rejects a task that blocks itself", async () => {
    const error = await inRollbackTransaction(async (tx) => {
      const { createTask, organization, owner } = await createOrganizationFixture(tx);
      const task = await createTask("Loop");
      await tx.taskDependency.create({
        data: {
          organizationId: organization.id,
          blockingTaskId: task.id,
          blockedTaskId: task.id,
          createdById: owner.id,
        },
      });
    }).catch((caught: unknown) => caught);
    expect(isCheckViolation(error)).toBe(true);
  });

  it("deleting a project also deletes its tasks and statuses", async () => {
    const remaining = await inRollbackTransaction(async (tx) => {
      const { createTask, project } = await createOrganizationFixture(tx);
      const parent = await createTask("Parent");
      await createTask("Child", { parentTaskId: parent.id });
      await tx.project.delete({ where: { id: project.id } });
      return (
        (await tx.task.count({ where: { projectId: project.id } })) +
        (await tx.taskStatus.count({ where: { projectId: project.id } }))
      );
    });
    expect(remaining).toBe(0);
  });

  it("finds tasks by words in their title (full-text search column)", async () => {
    const titles = await inRollbackTransaction(async (tx) => {
      const { createTask, organization } = await createOrganizationFixture(tx);
      await createTask("Build Kanban board drag and drop");
      await createTask("Write launch email");
      const rows = await tx.$queryRaw<{ title: string }[]>`
        SELECT title FROM "Task"
        WHERE "organizationId" = ${organization.id}::uuid
          AND "searchVector" @@ websearch_to_tsquery('simple', 'kanban board')`;
      return rows.map((row) => row.title);
    });
    expect(titles).toEqual(["Build Kanban board drag and drop"]);
  });
});
