import { CircleCheck, FolderPlus, Target, UserPlus } from "lucide-react";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { StatusCard } from "../components/StatusCard";
import { Button } from "../components/ui/button";
import { useSystemStatus } from "../hooks/useSystemStatus";
import { useWorkspace } from "../hooks/useWorkspace";
import { SAMPLE_USER } from "../lib/sampleData";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const GETTING_STARTED = [
  { icon: FolderPlus, label: "Create your first project", phase: "Phase 4" },
  { icon: CircleCheck, label: "Add and assign a task", phase: "Phase 5" },
  { icon: UserPlus, label: "Invite your teammates", phase: "Phase 3" },
];

// Home (PRD §14.2): "My Focus" arrives in Phase 8. For now it shows the
// getting-started checklist and the live system status from step 7a.
export default function HomePage() {
  const context = useWorkspace();
  const { api, database, recheck } = useSystemStatus();
  const firstName = SAMPLE_USER.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={`Here is what is happening in ${context?.workspace.name ?? "your workspace"}.`}
      />

      <section aria-labelledby="start-heading" className="space-y-3">
        <h2 id="start-heading" className="text-lg font-semibold">
          Getting started
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {GETTING_STARTED.map((item) => (
            <li
              key={item.label}
              className="flex items-start gap-3 rounded-card border bg-card p-4 shadow-sm"
            >
              <item.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">Available in {item.phase}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="focus-heading" className="space-y-3">
        <h2 id="focus-heading" className="text-lg font-semibold">
          My focus
        </h2>
        <EmptyState
          icon={Target}
          title="Nothing due yet"
          description="Tasks assigned to you, due this week, and mentions will appear here (Phase 8)."
        />
      </section>

      <section aria-labelledby="status-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="status-heading" className="text-lg font-semibold">
            System status
          </h2>
          <Button variant="outline" size="sm" onClick={recheck}>
            Check again
          </Button>
        </div>
        <div aria-live="polite" className="grid gap-4 sm:grid-cols-2">
          <StatusCard title="API server" description="Express on port 4000" state={api} />
          <StatusCard
            title="Database"
            description="Neon PostgreSQL. The first check after a pause can take a few seconds."
            state={database}
          />
        </div>
      </section>
    </div>
  );
}
