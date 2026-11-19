import { SquareCheckBig } from "lucide-react";
import { useParams } from "react-router";
import { PlaceholderPage } from "./PlaceholderPage";

// Placeholder pages whose title comes from the address.

/** /:org/:ws/tasks/NEX-42 */
export function TaskPage() {
  const { taskKey = "" } = useParams();
  return (
    <PlaceholderPage
      title={taskKey}
      description="Task details: status, assignees, dates, subtasks, comments and history."
      phase="Phase 5"
      comingSoon="Every property of the task, its description, subtasks, dependencies, files and activity."
      icon={SquareCheckBig}
    />
  );
}
