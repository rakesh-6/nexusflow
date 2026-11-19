import { useParams } from "react-router";
import { useWorkspace } from "../../hooks/useWorkspace";
import { NotFoundPage } from "../../pages/NotFoundPage";
import TaskDetailView from "./detail/TaskDetailView";

// /:org/:ws/tasks/NEX-42: a task on its own page, e.g. from a shared link.
export default function TaskPage() {
  const { taskKey = "" } = useParams();
  const context = useWorkspace();
  if (!context) return <NotFoundPage />;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="rounded-card border bg-card shadow-sm">
        <TaskDetailView key={taskKey} taskKey={taskKey} context={context} variant="page" />
      </div>
    </div>
  );
}
