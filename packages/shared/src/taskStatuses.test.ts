import { describe, expect, it } from "vitest";
import { DEFAULT_TASK_STATUSES, STATUS_CATEGORIES } from "./taskStatuses.ts";

describe("default task statuses", () => {
  it("covers each of the six categories exactly once, in board order", () => {
    expect(DEFAULT_TASK_STATUSES.map((status) => status.category)).toEqual([...STATUS_CATEGORIES]);
  });

  it("marks exactly one status as the default for new tasks", () => {
    expect(DEFAULT_TASK_STATUSES.filter((status) => status.isDefault)).toHaveLength(1);
  });

  it("uses colors the database accepts (# plus six hex digits)", () => {
    for (const status of DEFAULT_TASK_STATUSES) {
      expect(status.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
