import { describe, expect, it } from "vitest";
import { dueGroup, isOverdue, monthGrid, todayIn } from "./dates.ts";
import { docToText, richTextDocSchema } from "./richText.ts";
import {
  bulkTaskSchema,
  createTaskSchema,
  freshPositions,
  parseTaskKey,
  positionBetween,
  taskQuerySchema,
  wouldCreateCycle,
} from "./tasks.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("dependency cycles (AC-TASK-03)", () => {
  const edges = [
    { blockingTaskId: "A", blockedTaskId: "B" },
    { blockingTaskId: "B", blockedTaskId: "C" },
  ];

  it("finds two- and three-task loops and self-links", () => {
    expect(wouldCreateCycle(edges, "B", "A")).toBe(true);
    expect(wouldCreateCycle(edges, "C", "A")).toBe(true);
    expect(wouldCreateCycle(edges, "A", "A")).toBe(true);
  });

  it("allows links that do not close a loop", () => {
    expect(wouldCreateCycle(edges, "A", "C")).toBe(false);
    expect(wouldCreateCycle(edges, "D", "A")).toBe(false);
  });
});

describe("card positions", () => {
  it("puts a new key between its neighbours, byte order", () => {
    const [first, second] = freshPositions(2) as [string, string];
    const middle = positionBetween(first, second) as string;
    expect([second, middle, first].sort()).toEqual([first, middle, second]);
    expect(positionBetween(null, first)! < first).toBe(true);
    expect(positionBetween(second, null)! > second).toBe(true);
  });

  it("answers null for neighbours in the wrong order", () => {
    const [first, second] = freshPositions(2) as [string, string];
    expect(positionBetween(second, first)).toBeNull();
  });
});

describe("dates", () => {
  it("uses the person's time zone for today", () => {
    const now = new Date("2026-11-18T20:00:00Z");
    expect(todayIn("Asia/Kolkata", now)).toBe("2026-11-19");
    expect(todayIn("America/New_York", now)).toBe("2026-11-18");
    expect(todayIn("Not/AZone", now)).toBe("2026-11-18");
  });

  it("groups due dates for My Tasks (Wednesday 2026-11-18)", () => {
    const today = "2026-11-18";
    expect(dueGroup("2026-11-17", today)).toBe("OVERDUE");
    expect(dueGroup(today, today)).toBe("TODAY");
    expect(dueGroup("2026-11-22", today)).toBe("THIS_WEEK");
    expect(dueGroup("2026-11-23", today)).toBe("LATER");
    expect(dueGroup(null, today)).toBe("NO_DATE");
    expect(isOverdue("2026-11-17", "DONE", today)).toBe(false);
  });

  it("builds a six-week month grid starting on Monday", () => {
    const grid = monthGrid("2026-11-18");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-10-26");
    expect(grid[41]).toBe("2026-12-06");
  });
});

describe("task schemas", () => {
  it("rejects a due date before the start date", () => {
    const result = createTaskSchema.safeParse({
      title: "Plan",
      startDate: "2026-11-20",
      dueDate: "2026-11-19",
    });
    expect(result.success).toBe(false);
    expect(createTaskSchema.parse({ title: "Plan" })).toMatchObject({ priority: "MEDIUM" });
  });

  it("accepts estimates in quarter hours only", () => {
    expect(createTaskSchema.safeParse({ title: "A", estimatedHours: 1.25 }).success).toBe(true);
    expect(createTaskSchema.safeParse({ title: "A", estimatedHours: 1.1 }).success).toBe(false);
  });

  it("limits bulk changes to 100 tasks (AC-TASK-06)", () => {
    const taskIds = (n: number) => Array.from({ length: n }, (_, i) => id(i));
    const set = { priority: "HIGH" };
    expect(bulkTaskSchema.safeParse({ taskIds: taskIds(100), set }).success).toBe(true);
    expect(bulkTaskSchema.safeParse({ taskIds: taskIds(101), set }).success).toBe(false);
    expect(bulkTaskSchema.safeParse({ taskIds: taskIds(1) }).success).toBe(false);
  });

  it("reads list filters from repeated or comma-separated values", () => {
    const query = taskQuerySchema.parse({
      priority: "HIGH,URGENT",
      assigneeId: ["me", "unassigned"],
      overdue: "true",
      sort: "-priority,dueDate",
    });
    expect(query).toMatchObject({
      priority: ["HIGH", "URGENT"],
      assigneeId: ["me", "unassigned"],
      overdue: true,
      sort: ["-priority", "dueDate"],
      limit: 50,
    });
    expect(taskQuerySchema.safeParse({ sort: "password" }).success).toBe(false);
  });

  it("reads task keys", () => {
    expect(parseTaskKey("nex-42")).toEqual({ projectKey: "NEX", number: 42 });
    expect(parseTaskKey("NEX42")).toBeNull();
  });
});

describe("rich text", () => {
  const doc = (content: unknown[]) => ({ type: "doc", content });
  const paragraph = (text: string, marks?: unknown[]) => ({
    type: "paragraph",
    content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
  });

  it("accepts editor documents and extracts their text", () => {
    const value = doc([
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Goal" }] },
      paragraph("Ship it", [{ type: "link", attrs: { href: "https://example.com" } }]),
    ]);
    const parsed = richTextDocSchema.parse(value);
    expect(docToText(parsed)).toBe("Goal\nShip it");
  });

  it("refuses unknown nodes, unsafe links and deep nesting", () => {
    expect(richTextDocSchema.safeParse(doc([{ type: "script" }])).success).toBe(false);
    const unsafe = paragraph("x", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]);
    expect(richTextDocSchema.safeParse(doc([unsafe])).success).toBe(false);
    let deep: Record<string, unknown> = { type: "paragraph" };
    for (let i = 0; i < 30; i++) deep = { type: "blockquote", content: [deep] };
    expect(richTextDocSchema.safeParse(doc([deep])).success).toBe(false);
  });
});
