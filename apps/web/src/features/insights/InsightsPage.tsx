import { useState } from "react";
import { PageHeader } from "../../components/common/PageHeader";
import { useWorkspace } from "../../hooks/useWorkspace";
import { useProjectOutlet } from "../../pages/ProjectLayout";
import { selectClass } from "../tasks/taskBits";
import { AiInsightsTools, AiProjectTools } from "../ai/AiProjectTools";
import { InsightsView } from "./InsightsView";

// /:org/:ws/insights and a project's Overview tab (PRD §11.12).

const RANGES = [7, 30, 90] as const;

function RangePicker({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  return (
    <select
      aria-label="Time range"
      className={selectClass}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      {RANGES.map((days) => (
        <option key={days} value={days}>
          Last {days} days
        </option>
      ))}
    </select>
  );
}

export default function InsightsPage() {
  const context = useWorkspace();
  const [range, setRange] = useState(30);
  if (!context) return null;
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        title="Insights"
        description={`How work is going across the projects you can open in ${context.workspace.name}.`}
        actions={<RangePicker value={range} onChange={setRange} />}
      />
      <AiInsightsTools context={context} />
      <InsightsView context={context} range={range} />
    </div>
  );
}

export function ProjectOverviewPage() {
  const { project, context } = useProjectOutlet();
  const [range, setRange] = useState(30);
  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AiProjectTools orgSlug={context.organization.slug} project={project} />
        <div className="ml-auto">
          <RangePicker value={range} onChange={setRange} />
        </div>
      </div>
      <InsightsView context={context} range={range} projectId={project.id} />
    </div>
  );
}
