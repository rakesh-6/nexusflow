import { Dialog as Primitive } from "radix-ui";
import { lazy, Suspense, useCallback } from "react";
import { useSearchParams } from "react-router";
import { Skeleton } from "../../components/ui/skeleton";
import type { WorkspaceContext } from "../../hooks/useWorkspace";

// A task opens in a panel on the right of the board, list or calendar; the
// address gets ?task=NEX-42, so the panel can be linked and Back closes it.

const TaskDetailView = lazy(() => import("./detail/TaskDetailView"));

/** Opens a task in the panel (or switches the panel to another task). */
export function useOpenTask() {
  const [, setParams] = useSearchParams();
  return useCallback(
    (key: string) =>
      setParams((current) => {
        const next = new URLSearchParams(current);
        next.set("task", key);
        return next;
      }),
    [setParams],
  );
}

export function TaskPanel({ context }: { context: WorkspaceContext }) {
  const [params, setParams] = useSearchParams();
  const taskKey = params.get("task");
  const close = () =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("task");
      return next;
    });

  return (
    <Primitive.Root open={!!taskKey} onOpenChange={(open) => !open && close()}>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Primitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col overflow-y-auto border-l bg-card shadow-xl focus:outline-none"
        >
          <Primitive.Title className="sr-only">Task {taskKey}</Primitive.Title>
          {taskKey && (
            <Suspense fallback={<Skeleton className="m-6 h-64" />}>
              <TaskDetailView taskKey={taskKey} context={context} onClose={close} />
            </Suspense>
          )}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
