// The six status categories every Kanban column belongs to (PRD §11.6.2).
export const STATUS_CATEGORIES = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "BLOCKED",
  "DONE",
] as const;

export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

// The columns every new project starts with, left to right. New tasks start in
// the one marked isDefault.
export const DEFAULT_TASK_STATUSES = [
  { name: "Backlog", category: "BACKLOG", color: "#94A3B8", isDefault: false },
  { name: "Todo", category: "TODO", color: "#2563EB", isDefault: true },
  { name: "In Progress", category: "IN_PROGRESS", color: "#4F46E5", isDefault: false },
  { name: "In Review", category: "IN_REVIEW", color: "#7C3AED", isDefault: false },
  { name: "Blocked", category: "BLOCKED", color: "#DC2626", isDefault: false },
  { name: "Done", category: "DONE", color: "#16A34A", isDefault: false },
] as const satisfies readonly {
  name: string;
  category: StatusCategory;
  color: string;
  isDefault: boolean;
}[];
