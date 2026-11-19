import type { Priority, TaskFilters } from "@nexusflow/shared";
import { useDeferredValue, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";

// The filter bar's choices live in the address (?assignee=me&priority=HIGH),
// so a filtered board can be bookmarked or shared and survives a reload.

const LISTS = ["assignee", "priority", "label"] as const;
type ListName = (typeof LISTS)[number];

export function useTaskFilters() {
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const q = useDeferredValue(search.trim());
  const list = (name: ListName) => params.get(name)?.split(",").filter(Boolean) ?? [];
  const assignee = list("assignee");
  const priority = list("priority") as Priority[];
  const label = list("label");
  const overdue = params.get("overdue") === "1";
  const signature = [q, assignee, priority, label, overdue].join("|");

  const filters = useMemo<TaskFilters>(
    () => ({
      ...(q ? { q } : {}),
      ...(assignee.length ? { assigneeId: assignee } : {}),
      ...(priority.length ? { priority } : {}),
      ...(label.length ? { labelId: label } : {}),
      ...(overdue ? { overdue: true } : {}),
    }),
    // The signature text covers every value, so the object only changes when a filter does.
    [signature],
  );

  const update = (change: (next: URLSearchParams) => void) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        change(next);
        return next;
      },
      { replace: true },
    );

  return {
    filters,
    search,
    assignee,
    priority,
    label,
    overdue,
    active: Boolean(q || assignee.length || priority.length || label.length || overdue),
    setSearch: (value: string) =>
      update((next) => (value ? next.set("q", value) : next.delete("q"))),
    setList: (name: ListName, values: string[]) =>
      update((next) => (values.length ? next.set(name, values.join(",")) : next.delete(name))),
    setOverdue: (on: boolean) =>
      update((next) => (on ? next.set("overdue", "1") : next.delete("overdue"))),
    clear: () =>
      update((next) => {
        for (const name of [...LISTS, "q", "overdue"]) next.delete(name);
      }),
  };
}

export type TaskFilterState = ReturnType<typeof useTaskFilters>;

/** Runs `handler` when `key` is pressed outside text fields (e.g. "c" for a new task). */
export function useShortcut(key: string, handler: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "") ||
        document.querySelector("[role=dialog]");
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === key) {
        event.preventDefault();
        handler();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, handler, enabled]);
}
