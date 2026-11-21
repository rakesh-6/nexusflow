import type { ProjectPlanOutput, ProjectSummary } from "@nexusflow/shared";
import { useState } from "react";
import type { WorkspaceContext } from "../../hooks/useWorkspace";
import { useChangeMilestones } from "../projects/hooks";
import { useCreateTask } from "../tasks/hooks";
import { AiButton, AiError, AiGate, AiPreview } from "./AiParts";
import { useAiAvailable, useAiInsights, useProjectPlan, useProjectSummary } from "./hooks";

// AI on the project Overview tab (summary, starting plan) and on Insights
// (PRD §11.16.2). Previews only; a plan is created only after "Create".

export function AiProjectTools({ orgSlug, project }: { orgSlug: string; project: ProjectSummary }) {
  const available = useAiAvailable(orgSlug);
  const summary = useProjectSummary(orgSlug);
  const plan = useProjectPlan(orgSlug);
  if (!available) return null;
  const canPlan = project.access.canManage && project.status !== "ARCHIVED";

  return (
    <div className="space-y-3">
      <AiGate>
        <div className="flex flex-wrap gap-2">
          <AiButton
            busy={summary.isPending}
            onClick={() => summary.mutate({ projectId: project.id })}
          >
            Summarize this project
          </AiButton>
          {canPlan && (
            <AiButton busy={plan.isPending} onClick={() => plan.mutate({ projectId: project.id })}>
              Suggest a plan
            </AiButton>
          )}
        </div>
      </AiGate>
      <AiError error={summary.error ?? plan.error} />
      {summary.data && (
        <AiPreview title="Project summary" onDiscard={() => summary.reset()}>
          <p className="whitespace-pre-line">{summary.data.summary}</p>
          <BulletList title="Going well" items={summary.data.highlights} />
          <BulletList title="Risks" items={summary.data.risks} />
        </AiPreview>
      )}
      {plan.data && (
        <PlanPreview
          orgSlug={orgSlug}
          projectId={project.id}
          plan={plan.data}
          onDone={() => plan.reset()}
        />
      )}
    </div>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="font-medium">{title}</p>
      <ul className="list-disc pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Creates the suggested milestones, then the tasks linked to them. */
function PlanPreview({
  orgSlug,
  projectId,
  plan,
  onDone,
}: {
  orgSlug: string;
  projectId: string;
  plan: ProjectPlanOutput;
  onDone: () => void;
}) {
  const milestones = useChangeMilestones(orgSlug, projectId);
  const tasks = useCreateTask(orgSlug, projectId);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function accept() {
    setCreating(true);
    setError(null);
    try {
      const ids: (string | null)[] = [];
      for (const milestone of plan.milestones) {
        const all = await milestones.mutateAsync({
          kind: "create",
          name: milestone.name,
          dueDate: milestone.dueDate ?? null,
        });
        ids.push(all.find((m) => m.name === milestone.name)?.id ?? null);
      }
      for (const task of plan.tasks) {
        const milestoneId = task.milestoneIndex != null ? ids[task.milestoneIndex] : null;
        await tasks.mutateAsync({
          title: task.title,
          ...(milestoneId ? { milestoneId } : {}),
          ...(task.priority ? { priority: task.priority } : {}),
          ...(task.estimatedHours ? { estimatedHours: task.estimatedHours } : {}),
        });
      }
      onDone();
    } catch (failure) {
      setError(failure);
    } finally {
      setCreating(false);
    }
  }

  return (
    <AiPreview
      title="Suggested plan"
      acceptLabel={`Create ${plan.milestones.length} milestones and ${plan.tasks.length} tasks`}
      onAccept={() => void accept()}
      accepting={creating}
      onDiscard={onDone}
    >
      {plan.milestones.map((milestone, index) => (
        <div key={index} className="mt-2">
          <p className="font-medium">
            {milestone.name}
            {milestone.dueDate ? ` · ${milestone.dueDate}` : ""}
          </p>
          <ul className="list-disc pl-5">
            {plan.tasks
              .filter((task) => task.milestoneIndex === index)
              .map((task) => (
                <li key={task.title}>{task.title}</li>
              ))}
          </ul>
        </div>
      ))}
      {plan.tasks.some((task) => task.milestoneIndex == null) && (
        <BulletList
          title="Other tasks"
          items={plan.tasks.filter((task) => task.milestoneIndex == null).map((task) => task.title)}
        />
      )}
      <AiError error={error} />
    </AiPreview>
  );
}

export function AiInsightsTools({ context }: { context: WorkspaceContext }) {
  const orgSlug = context.organization.slug;
  const available = useAiAvailable(orgSlug);
  const insights = useAiInsights(orgSlug);
  if (!available) return null;
  return (
    <div className="space-y-3">
      <AiGate>
        <AiButton
          busy={insights.isPending}
          onClick={() => insights.mutate({ workspaceId: context.workspace.id })}
        >
          Explain these numbers
        </AiButton>
      </AiGate>
      <AiError error={insights.error} />
      {insights.data && (
        <AiPreview title="Insights" onDiscard={() => insights.reset()}>
          <ul className="space-y-1.5">
            {insights.data.insights.map((insight) => (
              <li key={insight.title}>
                <span className="font-medium">{insight.title}.</span> {insight.detail}
              </li>
            ))}
          </ul>
        </AiPreview>
      )}
    </div>
  );
}
