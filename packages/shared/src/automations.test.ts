import { describe, expect, it } from "vitest";
import {
  actionSchema,
  conditionPasses,
  conditionsPass,
  createAutomationSchema,
  describeAutomation,
  RECIPES,
  type TaskSnapshot,
} from "./automations.ts";

const task: TaskSnapshot = {
  statusId: "0190a000-0000-7000-8000-000000000001",
  statusCategory: "IN_PROGRESS",
  priority: "HIGH",
  assigneeIds: ["a"],
  labelIds: [],
  dueDate: "2026-11-25",
  estimatedHours: 3,
};

describe("conditions", () => {
  it("compares single values, lists and emptiness", () => {
    expect(conditionPasses(task, { field: "priority", op: "eq", value: "HIGH" })).toBe(true);
    expect(conditionPasses(task, { field: "priority", op: "neq", value: "HIGH" })).toBe(false);
    expect(
      conditionPasses(task, { field: "status.category", op: "in", value: ["TODO", "IN_PROGRESS"] }),
    ).toBe(true);
    expect(conditionPasses(task, { field: "assigneeIds", op: "contains", value: "a" })).toBe(true);
    expect(conditionPasses(task, { field: "assigneeIds", op: "notIn", value: ["b"] })).toBe(true);
    expect(conditionPasses(task, { field: "labelIds", op: "isEmpty" })).toBe(true);
    expect(conditionPasses(task, { field: "dueDate", op: "isNotEmpty" })).toBe(true);
  });

  it("orders priorities, dates and numbers", () => {
    expect(conditionPasses(task, { field: "priority", op: "gte", value: "MEDIUM" })).toBe(true);
    expect(conditionPasses(task, { field: "priority", op: "gte", value: "URGENT" })).toBe(false);
    expect(conditionPasses(task, { field: "dueDate", op: "lte", value: "2026-11-30" })).toBe(true);
    expect(conditionPasses(task, { field: "estimatedHours", op: "gte", value: 5 })).toBe(false);
    expect(
      conditionPasses(
        { ...task, dueDate: null },
        { field: "dueDate", op: "lte", value: "2026-11-30" },
      ),
    ).toBe(false);
  });

  it("needs every condition to pass", () => {
    expect(conditionsPass(task, [])).toBe(true);
    expect(
      conditionsPass(task, [
        { field: "priority", op: "eq", value: "HIGH" },
        { field: "labelIds", op: "isNotEmpty" },
      ]),
    ).toBe(false);
  });
});

describe("rules", () => {
  it("accepts every recipe as a valid rule", () => {
    for (const recipe of RECIPES) {
      const parsed = createAutomationSchema.safeParse({ name: recipe.name, ...recipe.rule });
      expect(parsed.success, recipe.id).toBe(true);
    }
  });

  it("refuses incomplete actions", () => {
    expect(actionSchema.safeParse({ type: "SET_STATUS" }).success).toBe(false);
    expect(
      actionSchema.safeParse({ type: "SET_DUE_DATE", relativeDays: 2, date: "2026-12-01" }).success,
    ).toBe(false);
    expect(
      actionSchema.safeParse({
        type: "NOTIFY",
        recipients: { roles: [], userIds: [] },
        message: "Hi",
      }).success,
    ).toBe(false);
  });

  it("describes a rule in one sentence", () => {
    expect(
      describeAutomation({
        trigger: { type: "TASK_STATUS_CHANGED", toCategory: "DONE" },
        conditions: [{ field: "priority", op: "eq", value: "URGENT" }],
        actions: [
          {
            type: "NOTIFY",
            recipients: { roles: ["PROJECT_MANAGER"], userIds: [] },
            message: "Done",
          },
        ],
      }),
    ).toBe(
      "When a task's status changes to done, if priority is urgent, then notify project managers.",
    );
  });
});
