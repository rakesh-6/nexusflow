import { SquareCheckBig, Users } from "lucide-react";
import { useParams } from "react-router";
import { NotFoundPage } from "./NotFoundPage";
import { PlaceholderPage } from "./PlaceholderPage";
import { ORG_SETTINGS_SECTIONS } from "./settings/orgSettingsSections";

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

/** /:org/:ws/teams/engineering */
export function TeamPage() {
  const { teamSlug = "" } = useParams();
  const name = teamSlug.charAt(0).toUpperCase() + teamSlug.slice(1);
  return (
    <PlaceholderPage
      title={name}
      description="Team members, projects, activity and analytics."
      phase="Phase 4"
      comingSoon="The team's lead and members, its projects, recent activity and productivity."
      icon={Users}
    />
  );
}

/** /:org/settings/org/members and the other admin panel sections */
export function OrgSettingsPage() {
  const { section = "" } = useParams();
  const meta = ORG_SETTINGS_SECTIONS[section];
  if (!meta) return <NotFoundPage />;
  return <PlaceholderPage {...meta} />;
}
